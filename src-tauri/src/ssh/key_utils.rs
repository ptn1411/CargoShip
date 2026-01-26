use crate::error::{AppError, Result};
use ssh_key::{LineEnding, PrivateKey};
use std::path::Path;

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

    // Parse the key first
    let parsed_key = PrivateKey::from_openssh(content.as_bytes()).map_err(|e| {
        AppError::AuthenticationFailed(format!(
            "Failed to parse SSH key '{}': {}",
            path.display(),
            e
        ))
    })?;

    // Decrypt only if the key is actually encrypted
    let private_key = if parsed_key.is_encrypted() {
        // Key is encrypted, we need a passphrase
        if let Some(pass) = passphrase.filter(|p| !p.is_empty()) {
            parsed_key.decrypt(pass.as_bytes()).map_err(|e| {
                AppError::AuthenticationFailed(format!(
                    "Failed to decrypt SSH key '{}': {}. The passphrase may be incorrect.",
                    path.display(),
                    e
                ))
            })?
        } else {
            return Err(AppError::AuthenticationFailed(format!(
                "SSH key '{}' is encrypted but no passphrase was provided.",
                path.display()
            )));
        }
    } else {
        // Key is not encrypted, use it as-is
        parsed_key
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

    // For RSA keys on Windows, we need PKCS#1 PEM format for WinCNG backend
    // ssh-key crate only exports OpenSSH format, so we use rsa/pkcs1 crates for conversion
    #[allow(unused_mut)]
    let mut final_data = openssh_data.to_string();

    #[cfg(target_os = "windows")]
    if let ssh_key::Algorithm::Rsa { .. } = private_key.algorithm() {
        if let Some(key_data) = private_key.key_data().rsa() {
            // Convert ssh-key RSA components to rsa crate components
            use pkcs1::EncodeRsaPrivateKey;

            let n = rsa::BigUint::from_bytes_be(key_data.public.n.as_bytes());
            let e = rsa::BigUint::from_bytes_be(key_data.public.e.as_bytes());
            let d = rsa::BigUint::from_bytes_be(key_data.private.d.as_bytes());
            let p = rsa::BigUint::from_bytes_be(key_data.private.p.as_bytes());
            let q = rsa::BigUint::from_bytes_be(key_data.private.q.as_bytes());

            // Reconstruct full key
            // Note: ssh-key provides iqmp (inverse of q mod p), rsa crate can compute dmp1/dmq1
            if let Ok(rsa_key) = rsa::RsaPrivateKey::from_components(n, e, d, vec![p, q]) {
                if let Ok(pem) = rsa_key.to_pkcs1_pem(rsa::pkcs8::LineEnding::LF) {
                    final_data = pem.to_string();
                }
            }
        }
    }

    // Get public key
    let public_key_openssh = private_key.public_key().to_openssh().map_err(|e| {
        AppError::AuthenticationFailed(format!("Failed to extract public key: {}", e))
    })?;

    Ok(LoadedKey {
        key_type,
        openssh_data: final_data,
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

/// Ensure embedded ssh-agent is running and the key is loaded
pub fn ensure_key_in_agent(loaded_key: &LoadedKey) -> Result<()> {
    if loaded_key.key_type != KeyType::Ed25519 {
        return Ok(());
    }

    crate::ssh::agent_manager().ensure_identity_loaded(loaded_key)
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
