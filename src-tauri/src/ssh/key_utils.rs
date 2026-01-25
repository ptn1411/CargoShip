use crate::error::{AppError, Result};
use ssh_key::{LineEnding, PrivateKey};
use std::path::Path;
use std::process::Command;

/// Supported key types that can be converted
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum KeyType {
    Rsa,
    Ed25519,
    Ecdsa,
    Unknown,
}

/// Information about an SSH key file
#[derive(Debug)]
pub struct KeyInfo {
    pub key_type: KeyType,
    pub is_encrypted: bool,
    pub is_openssh_format: bool,
    pub is_pem_format: bool,
    pub is_ppk_format: bool,
}

/// Analyze an SSH key file to determine its format and type
pub fn analyze_key_file(path: &Path) -> Result<KeyInfo> {
    let content = std::fs::read_to_string(path).map_err(|e| {
        AppError::AuthenticationFailed(format!(
            "Cannot read SSH key file '{}': {}",
            path.display(),
            e
        ))
    })?;

    let first_line = content.lines().next().unwrap_or("");

    let is_ppk_format = first_line.contains("PuTTY-User-Key-File");
    let is_openssh_format = first_line.contains("OPENSSH PRIVATE KEY");
    let is_pem_format = first_line.contains("BEGIN RSA PRIVATE KEY")
        || first_line.contains("BEGIN EC PRIVATE KEY")
        || first_line.contains("BEGIN DSA PRIVATE KEY");
    let is_encrypted = content.contains("ENCRYPTED") || content.contains("Proc-Type: 4,ENCRYPTED");

    let key_type = if content.contains("ssh-ed25519") || first_line.contains("OPENSSH") {
        KeyType::Unknown // Will be determined during parsing
    } else if first_line.contains("RSA") {
        KeyType::Rsa
    } else if first_line.contains("EC") {
        KeyType::Ecdsa
    } else {
        KeyType::Unknown
    };

    Ok(KeyInfo {
        key_type,
        is_encrypted,
        is_openssh_format,
        is_pem_format,
        is_ppk_format,
    })
}

/// Load and parse an SSH private key, handling various formats
pub fn load_private_key(path: &Path, passphrase: Option<&str>) -> Result<LoadedKey> {
    let content = std::fs::read_to_string(path).map_err(|e| {
        AppError::AuthenticationFailed(format!(
            "Cannot read SSH key file '{}': {}",
            path.display(),
            e
        ))
    })?;

    let first_line = content.lines().next().unwrap_or("");

    // Check for PuTTY format
    if first_line.contains("PuTTY-User-Key-File") {
        return Err(AppError::AuthenticationFailed(format!(
            "SSH key '{}' is in PuTTY format (.ppk). \
            Please convert to OpenSSH format using PuTTYgen: \
            Conversions -> Export OpenSSH key",
            path.display()
        )));
    }

    // Try to parse the key
    let private_key = if let Some(pass) = passphrase.filter(|p| !p.is_empty()) {
        let encrypted_key = PrivateKey::from_openssh(content.as_bytes()).map_err(|e| {
            AppError::AuthenticationFailed(format!(
                "Failed to parse SSH key '{}': {}",
                path.display(),
                e
            ))
        })?;

        encrypted_key.decrypt(pass.as_bytes()).map_err(|e| {
            AppError::AuthenticationFailed(format!(
                "Failed to decrypt SSH key '{}': {}. The passphrase may be incorrect.",
                path.display(),
                e
            ))
        })?
    } else {
        PrivateKey::from_openssh(content.as_bytes()).map_err(|e| {
            if content.contains("ENCRYPTED") {
                AppError::AuthenticationFailed(format!(
                    "SSH key '{}' is encrypted but no passphrase was provided.",
                    path.display()
                ))
            } else {
                AppError::AuthenticationFailed(format!(
                    "Failed to parse SSH key '{}': {}",
                    path.display(),
                    e
                ))
            }
        })?
    };

    // Determine key type
    let key_type = match private_key.algorithm() {
        ssh_key::Algorithm::Rsa { .. } => KeyType::Rsa,
        ssh_key::Algorithm::Ed25519 => KeyType::Ed25519,
        ssh_key::Algorithm::Ecdsa { .. } => KeyType::Ecdsa,
        _ => KeyType::Unknown,
    };

    // Get the key in OpenSSH format (unencrypted)
    let openssh_data = private_key
        .to_openssh(LineEnding::LF)
        .map_err(|e| AppError::AuthenticationFailed(format!("Failed to serialize key: {}", e)))?;

    // Get public key
    let public_key_openssh = private_key.public_key().to_openssh().map_err(|e| {
        AppError::AuthenticationFailed(format!("Failed to extract public key: {}", e))
    })?;

    Ok(LoadedKey {
        key_type,
        openssh_data: openssh_data.to_string(),
        public_key_openssh,
    })
}

