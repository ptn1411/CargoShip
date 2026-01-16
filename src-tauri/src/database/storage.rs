use super::types::*;
use crate::error::{AppError, Result};
use sqlx::{Pool, Sqlite};
use std::sync::Arc;

/// Database storage for persistent connection and query management
pub struct DatabaseStorage {
    pool: Arc<Pool<Sqlite>>,
}

impl DatabaseStorage {
    pub fn new(pool: Arc<Pool<Sqlite>>) -> Self {
        Self { pool }
    }

    /// Initialize database tables
    pub async fn init(&self) -> Result<()> {
        // Create database_connections table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS database_connections (
                id TEXT PRIMARY KEY,
                server_id TEXT NOT NULL,
                name TEXT NOT NULL,
                db_type TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL,
                username TEXT NOT NULL,
                password TEXT NOT NULL,
                database_name TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            "#,
        )
        .execute(self.pool.as_ref())
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create database_connections table: {}", e)))?;

        // Create query_history table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS query_history (
                id TEXT PRIMARY KEY,
                connection_id TEXT NOT NULL,
                database_name TEXT NOT NULL,
                query TEXT NOT NULL,
                execution_time_ms INTEGER NOT NULL,
                rows_affected INTEGER NOT NULL DEFAULT 0,
                success INTEGER NOT NULL DEFAULT 1,
                error TEXT,
                executed_at TEXT NOT NULL,
                FOREIGN KEY (connection_id) REFERENCES database_connections(id) ON DELETE CASCADE
            )
            "#,
        )
        .execute(self.pool.as_ref())
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create query_history table: {}", e)))?;

        // Create saved_queries table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS saved_queries (
                id TEXT PRIMARY KEY,
                connection_id TEXT,
                name TEXT NOT NULL,
                description TEXT,
                query TEXT NOT NULL,
                database_name TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (connection_id) REFERENCES database_connections(id) ON DELETE SET NULL
            )
            "#,
        )
        .execute(self.pool.as_ref())
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create saved_queries table: {}", e)))?;

        // Create index for faster query history lookups
        sqlx::query(
            r#"
            CREATE INDEX IF NOT EXISTS idx_query_history_connection 
            ON query_history(connection_id, executed_at DESC)
            "#,
        )
        .execute(self.pool.as_ref())
        .await
        .ok();

        Ok(())
    }

    // ==================== Connection Management ====================

    /// Save a database connection
    pub async fn save_connection(&self, conn: &DatabaseConnection) -> Result<()> {
        let db_type = match conn.db_type {
            DatabaseType::MySQL => "mysql",
            DatabaseType::PostgreSQL => "postgresql",
        };

        sqlx::query(
            r#"
            INSERT OR REPLACE INTO database_connections 
            (id, server_id, name, db_type, host, port, username, password, database_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&conn.id)
        .bind(&conn.server_id)
        .bind(&conn.name)
        .bind(db_type)
        .bind(&conn.host)
        .bind(conn.port as i32)
        .bind(&conn.username)
        .bind(&conn.password)
        .bind(&conn.database)
        .bind(&conn.created_at)
        .bind(&conn.updated_at)
        .execute(self.pool.as_ref())
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to save connection: {}", e)))?;

        Ok(())
    }

    /// Get a connection by ID
    pub async fn get_connection(&self, id: &str) -> Result<Option<DatabaseConnection>> {
        let row: Option<DbConnectionRow> = sqlx::query_as(
            "SELECT * FROM database_connections WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get connection: {}", e)))?;

        Ok(row.map(|r| r.into()))
    }

    /// List all connections
    pub async fn list_connections(&self) -> Result<Vec<DatabaseConnection>> {
        let rows: Vec<DbConnectionRow> = sqlx::query_as(
            "SELECT * FROM database_connections ORDER BY name",
        )
        .fetch_all(self.pool.as_ref())
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to list connections: {}", e)))?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// List connections by server ID
    pub async fn list_connections_by_server(&self, server_id: &str) -> Result<Vec<DatabaseConnection>> {
        let rows: Vec<DbConnectionRow> = sqlx::query_as(
            "SELECT * FROM database_connections WHERE server_id = ? ORDER BY name",
        )
        .bind(server_id)
        .fetch_all(self.pool.as_ref())
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to list connections: {}", e)))?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Delete a connection
    pub async fn delete_connection(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM database_connections WHERE id = ?")
            .bind(id)
            .execute(self.pool.as_ref())
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to delete connection: {}", e)))?;

        Ok(())
    }

    /// Update a connection
    pub async fn update_connection(&self, id: &str, input: &UpdateConnectionInput) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        
        // Build dynamic update query
        let mut updates = vec!["updated_at = ?"];
        let mut has_name = false;
        let mut has_host = false;
        let mut has_port = false;
        let mut has_username = false;
        let mut has_password = false;
        let mut has_database = false;

        if input.name.is_some() { updates.push("name = ?"); has_name = true; }
        if input.host.is_some() { updates.push("host = ?"); has_host = true; }
        if input.port.is_some() { updates.push("port = ?"); has_port = true; }
        if input.username.is_some() { updates.push("username = ?"); has_username = true; }
        if input.password.is_some() { updates.push("password = ?"); has_password = true; }
        if input.database.is_some() { updates.push("database_name = ?"); has_database = true; }

        let query = format!(
            "UPDATE database_connections SET {} WHERE id = ?",
            updates.join(", ")
        );

        let mut q = sqlx::query(&query).bind(&now);
        
        if has_name { q = q.bind(input.name.as_ref().unwrap()); }
        if has_host { q = q.bind(input.host.as_ref().unwrap()); }
        if has_port { q = q.bind(*input.port.as_ref().unwrap() as i32); }
        if has_username { q = q.bind(input.username.as_ref().unwrap()); }
        if has_password { q = q.bind(input.password.as_ref().unwrap()); }
        if has_database { q = q.bind(input.database.as_ref().unwrap()); }
        
        q = q.bind(id);

        q.execute(self.pool.as_ref())
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to update connection: {}", e)))?;

        Ok(())
    }

    // ==================== Query History ====================

    /// Add a query to history
    pub async fn add_query_history(&self, entry: &QueryHistoryEntry) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO query_history 
            (id, connection_id, database_name, query, execution_time_ms, rows_affected, success, error, executed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&entry.id)
        .bind(&entry.connection_id)
        .bind(&entry.database)
        .bind(&entry.query)
        .bind(entry.execution_time_ms as i64)
        .bind(entry.rows_affected)
        .bind(if entry.success { 1 } else { 0 })
        .bind(&entry.error)
        .bind(&entry.executed_at)
        .execute(self.pool.as_ref())
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to add query history: {}", e)))?;

        Ok(())
    }

    /// Get query history for a connection
    pub async fn get_query_history(&self, connection_id: &str, limit: i32) -> Result<Vec<QueryHistoryEntry>> {
        let rows: Vec<QueryHistoryRow> = sqlx::query_as(
            "SELECT * FROM query_history WHERE connection_id = ? ORDER BY executed_at DESC LIMIT ?",
        )
        .bind(connection_id)
        .bind(limit)
        .fetch_all(self.pool.as_ref())
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get query history: {}", e)))?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Clear query history for a connection
    pub async fn clear_query_history(&self, connection_id: &str) -> Result<()> {
        sqlx::query("DELETE FROM query_history WHERE connection_id = ?")
            .bind(connection_id)
            .execute(self.pool.as_ref())
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to clear query history: {}", e)))?;

        Ok(())
    }

    /// Clean old query history (keep last N entries per connection)
    pub async fn cleanup_old_history(&self, keep_count: i32) -> Result<i64> {
        let result = sqlx::query(
            r#"
            DELETE FROM query_history 
            WHERE id NOT IN (
                SELECT id FROM (
                    SELECT id, ROW_NUMBER() OVER (PARTITION BY connection_id ORDER BY executed_at DESC) as rn
                    FROM query_history
                ) WHERE rn <= ?
            )
            "#,
        )
        .bind(keep_count)
        .execute(self.pool.as_ref())
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to cleanup history: {}", e)))?;

        Ok(result.rows_affected() as i64)
    }

    // ==================== Saved Queries ====================

    /// Save a query
    pub async fn save_query(&self, query: &SavedQuery) -> Result<()> {
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO saved_queries 
            (id, connection_id, name, description, query, database_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&query.id)
        .bind(&query.connection_id)
        .bind(&query.name)
        .bind(&query.description)
        .bind(&query.query)
        .bind(&query.database)
        .bind(&query.created_at)
        .bind(&query.updated_at)
        .execute(self.pool.as_ref())
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to save query: {}", e)))?;

        Ok(())
    }

    /// Get saved queries
    pub async fn get_saved_queries(&self, connection_id: Option<&str>) -> Result<Vec<SavedQuery>> {
        let rows: Vec<SavedQueryRow> = if let Some(conn_id) = connection_id {
            sqlx::query_as(
                "SELECT * FROM saved_queries WHERE connection_id = ? OR connection_id IS NULL ORDER BY name",
            )
            .bind(conn_id)
            .fetch_all(self.pool.as_ref())
            .await
        } else {
            sqlx::query_as(
                "SELECT * FROM saved_queries ORDER BY name",
            )
            .fetch_all(self.pool.as_ref())
            .await
        }
        .map_err(|e| AppError::DatabaseError(format!("Failed to get saved queries: {}", e)))?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Delete a saved query
    pub async fn delete_saved_query(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM saved_queries WHERE id = ?")
            .bind(id)
            .execute(self.pool.as_ref())
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to delete saved query: {}", e)))?;

        Ok(())
    }
}
