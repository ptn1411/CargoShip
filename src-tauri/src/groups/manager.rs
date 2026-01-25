use super::models::*;
use crate::error::{AppError, Result};
use crate::server::Server;
use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

pub struct GroupManager {
    db: SqlitePool,
}

impl GroupManager {
    pub fn new(db: SqlitePool) -> Self {
        Self { db }
    }

    /// Validate group input
    fn validate_input(name: &str) -> Result<()> {
        if name.trim().is_empty() {
            return Err(AppError::ValidationError(
                "Group name cannot be empty".to_string(),
            ));
        }
        Ok(())
    }

    /// Create a new server group
    /// Requirements: 1.1
    pub async fn create_group(&self, input: CreateGroupInput) -> Result<ServerGroup> {
        Self::validate_input(&input.name)?;

        let now = Utc::now();
        let id = Uuid::new_v4().to_string();

        // Insert the group
        sqlx::query(
            r#"
            INSERT INTO server_groups (id, name, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&input.name)
        .bind(&input.description)
        .bind(now.to_rfc3339())
        .bind(now.to_rfc3339())
        .execute(&self.db)
        .await?;

        // Add servers to the group if provided
        for server_id in &input.server_ids {
            let _ = self
                .add_server_to_group_internal(&id, server_id, &now)
                .await;
        }

        Ok(ServerGroup {
            id,
            name: input.name,
            description: input.description,
            server_ids: input.server_ids,
            created_at: now,
            updated_at: now,
        })
    }

    /// Get a server group by ID
    /// Requirements: 1.2
    pub async fn get_group(&self, id: &str) -> Result<Option<ServerGroup>> {
        let row = sqlx::query_as::<_, GroupRow>("SELECT * FROM server_groups WHERE id = ?")
            .bind(id)
            .fetch_optional(&self.db)
            .await?;

        match row {
            Some(group_row) => {
                let server_ids = self.get_server_ids_for_group(id).await?;
                Ok(Some(group_row.into_server_group(server_ids)))
            }
            None => Ok(None),
        }
    }

    /// List all server groups
    /// Requirements: 1.2
    pub async fn list_groups(&self) -> Result<Vec<ServerGroup>> {
        let rows = sqlx::query_as::<_, GroupRow>("SELECT * FROM server_groups ORDER BY name")
            .fetch_all(&self.db)
            .await?;

        let mut groups = Vec::new();
        for row in rows {
            let server_ids = self.get_server_ids_for_group(&row.id).await?;
            groups.push(row.into_server_group(server_ids));
        }

        Ok(groups)
    }

    /// Update an existing server group
    /// Requirements: 1.3
    pub async fn update_group(&self, id: &str, input: UpdateGroupInput) -> Result<ServerGroup> {
        let existing = self
            .get_group(id)
            .await?
            .ok_or_else(|| AppError::ValidationError(format!("Group not found: {}", id)))?;

        let name = input.name.unwrap_or(existing.name);
        let description = input.description.or(existing.description);

        Self::validate_input(&name)?;

        let now = Utc::now();

        sqlx::query(
            r#"
            UPDATE server_groups 
            SET name = ?, description = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(&name)
        .bind(&description)
        .bind(now.to_rfc3339())
        .bind(id)
        .execute(&self.db)
        .await?;

        // Update server memberships if provided
        let server_ids = if let Some(new_server_ids) = input.server_ids {
            // Remove all existing memberships
            sqlx::query("DELETE FROM group_members WHERE group_id = ?")
                .bind(id)
                .execute(&self.db)
                .await?;

            // Add new memberships
            for server_id in &new_server_ids {
                let _ = self.add_server_to_group_internal(id, server_id, &now).await;
            }
            new_server_ids
        } else {
            existing.server_ids
        };

        Ok(ServerGroup {
            id: id.to_string(),
            name,
            description,
            server_ids,
            created_at: existing.created_at,
            updated_at: now,
        })
    }

    /// Delete a server group (keeps servers intact)
    /// Requirements: 1.4
    pub async fn delete_group(&self, id: &str) -> Result<()> {
        // The group_members entries will be deleted via CASCADE
        let result = sqlx::query("DELETE FROM server_groups WHERE id = ?")
            .bind(id)
            .execute(&self.db)
            .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::ValidationError(format!(
                "Group not found: {}",
                id
            )));
        }

        Ok(())
    }

    /// Add a server to a group
    /// Requirements: 1.3
    pub async fn add_server_to_group(&self, group_id: &str, server_id: &str) -> Result<()> {
        // Verify group exists
        let _ = self
            .get_group(group_id)
            .await?
            .ok_or_else(|| AppError::ValidationError(format!("Group not found: {}", group_id)))?;

        let now = Utc::now();
        self.add_server_to_group_internal(group_id, server_id, &now)
            .await?;

        // Update group's updated_at timestamp
        sqlx::query("UPDATE server_groups SET updated_at = ? WHERE id = ?")
            .bind(now.to_rfc3339())
            .bind(group_id)
            .execute(&self.db)
            .await?;

        Ok(())
    }

