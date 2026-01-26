/// Manual SSH public key authentication for Ed25519 on Windows
/// Uses external ssh command as fallback when libssh2 doesn't support Ed25519
use crate::error::{AppError, Result};
use std::process::{Command, Stdio};
use std::io::Write;
use tempfile::NamedTempFile;

/// Authenticate using external SSH command for Ed25519
/// This is a fallback when libssh2 doesn't support Ed25519 on Windows
pub fn authenticate_ed25519_external(
    host: &str,
    port: u16,
    username: &str,
    private_key_data: &str,
) -> Result<bool> {
    log::info!("Attempting external SSH authentication for Ed25519 key");

    // Write private key to temp file
    let mut key_file = NamedTempFile::new()
        .map_err(|e| AppError::SshError(format!("Failed to create temp key file: {}", e)))?;
    
    key_file.write_all(private_key_data.as_bytes())
        .map_err(|e| AppError::SshError(format!("Failed to write key file: {}", e)))?;
    
    key_file.flush()
        .map_err(|e| AppError::SshError(format!("Failed to flush key file: {}", e)))?;

    let key_path = key_file.path();

    // Set restrictive permissions on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(key_path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| AppError::SshError(format!("Failed to set key permissions: {}", e)))?;
    }

    // Try to execute a simple SSH command to test authentication
    let output = Command::new("ssh")
        .args(&[
            "-i", key_path.to_str().unwrap(),
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=10",
            "-p", &port.to_string(),
            &format!("{}@{}", username, host),
            "echo", "SSH_AUTH_SUCCESS"
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    match output {
        Ok(result) => {
            let stdout = String::from_utf8_lossy(&result.stdout);
            let stderr = String::from_utf8_lossy(&result.stderr);
            
            log::debug!("SSH command exit code: {}", result.status.code().unwrap_or(-1));
            log::debug!("SSH stdout: {}", stdout);
            log::debug!("SSH stderr: {}", stderr);

            if result.status.success() && stdout.contains("SSH_AUTH_SUCCESS") {
                log::info!("External SSH authentication successful");
                Ok(true)
            } else {
                log::warn!("External SSH authentication failed: {}", stderr);
                Err(AppError::AuthenticationFailed(format!(
                    "SSH authentication failed: {}",
                    stderr
                )))
            }
        }
        Err(e) => {
            log::error!("Failed to execute SSH command: {}", e);
            Err(AppError::SshError(format!(
                "Failed to execute SSH command. Is OpenSSH installed? Error: {}",
                e
            )))
        }
    }
}
