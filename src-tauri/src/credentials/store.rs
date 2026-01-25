use crate::error::{AppError, Result};
use keyring::Entry;

const SERVICE_NAME: &str = "devops-commander";
const PASSWORD_PREFIX: &str = "password";
const KEY_PATH_PREFIX: &str = "keypath";
const KEY_PASSPHRASE_PREFIX: &str = "keypassphrase";
const DB_PASSWORD_PREFIX: &str = "dbpassword";
const DB_ENCRYPTION_KEY: &str = "db-encryption-key";

/// CredentialStore manages secure credential storage using the system keychain.
///
/// On different platforms, this uses:
/// - Windows: Windows Credential Manager
/// - macOS: macOS Keychain
/// - Linux: libsecret (Secret Service API)
///
/// Credentials are stored separately from the database to ensure sensitive data
/// is protected by the OS-level secure storage mechanisms.
pub struct CredentialStore {
    service_name: String,
}

impl CredentialStore {
    /// Creates a new CredentialStore instance.
    pub fn new() -> Self {
        Self {
            service_name: SERVICE_NAME.to_string(),
        }
    }

    /// Creates a new CredentialStore with a custom service name.
    /// Useful for testing or multi-tenant scenarios.
    pub fn with_service_name(service_name: &str) -> Self {
        Self {
            service_name: service_name.to_string(),
        }
    }

    /// Gets a keyring entry for the given server ID and credential type prefix.
    fn get_entry(&self, server_id: &str, prefix: &str) -> Result<Entry> {
        let key = format!("{}:{}", prefix, server_id);
        Entry::new(&self.service_name, &key)
            .map_err(|e| self.map_keyring_error(e, "access keychain"))
    }

    /// Maps keyring errors to appropriate AppError variants with user-friendly messages.
    fn map_keyring_error(&self, error: keyring::Error, operation: &str) -> AppError {
        match error {
            keyring::Error::NoEntry => {
                AppError::CredentialError("Credential not found".to_string())
            }
            keyring::Error::Ambiguous(_) => {
                AppError::CredentialError(format!(
                    "Multiple credentials found - unable to {}", operation
                ))
            }
            keyring::Error::NoStorageAccess(platform_err) => {
                AppError::CredentialError(format!(
                    "System keychain is unavailable: {}. Please ensure your system's credential storage is properly configured.",
                    platform_err
                ))
            }
            keyring::Error::PlatformFailure(platform_err) => {
                AppError::CredentialError(format!(
                    "Keychain operation failed: {}. The system keychain may be locked or unavailable.",
                    platform_err
                ))
            }
            keyring::Error::BadEncoding(bytes) => {
                AppError::CredentialError(format!(
                    "Credential data is corrupted (invalid encoding: {} bytes)", bytes.len()
                ))
            }
            _ => {
                AppError::CredentialError(format!("Failed to {}: {}", operation, error))
            }
        }
    }

    /// Checks if the system keychain is available and accessible.
    /// Returns Ok(()) if available, or an error describing why it's not.
    pub fn check_availability(&self) -> Result<()> {
        // Try to create a test entry to verify keychain access
        let test_key = format!("{}:availability-check", PASSWORD_PREFIX);
        match Entry::new(&self.service_name, &test_key) {
            Ok(_) => Ok(()),
            Err(e) => Err(self.map_keyring_error(e, "access keychain")),
        }
    }

    /// Stores a password credential for the given server ID.
    /// The password is encrypted and stored in the system keychain.
    ///
    /// # Requirements
    /// - Requirement 2.1: Encrypt and store password in system keychain
    pub fn store_password(&self, server_id: &str, password: &str) -> Result<()> {
        if server_id.is_empty() {
            return Err(AppError::ValidationError(
                "Server ID cannot be empty".to_string(),
            ));
        }
        if password.is_empty() {
            return Err(AppError::ValidationError(
                "Password cannot be empty".to_string(),
            ));
        }

        let entry = self.get_entry(server_id, PASSWORD_PREFIX)?;
        entry
            .set_password(password)
            .map_err(|e| self.map_keyring_error(e, "store password"))
    }

