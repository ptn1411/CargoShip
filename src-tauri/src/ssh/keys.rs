use crate::error::{AppError, Result};
use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use ssh_key::{LineEnding, PrivateKey};
use uuid::Uuid;

const SSH_PRIVATE_KEY_PREFIX: &str = "ssh-private-key";

/// SSH Key type
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SshKeyType {
    Rsa,
    Ed25519,
}

impl std::fmt::Display for SshKeyType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SshKeyType::Rsa => write!(f, "rsa"),
            SshKeyType::Ed25519 => write!(f, "ed25519"),
        }
    }
}

impl std::str::FromStr for SshKeyType {
    type Err = String;

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "rsa" => Ok(SshKeyType::Rsa),
            "ed25519" => Ok(SshKeyType::Ed25519),
            _ => Err(format!("Unknown key type: {}", s)),
        }
    }
}

/// SSH Key stored in database (public info only)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshKey {
    pub id: String,
    pub name: String,
    pub key_type: String,
    pub public_key: String,
    pub fingerprint: String,
    pub comment: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Input for creating a new SSH key
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSshKeyInput {
    pub name: String,
    pub key_type: SshKeyType,
    pub passphrase: Option<String>,
    pub comment: Option<String>,
    pub bits: Option<u32>,
}

/// Result of key generation
#[derive(Debug, Clone, Serialize)]
pub struct GeneratedKey {
    pub id: String,
    pub name: String,
    pub key_type: String,
    pub public_key: String,
    pub fingerprint: String,
}

/// SSH Key Manager - stores private keys in OS keychain for security
pub struct SshKeyManager {
    db: SqlitePool,
}

impl SshKeyManager {
    pub fn new(db: SqlitePool) -> Self {
        Self { db }
    }

    /// Encrypt data using AES-256-GCM
    fn encrypt_data(data: &[u8], key_bytes: &[u8; 32]) -> Result<String> {
        let key = Key::<Aes256Gcm>::from_slice(key_bytes);
        let cipher = Aes256Gcm::new(key);
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng); // 96-bits; unique per message

        let ciphertext = cipher
            .encrypt(&nonce, data)
            .map_err(|e| AppError::SshError(format!("Encryption failed: {}", e)))?;

        // Format: nonce + ciphertext (base64)
        let mut combined = nonce.to_vec();
        combined.extend(ciphertext);