    /// Internal helper to add server to group
    async fn add_server_to_group_internal(
        &self,
        group_id: &str,
        server_id: &str,
        added_at: &DateTime<Utc>,
    ) -> Result<()> {
        // Use INSERT OR IGNORE to handle duplicates gracefully
        sqlx::query(
            r#"
            INSERT OR IGNORE INTO group_members (group_id, server_id, added_at)
            VALUES (?, ?, ?)
            "#,
        )
        .bind(group_id)
        .bind(server_id)
        .bind(added_at.to_rfc3339())
        .execute(&self.db)
        .await?;

        Ok(())
    }

    /// Remove a server from a group
    /// Requirements: 1.3
    pub async fn remove_server_from_group(&self, group_id: &str, server_id: &str) -> Result<()> {
        // Verify group exists
        let _ = self
            .get_group(group_id)
            .await?
            .ok_or_else(|| AppError::ValidationError(format!("Group not found: {}", group_id)))?;

        sqlx::query("DELETE FROM group_members WHERE group_id = ? AND server_id = ?")
            .bind(group_id)
            .bind(server_id)
            .execute(&self.db)
            .await?;

        // Update group's updated_at timestamp
        let now = Utc::now();
        sqlx::query("UPDATE server_groups SET updated_at = ? WHERE id = ?")
            .bind(now.to_rfc3339())
            .bind(group_id)
            .execute(&self.db)
            .await?;

        Ok(())
    }

    /// Get all servers in a group
    /// Requirements: 1.5
    pub async fn get_servers_in_group(&self, group_id: &str) -> Result<Vec<Server>> {
        let rows = sqlx::query_as::<_, ServerRow>(
            r#"
            SELECT s.* FROM servers s
            INNER JOIN group_members gm ON s.id = gm.server_id
            WHERE gm.group_id = ?
            ORDER BY s.name
            "#,
        )
        .bind(group_id)
        .fetch_all(&self.db)
        .await?;

        Ok(rows.into_iter().map(|r| r.into_server()).collect())
    }

    /// Get server IDs for a group
    async fn get_server_ids_for_group(&self, group_id: &str) -> Result<Vec<String>> {
        let ids = sqlx::query_scalar::<_, String>(
            "SELECT server_id FROM group_members WHERE group_id = ? ORDER BY added_at",
        )
        .bind(group_id)
        .fetch_all(&self.db)
        .await?;

        Ok(ids)
    }

    /// Get all groups that contain a specific server
    pub async fn get_groups_for_server(&self, server_id: &str) -> Result<Vec<ServerGroup>> {
        let rows = sqlx::query_as::<_, GroupRow>(
            r#"
            SELECT sg.* FROM server_groups sg
            INNER JOIN group_members gm ON sg.id = gm.group_id
            WHERE gm.server_id = ?
            ORDER BY sg.name
            "#,
        )
        .bind(server_id)
        .fetch_all(&self.db)
        .await?;

        let mut groups = Vec::new();
        for row in rows {
            let server_ids = self.get_server_ids_for_group(&row.id).await?;
            groups.push(row.into_server_group(server_ids));
        }

        Ok(groups)
    }
}

// Helper struct for database row mapping
#[derive(sqlx::FromRow)]
struct GroupRow {
    id: String,
    name: String,
    description: Option<String>,
    created_at: String,
    updated_at: String,
}

impl GroupRow {
    fn into_server_group(self, server_ids: Vec<String>) -> ServerGroup {
        ServerGroup {
            id: self.id,
            name: self.name,
            description: self.description,
            server_ids,
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            updated_at: chrono::DateTime::parse_from_rfc3339(&self.updated_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
        }
    }
}

// Helper struct for server row mapping (reused from server module pattern)
#[derive(sqlx::FromRow)]
struct ServerRow {
    id: String,
    name: String,
    host: String,
    port: i32,
    username: String,
    auth_method: String,
    ssh_key_id: Option<String>,
    tags: String,
    environment: String,
    #[sqlx(default)]
    use_sudo: bool,
    created_at: String,
    updated_at: String,
    last_connected: Option<String>,
}

impl ServerRow {
    fn into_server(self) -> Server {
        use crate::server::{AuthMethod, Environment};

        Server {
            id: self.id,
            name: self.name,
            host: self.host,
            port: self.port as u16,
            username: self.username,
            auth_method: self.auth_method.parse().unwrap_or(AuthMethod::Password),
            ssh_key_id: self.ssh_key_id,
            tags: serde_json::from_str(&self.tags).unwrap_or_default(),
            environment: self.environment.parse().unwrap_or(Environment::Dev),
            use_sudo: self.use_sudo,
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
