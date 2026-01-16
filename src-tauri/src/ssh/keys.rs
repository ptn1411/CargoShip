use crate::error::{AppError, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use ssh_key::{LineEnding, PrivateKey};
use uuid::Uuid;

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

/// SSH Key stored in database
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
    pub bits: Option<u32>, // For RSA keys (2048, 4096)
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

/// SSH Key Manager
pub struct SshKeyManager {
    db: SqlitePool,
}

impl SshKeyManager {
    pub fn new(db: SqlitePool) -> Self {
        Self { db }
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
                        "RSA key must be at least 2048 bits".to_string()
                    ));
                }
                let key = ssh_key::private::RsaKeypair::random(&mut rand::thread_rng(), bits as usize)
                    .map_err(|e| AppError::SshError(format!("Failed to generate RSA key: {}", e)))?;
                PrivateKey::from(key)
            }
        };

        // Get public key
        let public_key = private_key.public_key();
        let public_key_str = format!("{} {}", public_key.to_openssh().map_err(|e| {
            AppError::SshError(format!("Failed to serialize public key: {}", e))
        })?, comment);

        // Calculate fingerprint
        let fingerprint = public_key.fingerprint(ssh_key::HashAlg::Sha256).to_string();

        // Serialize private key (with or without passphrase)
        let private_key_pem = if let Some(ref pass) = input.passphrase {
            if !pass.is_empty() {
                private_key.encrypt(&mut rand::thread_rng(), pass.as_bytes())
                    .map_err(|e| AppError::SshError(format!("Failed to encrypt key: {}", e)))?
                    .to_openssh(LineEnding::LF)
                    .map_err(|e| AppError::SshError(format!("Failed to serialize key: {}", e)))?
                    .to_string()
            } else {
                private_key.to_openssh(LineEnding::LF)
                    .map_err(|e| AppError::SshError(format!("Failed to serialize key: {}", e)))?
                    .to_string()
            }
        } else {
            private_key.to_openssh(LineEnding::LF)
                .map_err(|e| AppError::SshError(format!("Failed to serialize key: {}", e)))?
                .to_string()
        };

        let now = Utc::now();
        let key_type_str = input.key_type.to_string();

        // Store in database
        sqlx::query(
            r#"
            INSERT INTO ssh_keys (id, name, key_type, private_key, public_key, fingerprint, comment, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&input.name)
        .bind(&key_type_str)
        .bind(&private_key_pem)
        .bind(&public_key_str)
        .bind(&fingerprint)
        .bind(&input.comment)
        .bind(now.to_rfc3339())
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
        let rows = sqlx::query_as::<_, (String, String, String, String, String, Option<String>, String)>(
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
            .map(|(id, name, key_type, public_key, fingerprint, comment, created_at)| {
                SshKey {
                    id,
                    name,
                    key_type,
                    public_key,
                    fingerprint,
                    comment,
                    created_at: DateTime::parse_from_rfc3339(&created_at)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
                }
            })
            .collect();

        Ok(keys)
    }

    /// Get a specific SSH key by ID (without private key)
    pub async fn get_key(&self, id: &str) -> Result<Option<SshKey>> {
        let row = sqlx::query_as::<_, (String, String, String, String, String, Option<String>, String)>(
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

        Ok(row.map(|(id, name, key_type, public_key, fingerprint, comment, created_at)| {
            SshKey {
                id,
                name,
                key_type,
                public_key,
                fingerprint,
                comment,
                created_at: DateTime::parse_from_rfc3339(&created_at)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            }
        }))
    }

    /// Get private key content (for connection use)
    pub async fn get_private_key(&self, id: &str) -> Result<String> {
        let row = sqlx::query_as::<_, (String,)>(
            "SELECT private_key FROM ssh_keys WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get private key: {}", e)))?;

        row.map(|(pk,)| pk)
            .ok_or_else(|| AppError::NotFound(format!("SSH key not found: {}", id)))
    }

    /// Delete an SSH key
    pub async fn delete_key(&self, id: &str) -> Result<()> {
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
    pub async fn update_key(&self, id: &str, name: Option<String>, comment: Option<String>) -> Result<SshKey> {
        // Build update query dynamically
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
            return self.get_key(id).await?.ok_or_else(|| {
                AppError::NotFound(format!("SSH key not found: {}", id))
            });
        }

        let query = format!(
            "UPDATE ssh_keys SET {} WHERE id = ?",
            updates.join(", ")
        );

        let mut q = sqlx::query(&query);
        for p in &params {
            q = q.bind(p);
        }
        q = q.bind(id);

        q.execute(&self.db)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to update SSH key: {}", e)))?;

        self.get_key(id).await?.ok_or_else(|| {
            AppError::NotFound(format!("SSH key not found: {}", id))
        })
    }

    /// Export public key in OpenSSH format
    pub async fn export_public_key(&self, id: &str) -> Result<String> {
        let key = self.get_key(id).await?.ok_or_else(|| {
            AppError::NotFound(format!("SSH key not found: {}", id))
        })?;
        Ok(key.public_key)
    }

    /// Write private key to a temporary file for SSH connection
    pub async fn write_temp_key(&self, id: &str) -> Result<tempfile::NamedTempFile> {
        use std::io::Write;
        
        let private_key = self.get_private_key(id).await?;
        
        let mut temp_file = tempfile::NamedTempFile::new().map_err(|e| {
            AppError::SshError(format!("Failed to create temp key file: {}", e))
        })?;
        
        temp_file.write_all(private_key.as_bytes()).map_err(|e| {
            AppError::SshError(format!("Failed to write temp key file: {}", e))
        })?;
        
        temp_file.flush().map_err(|e| {
            AppError::SshError(format!("Failed to flush temp key file: {}", e))
        })?;
        
        Ok(temp_file)
    }
}