    /// Retrieves a stored password credential for the given server ID.
    /// The password is decrypted from the system keychain.
    ///
    /// # Requirements
    /// - Requirement 2.3: Decrypt and return credential without exposing in logs
    pub fn retrieve_password(&self, server_id: &str) -> Result<String> {
        if server_id.is_empty() {
            return Err(AppError::ValidationError(
                "Server ID cannot be empty".to_string(),
            ));
        }

        let entry = self.get_entry(server_id, PASSWORD_PREFIX)?;
        entry
            .get_password()
            .map_err(|e| self.map_keyring_error(e, "retrieve password"))
    }

    /// Stores an SSH key path reference for the given server ID.
    /// The key path is stored securely in the system keychain.
    ///
    /// # Requirements
    /// - Requirement 2.2: Store key path reference securely
    pub fn store_key_path(&self, server_id: &str, key_path: &str) -> Result<()> {
        if server_id.is_empty() {
            return Err(AppError::ValidationError(
                "Server ID cannot be empty".to_string(),
            ));
        }
        if key_path.is_empty() {
            return Err(AppError::ValidationError(
                "Key path cannot be empty".to_string(),
            ));
        }

        let entry = self.get_entry(server_id, KEY_PATH_PREFIX)?;
        entry
            .set_password(key_path)
            .map_err(|e| self.map_keyring_error(e, "store key path"))
    }

    /// Retrieves a stored SSH key path for the given server ID.
    ///
    /// # Requirements
    /// - Requirement 2.3: Return credential without exposing in logs
    pub fn retrieve_key_path(&self, server_id: &str) -> Result<String> {
        if server_id.is_empty() {
            return Err(AppError::ValidationError(
                "Server ID cannot be empty".to_string(),
            ));
        }

        let entry = self.get_entry(server_id, KEY_PATH_PREFIX)?;
        entry
            .get_password()
            .map_err(|e| self.map_keyring_error(e, "retrieve key path"))
    }

    /// Stores an SSH key passphrase for the given server ID.
    /// The passphrase is encrypted and stored in the system keychain.
    pub fn store_key_passphrase(&self, server_id: &str, passphrase: &str) -> Result<()> {
        if server_id.is_empty() {
            return Err(AppError::ValidationError(
                "Server ID cannot be empty".to_string(),
            ));
        }
        // Empty passphrase is valid (means no passphrase on the key)

        let entry = self.get_entry(server_id, KEY_PASSPHRASE_PREFIX)?;
        entry
            .set_password(passphrase)
            .map_err(|e| self.map_keyring_error(e, "store key passphrase"))
    }

