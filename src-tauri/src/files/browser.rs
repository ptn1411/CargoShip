use super::models::*;
use crate::credentials::CredentialStore;
use crate::error::{AppError, Result};
use crate::server::Server;
use crate::ssh::{authenticate_session, create_ssh_session, SshKeyManager};
use chrono::{TimeZone, Utc};
use std::sync::Arc;

pub struct FileBrowser {
    credential_store: Arc<CredentialStore>,
    ssh_key_manager: Option<Arc<SshKeyManager>>,
}

impl FileBrowser {
    pub fn new(credential_store: Arc<CredentialStore>) -> Self {
        Self {
            credential_store,
            ssh_key_manager: None, // Default to None, will be updated via setter or new constructor if needed.
                                   // Wait, I should probably update the constructor to take it, but that breaks lib.rs even more if I don't update lib.rs first.
                                   // But I'm updating lib.rs after.
        }
    }

    pub fn with_key_manager(
        credential_store: Arc<CredentialStore>,
        ssh_key_manager: Arc<SshKeyManager>,
    ) -> Self {
        Self {
            credential_store,
            ssh_key_manager: Some(ssh_key_manager),
        }
    }

    pub fn list_directory(&self, server: &Server, path: &str) -> Result<Vec<FileEntry>> {
        let (session, _tcp) = create_ssh_session(&server.host, server.port)?;
        authenticate_session(
            &session,
            server,
            &self.credential_store,
            self.ssh_key_manager.as_deref(),
        )?;

        let sftp = session
            .sftp()
            .map_err(|e| AppError::FileOperationFailed(format!("Failed to open SFTP: {}", e)))?;

        let normalized_path = normalize_path(path);
        let _dir = sftp
            .opendir(std::path::Path::new(&normalized_path))
            .map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to open directory: {}", e))
            })?;

        let mut entries = Vec::new();

        for entry in sftp
            .readdir(std::path::Path::new(&normalized_path))
            .map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to read directory: {}", e))
            })?
        {
            let (path_buf, stat) = entry;
            let name = path_buf
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            // Skip . and ..
            if name == "." || name == ".." {
                continue;
            }

            let file_type = if stat.is_dir() {
                FileType::Directory
            } else if stat.file_type().is_symlink() {
                FileType::Symlink
            } else {
                FileType::File
            };

            let full_path = if normalized_path == "/" {
                format!("/{}", name)
            } else {
                format!("{}/{}", normalized_path, name)
            };

            let modified_at = stat
                .mtime
                .map(|t| {
                    Utc.timestamp_opt(t as i64, 0)
                        .single()
                        .unwrap_or_else(Utc::now)
                })
                .unwrap_or_else(Utc::now);

            let permissions = format_permissions(stat.perm.unwrap_or(0));

            entries.push(FileEntry {
                name,
                path: full_path,
                file_type,
                size: stat.size.unwrap_or(0),
                permissions,
                modified_at,
            });
        }

        // Sort: directories first, then by name
        entries.sort_by(|a, b| match (&a.file_type, &b.file_type) {
            (FileType::Directory, FileType::Directory) => a.name.cmp(&b.name),
            (FileType::Directory, _) => std::cmp::Ordering::Less,
            (_, FileType::Directory) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        });

        Ok(entries)
    }

    pub fn search_files(
        &self,
        server: &Server,
        path: &str,
        pattern: &str,
    ) -> Result<Vec<FileEntry>> {
        let entries = self.list_directory(server, path)?;
        let pattern_lower = pattern.to_lowercase();

        Ok(entries
            .into_iter()
            .filter(|e| e.name.to_lowercase().contains(&pattern_lower))
            .collect())
    }

    pub fn get_file_info(&self, server: &Server, path: &str) -> Result<FileEntry> {
        let (session, _tcp) = create_ssh_session(&server.host, server.port)?;
        authenticate_session(
            &session,
            server,
            &self.credential_store,
            self.ssh_key_manager.as_deref(),
        )?;

        let sftp = session
            .sftp()
            .map_err(|e| AppError::FileOperationFailed(format!("Failed to open SFTP: {}", e)))?;

        let normalized_path = normalize_path(path);
        let stat = sftp
            .stat(std::path::Path::new(&normalized_path))
            .map_err(|e| AppError::FileOperationFailed(format!("Failed to stat file: {}", e)))?;

        let name = std::path::Path::new(&normalized_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let file_type = if stat.is_dir() {
            FileType::Directory
        } else if stat.file_type().is_symlink() {
            FileType::Symlink
        } else {
            FileType::File
        };

        let modified_at = stat
            .mtime
            .map(|t| {
                Utc.timestamp_opt(t as i64, 0)
                    .single()
                    .unwrap_or_else(Utc::now)
            })
            .unwrap_or_else(Utc::now);

        let permissions = format_permissions(stat.perm.unwrap_or(0));

        Ok(FileEntry {
            name,
            path: normalized_path,
            file_type,
            size: stat.size.unwrap_or(0),
            permissions,
            modified_at,
        })
    }
}

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
    fn test_format_permissions_file() {
        // Regular file with rwxr-xr-x (755)
        assert_eq!(format_permissions(0o100755), "-rwxr-xr-x");
        // Regular file with rw-r--r-- (644)
        assert_eq!(format_permissions(0o100644), "-rw-r--r--");
        // Regular file with no permissions
        assert_eq!(format_permissions(0o100000), "----------");
    }

    #[test]
    fn test_format_permissions_directory() {
        // Directory with rwxr-xr-x (755)
        assert_eq!(format_permissions(0o040755), "drwxr-xr-x");
        // Directory with rwx------ (700)
        assert_eq!(format_permissions(0o040700), "drwx------");
    }

    #[test]
    fn test_format_permissions_symlink() {
        // Symlink with rwxrwxrwx (777)
        assert_eq!(format_permissions(0o120777), "lrwxrwxrwx");
    }

    #[test]
    fn test_format_rwx() {
        assert_eq!(format_rwx(0o7), "rwx");
        assert_eq!(format_rwx(0o6), "rw-");
        assert_eq!(format_rwx(0o5), "r-x");
        assert_eq!(format_rwx(0o4), "r--");
        assert_eq!(format_rwx(0o3), "-wx");
        assert_eq!(format_rwx(0o2), "-w-");
        assert_eq!(format_rwx(0o1), "--x");
        assert_eq!(format_rwx(0o0), "---");
    }
}
