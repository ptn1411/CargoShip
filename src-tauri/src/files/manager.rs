use super::models::*;
use crate::cache::{CacheFileInput, CacheManager};
use crate::credentials::CredentialStore;
use crate::error::{AppError, Result};
use crate::server::Server;
use crate::ssh::{authenticate_session, create_ssh_session, SshKeyManager};
use chrono::Utc;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;

/// Large file threshold: 10MB
const LARGE_FILE_THRESHOLD: u64 = 10 * 1024 * 1024;

/// Maximum retry attempts for save operations
const MAX_RETRY_ATTEMPTS: u32 = 3;

/// Base delay for exponential backoff in milliseconds
const BASE_RETRY_DELAY_MS: u64 = 1000;

/// Manages file operations (download, upload, create, delete, rename)
pub struct FileManager {
    credential_store: Arc<CredentialStore>,
    cache_manager: Arc<CacheManager>,
    /// Cached sudo passwords per server (server_id -> password)
    sudo_passwords: Arc<RwLock<std::collections::HashMap<String, String>>>,
    ssh_key_manager: Option<Arc<SshKeyManager>>,
}

impl FileManager {
    /// Create a new FileManager
    pub fn new(credential_store: Arc<CredentialStore>, cache_manager: Arc<CacheManager>) -> Self {
        Self {
            credential_store,
            cache_manager,
            sudo_passwords: Arc::new(RwLock::new(std::collections::HashMap::new())),
            ssh_key_manager: None,
        }
    }

    pub fn with_key_manager(
        credential_store: Arc<CredentialStore>, 
        cache_manager: Arc<CacheManager>,
        ssh_key_manager: Arc<SshKeyManager>
    ) -> Self {
        Self {
            credential_store,
            cache_manager,
            sudo_passwords: Arc::new(RwLock::new(std::collections::HashMap::new())),
            ssh_key_manager: Some(ssh_key_manager),
        }
    }

    /// Get a reference to the cache manager
    pub fn cache_manager(&self) -> &Arc<CacheManager> {
        &self.cache_manager
    }

    /// Set sudo password for a server
    pub async fn set_sudo_password(&self, server_id: &str, password: &str) {
        let mut passwords = self.sudo_passwords.write().await;
        passwords.insert(server_id.to_string(), password.to_string());
    }

    /// Clear sudo password for a server
    pub async fn clear_sudo_password(&self, server_id: &str) {
        let mut passwords = self.sudo_passwords.write().await;
        passwords.remove(server_id);
    }

    /// Get sudo password for a server
    async fn get_sudo_password(&self, server_id: &str) -> Option<String> {
        let passwords = self.sudo_passwords.read().await;
        passwords.get(server_id).cloned()
    }

    /// Execute a command via SSH, optionally with sudo
    /// If use_sudo is true and sudo password is set, uses sudo -S to pass password via stdin
    #[allow(dead_code)]
    fn exec_command(
        &self,
        session: &ssh2::Session,
        command: &str,
        use_sudo: bool,
    ) -> Result<String> {
        self.exec_command_with_sudo_password(session, command, use_sudo, None)
    }