    /// Retrieves a stored SSH key passphrase for the given server ID.
    /// Returns None if no passphrase is stored (key has no passphrase).
    pub fn retrieve_key_passphrase(&self, server_id: &str) -> Result<Option<String>> {
        if server_id.is_empty() {
            return Err(AppError::ValidationError(
                "Server ID cannot be empty".to_string(),
            ));
        }

        let entry = self.get_entry(server_id, KEY_PASSPHRASE_PREFIX)?;
        match entry.get_password() {
            Ok(passphrase) if passphrase.is_empty() => Ok(None),
            Ok(passphrase) => Ok(Some(passphrase)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(self.map_keyring_error(e, "retrieve key passphrase")),
        }
    }

    /// Deletes the SSH key passphrase for the given server ID.
    pub fn delete_key_passphrase(&self, server_id: &str) -> Result<()> {
        if server_id.is_empty() {
            return Err(AppError::ValidationError(
                "Server ID cannot be empty".to_string(),
            ));
        }

        if let Ok(entry) = self.get_entry(server_id, KEY_PASSPHRASE_PREFIX) {
            if let Err(e) = entry.delete_credential() {
                if !matches!(e, keyring::Error::NoEntry) {
                    return Err(self.map_keyring_error(e, "delete key passphrase"));
                }
            }
        }
        Ok(())
    }

    /// Deletes all credentials associated with the given server ID.
    /// This removes both password and key path entries if they exist.
    ///
    /// # Requirements
    /// - Requirement 2.4: Remove associated credentials when server is deleted
    pub fn delete_credential(&self, server_id: &str) -> Result<()> {
        if server_id.is_empty() {
            return Err(AppError::ValidationError(
                "Server ID cannot be empty".to_string(),
            ));
        }

        let mut errors = Vec::new();

        // Try to delete password entry
        if let Ok(entry) = self.get_entry(server_id, PASSWORD_PREFIX) {
            if let Err(e) = entry.delete_credential() {
                // Ignore "not found" errors, but track other errors
                if !matches!(e, keyring::Error::NoEntry) {
                    errors.push(format!("password: {}", e));
                }
            }
        }

        // Try to delete key path entry
        if let Ok(entry) = self.get_entry(server_id, KEY_PATH_PREFIX) {
            if let Err(e) = entry.delete_credential() {
                // Ignore "not found" errors, but track other errors
                if !matches!(e, keyring::Error::NoEntry) {
                    errors.push(format!("key path: {}", e));
                }
            }
        }

        // Try to delete key passphrase entry
        if let Ok(entry) = self.get_entry(server_id, KEY_PASSPHRASE_PREFIX) {
            if let Err(e) = entry.delete_credential() {
                // Ignore "not found" errors, but track other errors
                if !matches!(e, keyring::Error::NoEntry) {
                    errors.push(format!("key passphrase: {}", e));
                }
            }
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(AppError::CredentialError(format!(
                "Failed to delete some credentials: {}",
                errors.join(", ")
            )))
        }
    }

    /// Checks if any credential (password or key path) exists for the given server ID.
    pub fn has_credential(&self, server_id: &str) -> bool {
        if server_id.is_empty() {
            return false;
        }
        self.retrieve_password(server_id).is_ok() || self.retrieve_key_path(server_id).is_ok()
    }

    /// Checks if a password credential exists for the given server ID.
    pub fn has_password(&self, server_id: &str) -> bool {
        if server_id.is_empty() {
            return false;
        }
        self.retrieve_password(server_id).is_ok()
    }

    /// Checks if a key path credential exists for the given server ID.
    pub fn has_key_path(&self, server_id: &str) -> bool {
        if server_id.is_empty() {
            return false;
        }
        self.retrieve_key_path(server_id).is_ok()
    }

    // ==================== Database Encryption Key ====================

    /// Gets or creates the database encryption key.
    /// The key is stored in the system keychain and can be used for encrypting sensitive data.
    /// If no key exists, a new random 32-byte key is generated and stored.
    pub fn get_or_create_db_encryption_key(&self) -> Result<String> {
        let entry = Entry::new(&self.service_name, DB_ENCRYPTION_KEY)
            .map_err(|e| self.map_keyring_error(e, "access keychain"))?;

        // Try to get existing key
        match entry.get_password() {
            Ok(key) => Ok(key),
            Err(keyring::Error::NoEntry) => {
                // Generate new random key (64 hex chars = 32 bytes)
                use rand::Rng;
                let key_bytes: [u8; 32] = rand::thread_rng().gen();
                let key_hex = hex::encode(key_bytes);

                // Store the new key
                entry
                    .set_password(&key_hex)
                    .map_err(|e| self.map_keyring_error(e, "store encryption key"))?;

                Ok(key_hex)
            }
            Err(e) => Err(self.map_keyring_error(e, "retrieve encryption key")),
        }
    }

    /// Checks if database encryption key exists.
    pub fn has_db_encryption_key(&self) -> bool {
        if let Ok(entry) = Entry::new(&self.service_name, DB_ENCRYPTION_KEY) {
            entry.get_password().is_ok()
        } else {
            false
        }
    }

    // ==================== Database Connection Passwords ====================

    /// Stores a database connection password in the keychain.
    /// This keeps sensitive database credentials out of the SQLite file.
    pub fn store_db_password(&self, connection_id: &str, password: &str) -> Result<()> {
        if connection_id.is_empty() {
            return Err(AppError::ValidationError(
                "Connection ID cannot be empty".to_string(),
            ));
        }

        let entry = self.get_entry(connection_id, DB_PASSWORD_PREFIX)?;
        entry
            .set_password(password)
            .map_err(|e| self.map_keyring_error(e, "store database password"))
    }

    /// Retrieves a database connection password from the keychain.
    pub fn retrieve_db_password(&self, connection_id: &str) -> Result<String> {
        if connection_id.is_empty() {
            return Err(AppError::ValidationError(
                "Connection ID cannot be empty".to_string(),
            ));
        }

        let entry = self.get_entry(connection_id, DB_PASSWORD_PREFIX)?;
        entry
            .get_password()
            .map_err(|e| self.map_keyring_error(e, "retrieve database password"))
    }

    /// Deletes a database connection password from the keychain.
    pub fn delete_db_password(&self, connection_id: &str) -> Result<()> {
        if connection_id.is_empty() {
            return Err(AppError::ValidationError(
                "Connection ID cannot be empty".to_string(),
            ));
        }

        if let Ok(entry) = self.get_entry(connection_id, DB_PASSWORD_PREFIX) {
            if let Err(e) = entry.delete_credential() {
                if !matches!(e, keyring::Error::NoEntry) {
                    return Err(self.map_keyring_error(e, "delete database password"));
                }
            }
        }
        Ok(())
    }

    /// Checks if a database password exists for the given connection ID.
    pub fn has_db_password(&self, connection_id: &str) -> bool {
        if connection_id.is_empty() {
            return false;
        }
        self.retrieve_db_password(connection_id).is_ok()
    }
}

impl Default for CredentialStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: These tests require a working system keychain.
    // They use a unique service name to avoid conflicts with real credentials.

