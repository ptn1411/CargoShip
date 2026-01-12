use crate::credentials::CredentialStore;
use crate::error::{AppError, Result};
use super::models::*;
use chrono::Utc;
use sqlx::SqlitePool;
use std::sync::Arc;
use uuid::Uuid;

pub struct ServerManager {
    db: SqlitePool,
    credential_store: Arc<CredentialStore>,
}

impl ServerManager {
    pub fn new(db: SqlitePool, credential_store: Arc<CredentialStore>) -> Self {
        Self { db, credential_store }
    }

    pub fn validate_server_input(input: &CreateServerInput) -> Result<()> {
        if input.host.trim().is_empty() {
            return Err(AppError::ValidationError("Hostname cannot be empty".to_string()));
        }

        // Port must be between 1 and 65535 (u16 max is 65535, but 0 is invalid)
        if input.port == 0 {
            return Err(AppError::ValidationError(
                "Port must be between 1 and 65535".to_string(),
            ));
        }

        if input.username.trim().is_empty() {
            return Err(AppError::ValidationError("Username cannot be empty".to_string()));
        }

        if input.name.trim().is_empty() {
            return Err(AppError::ValidationError("Server name cannot be empty".to_string()));
        }

        Ok(())
    }

    /// Validates partial update input for existing server
    pub fn validate_update_input(host: Option<&str>, port: Option<u16>) -> Result<()> {
        if let Some(h) = host {
            if h.trim().is_empty() {
                return Err(AppError::ValidationError("Hostname cannot be empty".to_string()));
            }
        }

        if let Some(p) = port {
            if p == 0 {
                return Err(AppError::ValidationError(
                    "Port must be between 1 and 65535".to_string(),
                ));
            }
        }

        Ok(())
    }

    pub async fn check_duplicate(&self, host: &str, port: u16, username: &str, exclude_id: Option<&str>) -> Result<bool> {
        let query = match exclude_id {
            Some(id) => {
                sqlx::query_scalar::<_, i64>(
                    "SELECT COUNT(*) FROM servers WHERE host = ? AND port = ? AND username = ? AND id != ?"
                )
                .bind(host)
                .bind(port as i32)
                .bind(username)
                .bind(id)
            }
            None => {
                sqlx::query_scalar::<_, i64>(
                    "SELECT COUNT(*) FROM servers WHERE host = ? AND port = ? AND username = ?"
                )
                .bind(host)
                .bind(port as i32)
                .bind(username)
            }
        };

        let count = query.fetch_one(&self.db).await?;
        Ok(count > 0)
    }