/// A loaded and parsed SSH private key
#[derive(Debug)]
pub struct LoadedKey {
    pub key_type: KeyType,
    pub openssh_data: String,
    pub public_key_openssh: String,
}

/// Write the loaded key to a temporary file for ssh2 compatibility
/// Returns the path to the temporary file
pub fn write_temp_key(loaded_key: &LoadedKey) -> Result<tempfile::NamedTempFile> {
    use std::io::Write;

    let mut temp_file = tempfile::NamedTempFile::new().map_err(|e| {
        AppError::AuthenticationFailed(format!("Failed to create temporary key file: {}", e))
    })?;

    temp_file
        .write_all(loaded_key.openssh_data.as_bytes())
        .map_err(|e| {
            AppError::AuthenticationFailed(format!("Failed to write temporary key file: {}", e))
        })?;

    temp_file.flush().map_err(|e| {
        AppError::AuthenticationFailed(format!("Failed to flush temporary key file: {}", e))
    })?;

    Ok(temp_file)
}

/// Ensure ssh-agent is running and add the key to it (Windows)
/// This handles Ed25519 keys that libssh2 doesn't support natively
pub fn ensure_key_in_agent(key_path: &Path, _passphrase: Option<&str>) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        // Check if ssh-agent service is running, try to start it
        let status = Command::new("powershell")
            .args(["-Command", "Get-Service ssh-agent -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Status"])
            .output();

        if let Ok(output) = status {
            let status_str = String::from_utf8_lossy(&output.stdout);
            if !status_str.trim().eq_ignore_ascii_case("Running") {
                // Try to start ssh-agent (may fail without admin, that's ok)
                let _ = Command::new("powershell")
                    .args([
                        "-Command",
                        "Start-Service ssh-agent -ErrorAction SilentlyContinue",
                    ])
                    .output();
            }
        }

        // Check if key is already in agent
        let list_output = Command::new("ssh-add").arg("-l").output();

        if let Ok(output) = list_output {
            let keys_list = String::from_utf8_lossy(&output.stdout);
            let key_path_str = key_path.to_string_lossy();

            // If key appears to be added (check by path or key type), we're done
            if keys_list.contains(&*key_path_str)
                || (keys_list.contains("ED25519") || keys_list.contains("ed25519"))
            {
                return Ok(());
            }
        }

        // Add key to agent (without passphrase - user will be prompted if needed)
        let add_result = Command::new("ssh-add").arg(key_path).output();

        match add_result {
            Ok(output) if output.status.success() => Ok(()),
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                if stderr.contains("Could not open a connection to your authentication agent") {
                    Err(AppError::AuthenticationFailed(
                        "SSH Agent is not running. Please run these commands in PowerShell (Admin):\n\
                        Set-Service ssh-agent -StartupType Automatic\n\
                        Start-Service ssh-agent".to_string()
                    ))
                } else {
                    // Key might already be added or other non-fatal error
                    Ok(())
                }
            }
            Err(_) => {
                // ssh-add not found, continue without agent
                Ok(())
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // On Unix, ssh-agent usually works better
        let _ = key_path;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_analyze_pem_rsa_key() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "-----BEGIN RSA PRIVATE KEY-----").unwrap();
        writeln!(file, "test content").unwrap();
        writeln!(file, "-----END RSA PRIVATE KEY-----").unwrap();

        let info = analyze_key_file(file.path()).unwrap();
        assert!(info.is_pem_format);
        assert!(!info.is_openssh_format);
        assert!(!info.is_ppk_format);
    }

    #[test]
    fn test_analyze_openssh_key() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "-----BEGIN OPENSSH PRIVATE KEY-----").unwrap();
        writeln!(file, "test content").unwrap();
        writeln!(file, "-----END OPENSSH PRIVATE KEY-----").unwrap();

        let info = analyze_key_file(file.path()).unwrap();
        assert!(info.is_openssh_format);
        assert!(!info.is_pem_format);
        assert!(!info.is_ppk_format);
    }

    #[test]
    fn test_analyze_ppk_key() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "PuTTY-User-Key-File-2: ssh-rsa").unwrap();
        writeln!(file, "test content").unwrap();

        let info = analyze_key_file(file.path()).unwrap();
        assert!(info.is_ppk_format);
        assert!(!info.is_openssh_format);
        assert!(!info.is_pem_format);
    }
}