    fn test_store() -> CredentialStore {
        CredentialStore::with_service_name("devops-commander-test")
    }

    fn cleanup_test_credential(store: &CredentialStore, server_id: &str) {
        let _ = store.delete_credential(server_id);
    }

    #[test]
    fn test_store_and_retrieve_password() {
        let store = test_store();
        let server_id = "test-server-password-1";

        // Cleanup any existing test data
        cleanup_test_credential(&store, server_id);

        // Store password
        let result = store.store_password(server_id, "test-password-123");
        assert!(result.is_ok(), "Failed to store password: {:?}", result);

        // Retrieve password
        let retrieved = store.retrieve_password(server_id);
        assert!(
            retrieved.is_ok(),
            "Failed to retrieve password: {:?}",
            retrieved
        );
        assert_eq!(retrieved.unwrap(), "test-password-123");

        // Cleanup
        cleanup_test_credential(&store, server_id);
    }

    #[test]
    fn test_store_and_retrieve_key_path() {
        let store = test_store();
        let server_id = "test-server-keypath-1";

        // Cleanup any existing test data
        cleanup_test_credential(&store, server_id);

        // Store key path
        let result = store.store_key_path(server_id, "/home/user/.ssh/id_rsa");
        assert!(result.is_ok(), "Failed to store key path: {:?}", result);

        // Retrieve key path
        let retrieved = store.retrieve_key_path(server_id);
        assert!(
            retrieved.is_ok(),
            "Failed to retrieve key path: {:?}",
            retrieved
        );
        assert_eq!(retrieved.unwrap(), "/home/user/.ssh/id_rsa");

        // Cleanup
        cleanup_test_credential(&store, server_id);
    }

    #[test]
    fn test_delete_credential() {
        let store = test_store();
        let server_id = "test-server-delete-1";

        // Cleanup any existing test data
        cleanup_test_credential(&store, server_id);

        // Store both password and key path
        store.store_password(server_id, "password123").unwrap();
        store.store_key_path(server_id, "/path/to/key").unwrap();

        // Verify they exist
        assert!(store.has_password(server_id));
        assert!(store.has_key_path(server_id));

        // Delete all credentials
        let result = store.delete_credential(server_id);
        assert!(result.is_ok(), "Failed to delete credentials: {:?}", result);

        // Verify they're gone
        assert!(!store.has_password(server_id));
        assert!(!store.has_key_path(server_id));
    }

    #[test]
    fn test_has_credential() {
        let store = test_store();
        let server_id = "test-server-has-1";

        // Cleanup any existing test data
        cleanup_test_credential(&store, server_id);

        // Initially no credential
        assert!(!store.has_credential(server_id));

        // Store password
        store.store_password(server_id, "password").unwrap();
        assert!(store.has_credential(server_id));

        // Cleanup
        cleanup_test_credential(&store, server_id);
    }

    #[test]
    fn test_empty_server_id_validation() {
        let store = test_store();

        // Empty server ID should fail
        assert!(store.store_password("", "password").is_err());
        assert!(store.retrieve_password("").is_err());
        assert!(store.store_key_path("", "/path").is_err());
        assert!(store.retrieve_key_path("").is_err());
        assert!(store.delete_credential("").is_err());
    }