    /// Execute a command via SSH with optional sudo password
    fn exec_command_with_sudo_password(
        &self,
        session: &ssh2::Session,
        command: &str,
        use_sudo: bool,
        sudo_password: Option<&str>,
    ) -> Result<String> {
        let mut channel = session
            .channel_session()
            .map_err(|e| AppError::FileOperationFailed(format!("Failed to open channel: {}", e)))?;

        if use_sudo {
            if let Some(password) = sudo_password {
                // Use sudo -S to read password from stdin
                let full_command = format!(
                    "echo '{}' | sudo -S {}",
                    password.replace("'", "'\\''"),
                    command
                );
                channel.exec(&full_command).map_err(|e| {
                    AppError::FileOperationFailed(format!("Failed to execute command: {}", e))
                })?;
            } else {
                // Try sudo without password (for NOPASSWD configured users)
                let full_command = format!("sudo -n {}", command);
                channel.exec(&full_command).map_err(|e| {
                    AppError::FileOperationFailed(format!("Failed to execute command: {}", e))
                })?;
            }
        } else {
            channel.exec(command).map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to execute command: {}", e))
            })?;
        }

        let mut output = String::new();
        channel
            .read_to_string(&mut output)
            .map_err(|e| AppError::FileOperationFailed(format!("Failed to read output: {}", e)))?;

        let mut stderr = String::new();
        channel.stderr().read_to_string(&mut stderr).ok();

        channel.wait_close().ok();
        let exit_status = channel.exit_status().unwrap_or(-1);

        if exit_status != 0 {
            let error_msg = if !stderr.is_empty() {
                stderr
            } else {
                output.clone()
            };
            // Check if it's a sudo password error
            if error_msg.contains("sudo:")
                && (error_msg.contains("password") || error_msg.contains("a terminal is required"))
            {
                return Err(AppError::SudoPasswordRequired);
            }
            return Err(AppError::FileOperationFailed(format!(
                "Command failed (exit {}): {}",
                exit_status,
                error_msg.trim()
            )));
        }

        Ok(output)
    }

    /// Read file content using cat command (supports sudo)
    fn read_file_with_sudo(
        &self,
        session: &ssh2::Session,
        path: &str,
        use_sudo: bool,
        sudo_password: Option<&str>,
    ) -> Result<Vec<u8>> {
        let command = format!("cat '{}'", path.replace("'", "'\\''"));
        let output =
            self.exec_command_with_sudo_password(session, &command, use_sudo, sudo_password)?;
        Ok(output.into_bytes())
    }

    /// Write file content using tee command (supports sudo)
    fn write_file_with_sudo(
        &self,
        session: &ssh2::Session,
        path: &str,
        content: &[u8],
        use_sudo: bool,
        sudo_password: Option<&str>,
    ) -> Result<()> {
        // Use base64 encoding to safely transfer binary content
        let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, content);

        let tee_command = if use_sudo {
            if let Some(password) = sudo_password {
                // Use sudo -S to read password from stdin, then pipe content to tee
                format!(
                    "echo '{}' | sudo -S sh -c \"echo '{}' | base64 -d > '{}'\" 2>/dev/null",
                    password.replace("'", "'\\''"),
                    encoded,
                    path.replace("'", "'\\''")
                )
            } else {
                format!(
                    "echo '{}' | base64 -d | sudo -n tee '{}' > /dev/null",
                    encoded,
                    path.replace("'", "'\\''")
                )
            }
        } else {
            format!(
                "echo '{}' | base64 -d > '{}'",
                encoded,
                path.replace("'", "'\\''")
            )
        };

        let mut channel = session
            .channel_session()
            .map_err(|e| AppError::FileOperationFailed(format!("Failed to open channel: {}", e)))?;

        channel.exec(&tee_command).map_err(|e| {
            AppError::FileOperationFailed(format!("Failed to execute command: {}", e))
        })?;

        let mut stderr = String::new();
        channel.stderr().read_to_string(&mut stderr).ok();

        channel.wait_close().ok();
        let exit_status = channel.exit_status().unwrap_or(-1);

        if exit_status != 0 {
            if stderr.contains("sudo:")
                && (stderr.contains("password") || stderr.contains("a terminal is required"))
            {
                return Err(AppError::SudoPasswordRequired);
            }
            return Err(AppError::FileOperationFailed(format!(
                "Failed to write file: {}",
                stderr.trim()
            )));
        }

        Ok(())
    }

    /// Download a file from the remote server
    /// Returns FileContent with the file data, or an error if the file is too large
    pub async fn download_file(&self, server: &Server, remote_path: &str) -> Result<FileContent> {
        let normalized_path = normalize_path(remote_path);

        // Get cached sudo password if available
        let sudo_password = self.get_sudo_password(&server.id).await;
        let sudo_pwd_ref = sudo_password.as_deref();

        // Create SSH session
        let (session, _tcp) = create_ssh_session(&server.host, server.port)?;
        authenticate_session(&session, server, &self.credential_store, self.ssh_key_manager.as_deref())?;

        // Get file stats using stat command (works with sudo)
        let stat_output = self.exec_command_with_sudo_password(
            &session,
            &format!(
                "stat -c '%s %Y %a' '{}'",
                normalized_path.replace("'", "'\\''")
            ),
            server.use_sudo,
            sudo_pwd_ref,
        )?;

        let parts: Vec<&str> = stat_output.trim().split_whitespace().collect();
        if parts.len() < 3 {
            return Err(AppError::FileOperationFailed(
                "Failed to parse file stats".to_string(),
            ));
        }

        let file_size: u64 = parts[0].parse().unwrap_or(0);
        let modified_at: i64 = parts[1].parse().unwrap_or(0);
        let perm_octal: u32 = u32::from_str_radix(parts[2], 8).unwrap_or(0o644);
        let permissions = format_permissions(0o100000 | perm_octal);

        // Check for large file
        if file_size > LARGE_FILE_THRESHOLD {
            return Err(AppError::FileOperationFailed(format!(
                "File too large: {} bytes (max: {} bytes). Path: {}",
                file_size, LARGE_FILE_THRESHOLD, normalized_path
            )));
        }

        // Read file content
        let content = if server.use_sudo {
            self.read_file_with_sudo(&session, &normalized_path, true, sudo_pwd_ref)?
        } else {
            // Use SFTP for non-sudo (faster)
            let sftp = session.sftp().map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to open SFTP: {}", e))
            })?;

            let mut remote_file = sftp.open(Path::new(&normalized_path)).map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to open file: {}", e))
            })?;

            let mut content = Vec::new();
            remote_file.read_to_end(&mut content).map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to read file: {}", e))
            })?;
            content
        };

        // Cache the file
        let cache_input = CacheFileInput {
            server_id: server.id.clone(),
            remote_path: normalized_path.clone(),
            content: content.clone(),
            remote_modified_at: modified_at,
        };
        self.cache_manager.cache_file(cache_input).await?;

        // Convert content to string (assuming UTF-8)
        let content_str = String::from_utf8_lossy(&content).to_string();

        Ok(FileContent {
            path: normalized_path,
            content: content_str,
            size: file_size,
            modified_at,
            permissions,
            encoding: "utf-8".to_string(),
        })
    }

    /// Check if a file exceeds the large file threshold
    pub fn check_large_file(
        &self,
        server: &Server,
        remote_path: &str,
    ) -> Result<Option<LargeFileWarning>> {
        let normalized_path = normalize_path(remote_path);

        let (session, _tcp) = create_ssh_session(&server.host, server.port)?;
        authenticate_session(&session, server, &self.credential_store, self.ssh_key_manager.as_deref())?;

        let sftp = session
            .sftp()
            .map_err(|e| AppError::FileOperationFailed(format!("Failed to open SFTP: {}", e)))?;

        let stat = sftp
            .stat(Path::new(&normalized_path))
            .map_err(|e| AppError::FileOperationFailed(format!("Failed to stat file: {}", e)))?;

        let file_size = stat.size.unwrap_or(0);

        if file_size > LARGE_FILE_THRESHOLD {
            Ok(Some(LargeFileWarning {
                path: normalized_path,
                size: file_size,
                threshold: LARGE_FILE_THRESHOLD,
            }))
        } else {
            Ok(None)
        }
    }

    /// Save file content to the remote server with backup
    pub async fn save_file(&self, server: &Server, remote_path: &str, content: &str) -> Result<()> {
        let normalized_path = normalize_path(remote_path);

        // Retry with exponential backoff
        let mut last_error = None;

        for attempt in 0..MAX_RETRY_ATTEMPTS {
            if attempt > 0 {
                let delay = calculate_backoff_delay(attempt);
                thread::sleep(delay);
            }

            match self
                .save_file_internal(server, &normalized_path, content)
                .await
            {
                Ok(()) => return Ok(()),
                Err(e) => {
                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| {
            AppError::FileOperationFailed("Save failed after max retries".to_string())
        }))
    }

    /// Internal save implementation
    async fn save_file_internal(
        &self,
        server: &Server,
        remote_path: &str,
        content: &str,
    ) -> Result<()> {
        // Get cached sudo password if available
        let sudo_password = self.get_sudo_password(&server.id).await;
        let sudo_pwd_ref = sudo_password.as_deref();

        let (session, _tcp) = create_ssh_session(&server.host, server.port)?;
        authenticate_session(&session, server, &self.credential_store, self.ssh_key_manager.as_deref())?;

        if server.use_sudo {
            // Use sudo for file operations
            // Check if file exists
            let file_exists = self
                .exec_command_with_sudo_password(
                    &session,
                    &format!(
                        "test -f '{}' && echo 'exists'",
                        remote_path.replace("'", "'\\''")
                    ),
                    true,
                    sudo_pwd_ref,
                )
                .map(|o| o.trim() == "exists")
                .unwrap_or(false);

            if file_exists {
                // Create backup before overwriting
                let backup_path = format!("{}.bak", remote_path);
                self.exec_command_with_sudo_password(
                    &session,
                    &format!(
                        "cp '{}' '{}'",
                        remote_path.replace("'", "'\\''"),
                        backup_path.replace("'", "'\\''")
                    ),
                    true,
                    sudo_pwd_ref,
                )?;

                // Write new content
                if let Err(e) = self.write_file_with_sudo(
                    &session,
                    remote_path,
                    content.as_bytes(),
                    true,
                    sudo_pwd_ref,
                ) {
                    // Restore backup on failure
                    let _ = self.exec_command_with_sudo_password(
                        &session,
                        &format!(
                            "mv '{}' '{}'",
                            backup_path.replace("'", "'\\''"),
                            remote_path.replace("'", "'\\''")
                        ),
                        true,
                        sudo_pwd_ref,
                    );
                    return Err(e);
                }

                // Remove backup on success
                let _ = self.exec_command_with_sudo_password(
                    &session,
                    &format!("rm -f '{}'", backup_path.replace("'", "'\\''")),
                    true,
                    sudo_pwd_ref,
                );
            } else {
                // New file, just write
                self.write_file_with_sudo(
                    &session,
                    remote_path,
                    content.as_bytes(),
                    true,
                    sudo_pwd_ref,
                )?;
            }
        } else {
            // Use SFTP (original implementation)
            let sftp = session.sftp().map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to open SFTP: {}", e))
            })?;

            // Check if file exists and create backup
            let file_exists = sftp.stat(Path::new(remote_path)).is_ok();

            if file_exists {
                // Create backup before overwriting
                let backup_path = format!("{}.bak", remote_path);
                sftp.rename(Path::new(remote_path), Path::new(&backup_path), None)
                    .map_err(|e| {
                        AppError::FileOperationFailed(format!("Failed to create backup: {}", e))
                    })?;

                // Write new content
                let write_result = self.write_file_content(&sftp, remote_path, content);

                if write_result.is_err() {
                    // Restore backup on failure
                    let _ = sftp.rename(Path::new(&backup_path), Path::new(remote_path), None);
                    return write_result;
                }

                // Remove backup on success
                let _ = sftp.unlink(Path::new(&backup_path));
            } else {
                // New file, just write
                self.write_file_content(&sftp, remote_path, content)?;
            }
        }

        // Update cache
        let content_bytes = content.as_bytes().to_vec();
        let modified_at = Utc::now().timestamp();

        let cache_input = CacheFileInput {
            server_id: server.id.clone(),
            remote_path: remote_path.to_string(),
            content: content_bytes,
            remote_modified_at: modified_at,
        };
        self.cache_manager.cache_file(cache_input).await?;

        Ok(())
    }

    /// Write content to a file via SFTP
    fn write_file_content(
        &self,
        sftp: &ssh2::Sftp,
        remote_path: &str,
        content: &str,
    ) -> Result<()> {
        let mut file = sftp.create(Path::new(remote_path)).map_err(|e| {
            if e.to_string().contains("permission denied") || e.code() == ssh2::ErrorCode::SFTP(3) {
                AppError::FileOperationFailed(format!("Permission denied: {}", remote_path))
            } else {
                AppError::FileOperationFailed(format!("Failed to create file: {}", e))
            }
        })?;

        file.write_all(content.as_bytes())
            .map_err(|e| AppError::FileOperationFailed(format!("Failed to write file: {}", e)))?;

        Ok(())
    }

    /// Create a new empty file on the remote server
    pub async fn create_file(&self, server: &Server, remote_path: &str) -> Result<()> {
        let normalized_path = normalize_path(remote_path);

        // Get cached sudo password if available
        let sudo_password = self.get_sudo_password(&server.id).await;
        let sudo_pwd_ref = sudo_password.as_deref();

        let (session, _tcp) = create_ssh_session(&server.host, server.port)?;
        authenticate_session(&session, server, &self.credential_store, self.ssh_key_manager.as_deref())?;

        if server.use_sudo {
            // Check if file already exists
            let exists = self
                .exec_command_with_sudo_password(
                    &session,
                    &format!(
                        "test -e '{}' && echo 'exists'",
                        normalized_path.replace("'", "'\\''")
                    ),
                    true,
                    sudo_pwd_ref,
                )
                .map(|o| o.trim() == "exists")
                .unwrap_or(false);

            if exists {
                return Err(AppError::FileOperationFailed(format!(
                    "File already exists: {}",
                    normalized_path
                )));
            }

            // Create empty file with sudo
            self.exec_command_with_sudo_password(
                &session,
                &format!("touch '{}'", normalized_path.replace("'", "'\\''")),
                true,
                sudo_pwd_ref,
            )?;
        } else {
            let sftp = session.sftp().map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to open SFTP: {}", e))
            })?;

            // Check if file already exists
            if sftp.stat(Path::new(&normalized_path)).is_ok() {
                return Err(AppError::FileOperationFailed(format!(
                    "File already exists: {}",
                    normalized_path
                )));
            }

            // Create empty file
            let mut file = sftp.create(Path::new(&normalized_path)).map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to create file: {}", e))
            })?;

            file.write_all(b"").map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to write file: {}", e))
            })?;
        }

        Ok(())
    }

    /// Create a new directory on the remote server
    pub async fn create_directory(&self, server: &Server, remote_path: &str) -> Result<()> {
        let normalized_path = normalize_path(remote_path);

        // Get cached sudo password if available
        let sudo_password = self.get_sudo_password(&server.id).await;
        let sudo_pwd_ref = sudo_password.as_deref();

        let (session, _tcp) = create_ssh_session(&server.host, server.port)?;
        authenticate_session(&session, server, &self.credential_store, self.ssh_key_manager.as_deref())?;

        if server.use_sudo {
            // Check if directory already exists
            let exists = self
                .exec_command_with_sudo_password(
                    &session,
                    &format!(
                        "test -e '{}' && echo 'exists'",
                        normalized_path.replace("'", "'\\''")
                    ),
                    true,
                    sudo_pwd_ref,
                )
                .map(|o| o.trim() == "exists")
                .unwrap_or(false);

            if exists {
                return Err(AppError::FileOperationFailed(format!(
                    "Directory already exists: {}",
                    normalized_path
                )));
            }

            // Create directory with sudo
            self.exec_command_with_sudo_password(
                &session,
                &format!("mkdir -p '{}'", normalized_path.replace("'", "'\\''")),
                true,
                sudo_pwd_ref,
            )?;
        } else {
            let sftp = session.sftp().map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to open SFTP: {}", e))
            })?;

            // Check if directory already exists
            if sftp.stat(Path::new(&normalized_path)).is_ok() {
                return Err(AppError::FileOperationFailed(format!(
                    "Directory already exists: {}",
                    normalized_path
                )));
            }

            // Create directory with default permissions (755)
            sftp.mkdir(Path::new(&normalized_path), 0o755)
                .map_err(|e| {
                    AppError::FileOperationFailed(format!("Failed to create directory: {}", e))
                })?;
        }

        Ok(())
    }

    /// Delete a file or directory on the remote server
    pub async fn delete_file(&self, server: &Server, remote_path: &str) -> Result<()> {
        let normalized_path = normalize_path(remote_path);

        // Get cached sudo password if available
        let sudo_password = self.get_sudo_password(&server.id).await;
        let sudo_pwd_ref = sudo_password.as_deref();

        let (session, _tcp) = create_ssh_session(&server.host, server.port)?;
        authenticate_session(&session, server, &self.credential_store, self.ssh_key_manager.as_deref())?;

        if server.use_sudo {
            // Check if path exists and get type
            let is_dir = self
                .exec_command_with_sudo_password(
                    &session,
                    &format!(
                        "test -d '{}' && echo 'dir'",
                        normalized_path.replace("'", "'\\''")
                    ),
                    true,
                    sudo_pwd_ref,
                )
                .map(|o| o.trim() == "dir")
                .unwrap_or(false);

            if is_dir {
                // Delete directory
                self.exec_command_with_sudo_password(
                    &session,
                    &format!("rm -rf '{}'", normalized_path.replace("'", "'\\''")),
                    true,
                    sudo_pwd_ref,
                )?;
            } else {
                // Delete file
                self.exec_command_with_sudo_password(
                    &session,
                    &format!("rm -f '{}'", normalized_path.replace("'", "'\\''")),
                    true,
                    sudo_pwd_ref,
                )?;
            }
        } else {
            let sftp = session.sftp().map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to open SFTP: {}", e))
            })?;

            // Check if path exists and get type
            let stat = sftp
                .stat(Path::new(&normalized_path))
                .map_err(|e| AppError::FileOperationFailed(format!("File not found: {}", e)))?;

            if stat.is_dir() {
                // Delete directory
                sftp.rmdir(Path::new(&normalized_path)).map_err(|e| {
                    AppError::FileOperationFailed(format!("Failed to delete directory: {}", e))
                })?;
            } else {
                // Delete file
                sftp.unlink(Path::new(&normalized_path)).map_err(|e| {
                    AppError::FileOperationFailed(format!("Failed to delete file: {}", e))
                })?;
            }
        }

        // Invalidate cache
        self.cache_manager
            .invalidate_cache(&server.id, &normalized_path)
            .await?;

        Ok(())
    }

    /// Rename a file or directory on the remote server
    pub async fn rename_file(&self, server: &Server, old_path: &str, new_path: &str) -> Result<()> {
        let normalized_old = normalize_path(old_path);
        let normalized_new = normalize_path(new_path);

        // Get cached sudo password if available
        let sudo_password = self.get_sudo_password(&server.id).await;
        let sudo_pwd_ref = sudo_password.as_deref();

        let (session, _tcp) = create_ssh_session(&server.host, server.port)?;
        authenticate_session(&session, server, &self.credential_store, self.ssh_key_manager.as_deref())?;

        if server.use_sudo {
            // Check if source exists
            let source_exists = self
                .exec_command_with_sudo_password(
                    &session,
                    &format!(
                        "test -e '{}' && echo 'exists'",
                        normalized_old.replace("'", "'\\''")
                    ),
                    true,
                    sudo_pwd_ref,
                )
                .map(|o| o.trim() == "exists")
                .unwrap_or(false);

            if !source_exists {
                return Err(AppError::FileOperationFailed(format!(
                    "Source not found: {}",
                    normalized_old
                )));
            }

            // Check if target already exists (conflict detection)
            let target_exists = self
                .exec_command_with_sudo_password(
                    &session,
                    &format!(
                        "test -e '{}' && echo 'exists'",
                        normalized_new.replace("'", "'\\''")
                    ),
                    true,
                    sudo_pwd_ref,
                )
                .map(|o| o.trim() == "exists")
                .unwrap_or(false);

            if target_exists {
                return Err(AppError::FileOperationFailed(format!(
                    "File already exists: {}. Suggested alternative: {}_copy",
                    normalized_new,
                    normalized_new.trim_end_matches(|c| c == '/')
                )));
            }

            // Rename with sudo
            self.exec_command_with_sudo_password(
                &session,
                &format!(
                    "mv '{}' '{}'",
                    normalized_old.replace("'", "'\\''"),
                    normalized_new.replace("'", "'\\''")
                ),
                true,
                sudo_pwd_ref,
            )?;
        } else {
            let sftp = session.sftp().map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to open SFTP: {}", e))
            })?;


            // Check if source exists
            sftp.stat(Path::new(&normalized_old))
                .map_err(|e| AppError::FileOperationFailed(format!("Source not found: {}", e)))?;

            // Check if target already exists (conflict detection)
            if sftp.stat(Path::new(&normalized_new)).is_ok() {
                return Err(AppError::FileOperationFailed(format!(
                    "File already exists: {}. Suggested alternative: {}_copy",
                    normalized_new,
                    normalized_new.trim_end_matches(|c| c == '/')
                )));
            }

            // Rename
            sftp.rename(Path::new(&normalized_old), Path::new(&normalized_new), None)
                .map_err(|e| AppError::FileOperationFailed(format!("Failed to rename: {}", e)))?;
        }

        // Update cache: invalidate old path
        self.cache_manager
            .invalidate_cache(&server.id, &normalized_old)
            .await?;

        Ok(())
    }

    /// Upload multiple files to the remote server
    pub async fn upload_files(
        &self,
        server: &Server,
        remote_dir: &str,
        local_paths: Vec<String>,
        app_handle: Option<&AppHandle>,
    ) -> Result<()> {
        let normalized_dir = normalize_path(remote_dir);

        let (session, _tcp) = create_ssh_session(&server.host, server.port)?;
        authenticate_session(&session, server, &self.credential_store, self.ssh_key_manager.as_deref())?;

        let sftp = session
            .sftp()
            .map_err(|e| AppError::FileOperationFailed(format!("Failed to open SFTP: {}", e)))?;

        // Calculate total size for progress
        let mut total_bytes: u64 = 0;
        let mut file_sizes: Vec<(String, u64)> = Vec::new();

        for local_path in &local_paths {
            let metadata = std::fs::metadata(local_path).map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to read local file: {}", e))
            })?;
            let size = metadata.len();
            total_bytes += size;
            file_sizes.push((local_path.clone(), size));
        }

        let mut bytes_uploaded: u64 = 0;

        for (local_path, file_size) in file_sizes {
            let file_name = Path::new(&local_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown");

            let remote_path = if normalized_dir == "/" {
                format!("/{}", file_name)
            } else {
                format!("{}/{}", normalized_dir, file_name)
            };

            // Emit progress: pending
            if let Some(handle) = app_handle {
                let _ = handle.emit(
                    "upload-progress",
                    UploadProgress {
                        file_name: file_name.to_string(),
                        bytes_uploaded,
                        total_bytes,
                        status: UploadStatus::Pending,
                    },
                );
            }

            // Check if file exists (conflict)
            let file_exists = sftp.stat(Path::new(&remote_path)).is_ok();
            if file_exists {
                // For now, we'll overwrite. In a full implementation,
                // we'd emit an event asking the user what to do
            }

            // Read local file
            let content = std::fs::read(&local_path).map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to read local file: {}", e))
            })?;

            // Emit progress: uploading
            if let Some(handle) = app_handle {
                let _ = handle.emit(
                    "upload-progress",
                    UploadProgress {
                        file_name: file_name.to_string(),
                        bytes_uploaded,
                        total_bytes,
                        status: UploadStatus::Uploading,
                    },
                );
            }

            // Upload file
            let mut remote_file = sftp.create(Path::new(&remote_path)).map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to create remote file: {}", e))
            })?;

            remote_file.write_all(&content).map_err(|e| {
                // Emit progress: failed
                if let Some(handle) = app_handle {
                    let _ = handle.emit(
                        "upload-progress",
                        UploadProgress {
                            file_name: file_name.to_string(),
                            bytes_uploaded,
                            total_bytes,
                            status: UploadStatus::Failed(e.to_string()),
                        },
                    );
                }
                AppError::FileOperationFailed(format!("Failed to write remote file: {}", e))
            })?;

            bytes_uploaded += file_size;

            // Emit progress: completed
            if let Some(handle) = app_handle {
                let _ = handle.emit(
                    "upload-progress",
                    UploadProgress {
                        file_name: file_name.to_string(),
                        bytes_uploaded,
                        total_bytes,
                        status: UploadStatus::Completed,
                    },
                );
            }
        }

        Ok(())
    }

    /// Get the remote file modification time
    pub fn get_remote_modified_time(&self, server: &Server, remote_path: &str) -> Result<i64> {
        let normalized_path = normalize_path(remote_path);

        let (session, _tcp) = create_ssh_session(&server.host, server.port)?;
        authenticate_session(&session, server, &self.credential_store, self.ssh_key_manager.as_deref())?;

        let sftp = session
            .sftp()
            .map_err(|e| AppError::FileOperationFailed(format!("Failed to open SFTP: {}", e)))?;

        let stat = sftp
            .stat(Path::new(&normalized_path))
            .map_err(|e| AppError::FileOperationFailed(format!("Failed to stat file: {}", e)))?;

        Ok(stat.mtime.unwrap_or(0) as i64)
    }

    /// Change file/directory permissions on the remote server
    pub async fn change_permissions(
        &self,
        server: &Server,
        remote_path: &str,
        mode: &str,
    ) -> Result<()> {
        let normalized_path = normalize_path(remote_path);

        // Validate mode (should be 3 octal digits like "755")
        if mode.len() != 3 || !mode.chars().all(|c| c >= '0' && c <= '7') {
            return Err(AppError::ValidationError(format!(
                "Invalid permission mode: {}. Expected 3 octal digits (e.g., 755)",
                mode
            )));
        }

        // Get cached sudo password if available
        let sudo_password = self.get_sudo_password(&server.id).await;
        let sudo_pwd_ref = sudo_password.as_deref();

        let (session, _tcp) = create_ssh_session(&server.host, server.port)?;
        authenticate_session(&session, server, &self.credential_store, self.ssh_key_manager.as_deref())?;

        let command = format!("chmod {} '{}'", mode, normalized_path.replace("'", "'\\''"));
        self.exec_command_with_sudo_password(&session, &command, server.use_sudo, sudo_pwd_ref)?;

        Ok(())
    }
}