    pub async fn create_server(&self, input: CreateServerInput) -> Result<Server> {
        Self::validate_server_input(&input)?;

        // Check for duplicate server (same host, port, username)
        if self.check_duplicate(&input.host, input.port, &input.username, None).await? {
            return Err(AppError::DuplicateServerWarning(
                input.host.clone(),
                input.port,
                input.username.clone(),
            ));
        }

        let now = Utc::now();
        let id = Uuid::new_v4().to_string();
        let tags_json = serde_json::to_string(&input.tags).unwrap_or_else(|_| "[]".to_string());

        sqlx::query(
            r#"
            INSERT INTO servers (id, name, host, port, username, auth_method, tags, environment, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&input.name)
        .bind(&input.host)
        .bind(input.port as i32)
        .bind(&input.username)
        .bind(input.auth_method.to_string())
        .bind(&tags_json)
        .bind(input.environment.to_string())
        .bind(now.to_rfc3339())
        .bind(now.to_rfc3339())
        .execute(&self.db)
        .await?;

        Ok(Server {
            id,
            name: input.name,
            host: input.host,
            port: input.port,
            username: input.username,
            auth_method: input.auth_method,
            tags: input.tags,
            environment: input.environment,
            created_at: now,
            updated_at: now,
            last_connected: None,
        })
    }

    /// Create server with force flag to bypass duplicate warning
    pub async fn create_server_force(&self, input: CreateServerInput) -> Result<Server> {
        Self::validate_server_input(&input)?;

        let now = Utc::now();
        let id = Uuid::new_v4().to_string();
        let tags_json = serde_json::to_string(&input.tags).unwrap_or_else(|_| "[]".to_string());

        sqlx::query(
            r#"
            INSERT INTO servers (id, name, host, port, username, auth_method, tags, environment, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&input.name)
        .bind(&input.host)
        .bind(input.port as i32)
        .bind(&input.username)
        .bind(input.auth_method.to_string())
        .bind(&tags_json)
        .bind(input.environment.to_string())
        .bind(now.to_rfc3339())
        .bind(now.to_rfc3339())
        .execute(&self.db)
        .await?;

        Ok(Server {
            id,
            name: input.name,
            host: input.host,
            port: input.port,
            username: input.username,
            auth_method: input.auth_method,
            tags: input.tags,
            environment: input.environment,
            created_at: now,
            updated_at: now,
            last_connected: None,
        })
    }

    pub async fn get_server(&self, id: &str) -> Result<Option<Server>> {
        let row = sqlx::query_as::<_, ServerRow>(
            "SELECT * FROM servers WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await?;

        Ok(row.map(|r| r.into_server()))
    }

    pub async fn list_servers(&self) -> Result<Vec<Server>> {
        let rows = sqlx::query_as::<_, ServerRow>(
            "SELECT * FROM servers ORDER BY name"
        )
        .fetch_all(&self.db)
        .await?;

        Ok(rows.into_iter().map(|r| r.into_server()).collect())
    }

    pub async fn update_server(&self, id: &str, input: UpdateServerInput) -> Result<Server> {
        let existing = self.get_server(id).await?
            .ok_or_else(|| AppError::ServerNotFound(id.to_string()))?;

        let name = input.name.unwrap_or(existing.name);
        let host = input.host.clone().unwrap_or(existing.host.clone());
        let port = input.port.unwrap_or(existing.port);
        let username = input.username.clone().unwrap_or(existing.username.clone());
        let auth_method = input.auth_method.unwrap_or(existing.auth_method);
        let tags = input.tags.unwrap_or(existing.tags);
        let environment = input.environment.unwrap_or(existing.environment);

        // Validate the updated values
        Self::validate_update_input(input.host.as_deref(), input.port)?;

        if name.trim().is_empty() {
            return Err(AppError::ValidationError("Server name cannot be empty".to_string()));
        }
        if username.trim().is_empty() {
            return Err(AppError::ValidationError("Username cannot be empty".to_string()));
        }

        // Check for duplicate if host, port, or username changed
        let host_changed = input.host.is_some() && input.host.as_ref() != Some(&existing.host);
        let port_changed = input.port.is_some() && input.port != Some(existing.port);
        let username_changed = input.username.is_some() && input.username.as_ref() != Some(&existing.username);

        if host_changed || port_changed || username_changed {
            if self.check_duplicate(&host, port, &username, Some(id)).await? {
                return Err(AppError::DuplicateServerWarning(
                    host.clone(),
                    port,
                    username.clone(),
                ));
            }
        }

        let now = Utc::now();
        let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());

        sqlx::query(
            r#"
            UPDATE servers 
            SET name = ?, host = ?, port = ?, username = ?, auth_method = ?, tags = ?, environment = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(&name)
        .bind(&host)
        .bind(port as i32)
        .bind(&username)
        .bind(auth_method.to_string())
        .bind(&tags_json)
        .bind(environment.to_string())
        .bind(now.to_rfc3339())
        .bind(id)
        .execute(&self.db)
        .await?;

        Ok(Server {
            id: id.to_string(),
            name,
            host,
            port,
            username,
            auth_method,
            tags,
            environment,
            created_at: existing.created_at,
            updated_at: now,
            last_connected: existing.last_connected,
        })
    }

    pub async fn delete_server(&self, id: &str) -> Result<()> {
        // First delete associated credentials
        let _ = self.credential_store.delete_credential(id);

        let result = sqlx::query("DELETE FROM servers WHERE id = ?")
            .bind(id)
            .execute(&self.db)
            .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::ServerNotFound(id.to_string()));
        }

        Ok(())
    }

    pub async fn update_last_connected(&self, id: &str) -> Result<()> {
        let now = Utc::now();
        sqlx::query("UPDATE servers SET last_connected = ? WHERE id = ?")
            .bind(now.to_rfc3339())
            .bind(id)
            .execute(&self.db)
            .await?;
        Ok(())
    }
}

// Helper struct for database row mapping
#[derive(sqlx::FromRow)]
struct ServerRow {
    id: String,
    name: String,
    host: String,
    port: i32,
    username: String,
    auth_method: String,
    tags: String,
    environment: String,
    created_at: String,
    updated_at: String,
    last_connected: Option<String>,
}

impl ServerRow {
    fn into_server(self) -> Server {
        Server {
            id: self.id,
            name: self.name,
            host: self.host,
            port: self.port as u16,
            username: self.username,
            auth_method: self.auth_method.parse().unwrap_or(AuthMethod::Password),
            tags: serde_json::from_str(&self.tags).unwrap_or_default(),
            environment: self.environment.parse().unwrap_or(Environment::Dev),
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            updated_at: chrono::DateTime::parse_from_rfc3339(&self.updated_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            last_connected: self.last_connected.and_then(|s| {
                chrono::DateTime::parse_from_rfc3339(&s)
                    .map(|dt| dt.with_timezone(&Utc))
                    .ok()
            }),
        }
    }
}