    #[test]
    fn test_empty_credential_validation() {
        let store = test_store();

        // Empty password should fail
        assert!(store.store_password("server-id", "").is_err());

        // Empty key path should fail
        assert!(store.store_key_path("server-id", "").is_err());
    }

    #[test]
    fn test_retrieve_nonexistent_credential() {
        let store = test_store();
        let server_id = "nonexistent-server-12345";

        // Cleanup to ensure it doesn't exist
        cleanup_test_credential(&store, server_id);

        // Should return error for nonexistent credential
        let result = store.retrieve_password(server_id);
        assert!(result.is_err());

        let result = store.retrieve_key_path(server_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_check_availability() {
        let store = test_store();

        // This should succeed if keychain is available
        let result = store.check_availability();
        // We don't assert success because it depends on the system,
        // but we verify it doesn't panic
        let _ = result;
    }

    #[test]
    fn test_overwrite_credential() {
        let store = test_store();
        let server_id = "test-server-overwrite-1";

        // Cleanup any existing test data
        cleanup_test_credential(&store, server_id);

        // Store initial password
        store.store_password(server_id, "initial-password").unwrap();
        assert_eq!(
            store.retrieve_password(server_id).unwrap(),
            "initial-password"
        );

        // Overwrite with new password
        store.store_password(server_id, "new-password").unwrap();
        assert_eq!(store.retrieve_password(server_id).unwrap(), "new-password");

        // Cleanup
        cleanup_test_credential(&store, server_id);
    }

    #[test]
    fn test_store_and_retrieve_key_passphrase() {
        let store = test_store();
        let server_id = "test-server-passphrase-1";

        // Cleanup any existing test data
        cleanup_test_credential(&store, server_id);

        // Store passphrase
        let result = store.store_key_passphrase(server_id, "my-secret-passphrase");
        assert!(result.is_ok(), "Failed to store passphrase: {:?}", result);

        // Retrieve passphrase
        let retrieved = store.retrieve_key_passphrase(server_id);
        assert!(
            retrieved.is_ok(),
            "Failed to retrieve passphrase: {:?}",
            retrieved
        );
        assert_eq!(retrieved.unwrap(), Some("my-secret-passphrase".to_string()));

        // Cleanup
        cleanup_test_credential(&store, server_id);
    }

    #[test]
    fn test_retrieve_nonexistent_passphrase_returns_none() {
        let store = test_store();
        let server_id = "test-server-no-passphrase";

        // Cleanup to ensure it doesn't exist
        cleanup_test_credential(&store, server_id);

        // Should return None for nonexistent passphrase
        let result = store.retrieve_key_passphrase(server_id);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), None);
    }

    #[test]
    fn test_empty_passphrase_returns_none() {
        let store = test_store();
        let server_id = "test-server-empty-passphrase";

        // Cleanup any existing test data
        cleanup_test_credential(&store, server_id);

        // Store empty passphrase (valid - means key has no passphrase)
        let result = store.store_key_passphrase(server_id, "");
        assert!(result.is_ok());

        // Retrieve should return None for empty passphrase
        let retrieved = store.retrieve_key_passphrase(server_id);
        assert!(retrieved.is_ok());
        assert_eq!(retrieved.unwrap(), None);

        // Cleanup
        cleanup_test_credential(&store, server_id);
    }

    #[test]
    fn test_delete_key_passphrase() {
        let store = test_store();
        let server_id = "test-server-delete-passphrase";

        // Cleanup any existing test data
        cleanup_test_credential(&store, server_id);

        // Store passphrase
        store
            .store_key_passphrase(server_id, "passphrase123")
            .unwrap();
        assert_eq!(
            store.retrieve_key_passphrase(server_id).unwrap(),
            Some("passphrase123".to_string())
        );

        // Delete passphrase
        let result = store.delete_key_passphrase(server_id);
        assert!(result.is_ok());

        // Verify it's gone
        assert_eq!(store.retrieve_key_passphrase(server_id).unwrap(), None);

        // Cleanup
        cleanup_test_credential(&store, server_id);
    }
}