/// Calculate exponential backoff delay for retry attempt
fn calculate_backoff_delay(attempt: u32) -> Duration {
    let delay_ms = BASE_RETRY_DELAY_MS * (1 << attempt.min(10));
    Duration::from_millis(delay_ms)
}

/// Format file permissions from mode bits
fn format_permissions(mode: u32) -> String {
    let file_type = match mode & 0o170000 {
        0o040000 => 'd',
        0o120000 => 'l',
        _ => '-',
    };

    let user = format_rwx((mode >> 6) & 0o7);
    let group = format_rwx((mode >> 3) & 0o7);
    let other = format_rwx(mode & 0o7);

    format!("{}{}{}{}", file_type, user, group, other)
}

fn format_rwx(bits: u32) -> String {
    let r = if bits & 0o4 != 0 { 'r' } else { '-' };
    let w = if bits & 0o2 != 0 { 'w' } else { '-' };
    let x = if bits & 0o1 != 0 { 'x' } else { '-' };
    format!("{}{}{}", r, w, x)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_backoff_delay() {
        // Attempt 0: 1000ms
        assert_eq!(calculate_backoff_delay(0), Duration::from_millis(1000));
        // Attempt 1: 2000ms
        assert_eq!(calculate_backoff_delay(1), Duration::from_millis(2000));
        // Attempt 2: 4000ms
        assert_eq!(calculate_backoff_delay(2), Duration::from_millis(4000));
    }

    #[test]
    fn test_backoff_delay_exponential_growth() {
        for i in 0..MAX_RETRY_ATTEMPTS - 1 {
            let delay_n = calculate_backoff_delay(i);
            let delay_n_plus_1 = calculate_backoff_delay(i + 1);
            assert!(delay_n_plus_1 > delay_n);
        }
    }

    #[test]
    fn test_format_permissions() {
        assert_eq!(format_permissions(0o100755), "-rwxr-xr-x");
        assert_eq!(format_permissions(0o100644), "-rw-r--r--");
        assert_eq!(format_permissions(0o040755), "drwxr-xr-x");
    }
}