        // Standard base64 engine
        use base64::{engine::general_purpose, Engine as _};
        Ok(general_purpose::STANDARD.encode(combined))
    }

    /// Decrypt data using AES-256-GCM
    fn decrypt_data(encrypted_data_base64: &str, key_bytes: &[u8; 32]) -> Result<Vec<u8>> {
        use base64::{engine::general_purpose, Engine as _};
        let encrypted_bytes = general_purpose::STANDARD
            .decode(encrypted_data_base64)
            .map_err(|e| AppError::SshError(format!("Base64 decode failed: {}", e)))?;

        if encrypted_bytes.len() < 12 {
            return Err(AppError::SshError(
                "Invalid encrypted data length".to_string(),
            ));
        }

        let key = Key::<Aes256Gcm>::from_slice(key_bytes);
        let cipher = Aes256Gcm::new(key);
        let nonce = Nonce::from_slice(&encrypted_bytes[..12]);
        let ciphertext = &encrypted_bytes[12..];

        cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| AppError::SshError(format!("Decryption failed: {}", e)))
    }

    /// Store private key in keychain
    fn store_private_key(&self, key_id: &str, private_key: &str) -> Result<()> {
        let entry_key = format!("{}:{}", SSH_PRIVATE_KEY_PREFIX, key_id);
        let entry = keyring::Entry::new("devops-commander", &entry_key)
            .map_err(|e| AppError::CredentialError(format!("Failed to access keychain: {}", e)))?;

        entry
            .set_password(private_key)
            .map_err(|e| AppError::CredentialError(format!("Failed to store private key: {}", e)))
    }

    /// Store Key Encryption Key (KEK) in keychain
    fn store_kek(&self, key_id: &str, kek_base64: &str) -> Result<()> {
        // Use the same prefix but store a small key instead of the full blob
        self.store_private_key(key_id, kek_base64)
    }

    /// Retrieve raw content from keychain
    pub(crate) fn retrieve_from_keyring(&self, key_id: &str) -> Result<String> {
        let entry_key = format!("{}:{}", SSH_PRIVATE_KEY_PREFIX, key_id);
        let entry = keyring::Entry::new("devops-commander", &entry_key)
            .map_err(|e| AppError::CredentialError(format!("Failed to access keychain: {}", e)))?;

        entry.get_password().map_err(|e| {
            AppError::CredentialError(format!("Failed to retrieve private key: {}", e))
        })
    }

    /// Retrieve private key from keychain or hybrid storage
    pub(crate) fn retrieve_private_key(&self, key_id: &str) -> Result<String> {
        // Check if we have an encrypted blob in the DB (new/hybrid method)
        // We MUST spawn a separate thread to run the async block because we might be calling this
        // from within a Tokio runtime worker thread (which panics if we try to block_on).
        let db = self.db.clone();
        let key_id_owned = key_id.to_string();

        let row = std::thread::spawn(move || {
            tauri::async_runtime::block_on(async move {
                sqlx::query_as::<_, (Option<String>,)>(
                    "SELECT encrypted_private_key FROM ssh_keys WHERE id = ?",
                )
                .bind(key_id_owned)
                .fetch_optional(&db)
                .await
            })
        })
        .join()
        .map_err(|_| AppError::SshError("Thread panicked during key retrieval".to_string()))?
        .map_err(|e| AppError::DatabaseError(format!("Failed to query SSH key: {}", e)))?;

        if let Some((Some(encrypted_blob),)) = row {
            // Hybrid mode: KEK is in keyring, encrypted blob is in DB
            let kek_base64 = self.retrieve_from_keyring(key_id)?;

            use base64::{engine::general_purpose, Engine as _};
            let kek_bytes = general_purpose::STANDARD
                .decode(&kek_base64)
                .map_err(|e| AppError::SshError(format!("Invalid KEK format: {}", e)))?;

            if kek_bytes.len() != 32 {
                return Err(AppError::SshError("Invalid KEK length".to_string()));
            }

            let mut key_arr = [0u8; 32];
            key_arr.copy_from_slice(&kek_bytes);

            let decrypted_bytes = Self::decrypt_data(&encrypted_blob, &key_arr)?;

            return String::from_utf8(decrypted_bytes)
                .map_err(|e| AppError::SshError(format!("Invalid UTF-8 in private key: {}", e)));
        }

        // Legacy mode: Full private key is in keyring
        self.retrieve_from_keyring(key_id)
    }

    /// Delete private key from keychain
    fn delete_private_key(&self, key_id: &str) -> Result<()> {
        let entry_key = format!("{}:{}", SSH_PRIVATE_KEY_PREFIX, key_id);
        if let Ok(entry) = keyring::Entry::new("devops-commander", &entry_key) {
            let _ = entry.delete_credential(); // Ignore errors if not found
        }
        Ok(())
    }

    /// Generate a new SSH key pair
    pub async fn generate_key(&self, input: CreateSshKeyInput) -> Result<GeneratedKey> {
        let id = Uuid::new_v4().to_string();
        let comment = input.comment.clone().unwrap_or_else(|| input.name.clone());

        // Generate key based on type
        let private_key = match input.key_type {
            SshKeyType::Ed25519 => {
                let key = ssh_key::private::Ed25519Keypair::random(&mut rand::thread_rng());
                PrivateKey::from(key)
            }
            SshKeyType::Rsa => {
                let bits = input.bits.unwrap_or(4096);
                if bits < 2048 {
                    return Err(AppError::ValidationError(
                        "RSA key must be at least 2048 bits".to_string(),
                    ));
                }
                let key =
                    ssh_key::private::RsaKeypair::random(&mut rand::thread_rng(), bits as usize)
                        .map_err(|e| {
                            AppError::SshError(format!("Failed to generate RSA key: {}", e))
                        })?;
                PrivateKey::from(key)
            }
        };

        // Get public key
        let public_key = private_key.public_key();
        let public_key_str = format!(
            "{} {}",
            public_key.to_openssh().map_err(|e| {
                AppError::SshError(format!("Failed to serialize public key: {}", e))
            })?,
            comment
        );

        // Calculate fingerprint
        let fingerprint = public_key.fingerprint(ssh_key::HashAlg::Sha256).to_string();

        // Serialize private key (with or without passphrase)
        let private_key_pem = if let Some(ref pass) = input.passphrase {
            if !pass.is_empty() {
                private_key
                    .encrypt(&mut rand::thread_rng(), pass.as_bytes())
                    .map_err(|e| AppError::SshError(format!("Failed to encrypt key: {}", e)))?
                    .to_openssh(LineEnding::LF)
                    .map_err(|e| AppError::SshError(format!("Failed to serialize key: {}", e)))?
                    .to_string()
            } else {
                private_key
                    .to_openssh(LineEnding::LF)
                    .map_err(|e| AppError::SshError(format!("Failed to serialize key: {}", e)))?
                    .to_string()
            }
        } else {
            private_key
                .to_openssh(LineEnding::LF)
                .map_err(|e| AppError::SshError(format!("Failed to serialize key: {}", e)))?
                .to_string()
        };

        // Hybrid Encryption Storage Strategy
        // 1. Generate a random 32-byte Key Encryption Key (KEK)
        let mut kek = [0u8; 32];
        rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut kek);

        // 2. Encrypt the private key PEM with the KEK
        let encrypted_blob = Self::encrypt_data(private_key_pem.as_bytes(), &kek)?;

        // 3. Store KEK in Keychain (safe, small size)
        use base64::{engine::general_purpose, Engine as _};
        let kek_base64 = general_purpose::STANDARD.encode(kek);
        self.store_kek(&id, &kek_base64)?;

        let now = Utc::now();
        let key_type_str = input.key_type.to_string();

        // 4. Store public info AND encrypted private key in database
        sqlx::query(
            r#"
            INSERT INTO ssh_keys (id, name, key_type, public_key, fingerprint, comment, created_at, encrypted_private_key)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&input.name)
        .bind(&key_type_str)
        .bind(&public_key_str)
        .bind(&fingerprint)
        .bind(&input.comment)
        .bind(now.to_rfc3339())
        .bind(&encrypted_blob)
        .execute(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to store SSH key: {}", e)))?;

        Ok(GeneratedKey {
            id,
            name: input.name,
            key_type: key_type_str,
            public_key: public_key_str,
            fingerprint,
        })
    }

    /// List all SSH keys (without private key data)
    pub async fn list_keys(&self) -> Result<Vec<SshKey>> {
        let rows = sqlx::query_as::<
            _,
            (
                String,
                String,
                String,
                String,
                String,
                Option<String>,
                String,
            ),
        >(
            r#"
            SELECT id, name, key_type, public_key, fingerprint, comment, created_at
            FROM ssh_keys
            ORDER BY created_at DESC
            "#,
        )
        .fetch_all(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to list SSH keys: {}", e)))?;

        let keys = rows
            .into_iter()
            .map(
                |(id, name, key_type, public_key, fingerprint, comment, created_at)| SshKey {
                    id,
                    name,
                    key_type,
                    public_key,
                    fingerprint,
                    comment,
                    created_at: DateTime::parse_from_rfc3339(&created_at)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
                },
            )
            .collect();

        Ok(keys)
    }

    /// Get a specific SSH key by ID (without private key)
    pub async fn get_key(&self, id: &str) -> Result<Option<SshKey>> {
        let row = sqlx::query_as::<
            _,
            (
                String,
                String,
                String,
                String,
                String,
                Option<String>,
                String,
            ),
        >(
            r#"
            SELECT id, name, key_type, public_key, fingerprint, comment, created_at
            FROM ssh_keys
            WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get SSH key: {}", e)))?;

        Ok(row.map(
            |(id, name, key_type, public_key, fingerprint, comment, created_at)| SshKey {
                id,
                name,
                key_type,
                public_key,
                fingerprint,
                comment,
                created_at: DateTime::parse_from_rfc3339(&created_at)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            },
        ))
    }

    /// Get private key content from keychain (for connection use)
    pub async fn get_private_key(&self, id: &str) -> Result<String> {
        self.retrieve_private_key(id)
    }

    /// Delete an SSH key (from both database and keychain)
    pub async fn delete_key(&self, id: &str) -> Result<()> {
        // Delete from keychain first
        self.delete_private_key(id)?;

        // Delete from database
        let result = sqlx::query("DELETE FROM ssh_keys WHERE id = ?")
            .bind(id)
            .execute(&self.db)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to delete SSH key: {}", e)))?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("SSH key not found: {}", id)));
        }

        Ok(())
    }

    /// Update SSH key name/comment
    pub async fn update_key(
        &self,
        id: &str,
        name: Option<String>,
        comment: Option<String>,
    ) -> Result<SshKey> {
        let mut updates = Vec::new();
        let mut params: Vec<String> = Vec::new();

        if let Some(ref n) = name {
            updates.push("name = ?");
            params.push(n.clone());
        }
        if let Some(ref c) = comment {
            updates.push("comment = ?");
            params.push(c.clone());
        }

        if updates.is_empty() {
            return self
                .get_key(id)
                .await?
                .ok_or_else(|| AppError::NotFound(format!("SSH key not found: {}", id)));
        }

        let query = format!("UPDATE ssh_keys SET {} WHERE id = ?", updates.join(", "));

        let mut q = sqlx::query(&query);
        for p in &params {
            q = q.bind(p);
        }
        q = q.bind(id);

        q.execute(&self.db)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to update SSH key: {}", e)))?;

        self.get_key(id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("SSH key not found: {}", id)))
    }

    /// Export public key in OpenSSH format
    pub async fn export_public_key(&self, id: &str) -> Result<String> {
        let key = self
            .get_key(id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("SSH key not found: {}", id)))?;
        Ok(key.public_key)
    }

    /// Write private key to a temporary file for SSH connection
    pub async fn write_temp_key(&self, id: &str) -> Result<tempfile::NamedTempFile> {
        use std::io::Write;

        let private_key = self.get_private_key(id).await?;

        let mut temp_file = tempfile::NamedTempFile::new()
            .map_err(|e| AppError::SshError(format!("Failed to create temp key file: {}", e)))?;

        temp_file
            .write_all(private_key.as_bytes())
            .map_err(|e| AppError::SshError(format!("Failed to write temp key file: {}", e)))?;

        temp_file
            .flush()
            .map_err(|e| AppError::SshError(format!("Failed to flush temp key file: {}", e)))?;

        Ok(temp_file)
    }
}
