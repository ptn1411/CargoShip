use serde::{Deserialize, Serialize};

/// Database type enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseType {
    MySQL,
    PostgreSQL,
}

/// Database connection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConnection {
    pub id: String,
    pub server_id: String,
    pub name: String,
    pub db_type: DatabaseType,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub database: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// SQLite row mapping for database connections
/// Note: password is NOT stored in SQLite, it's in the OS keychain
#[derive(Debug, sqlx::FromRow)]
pub struct DbConnectionRow {
    pub id: String,
    pub server_id: String,
    pub name: String,
    pub db_type: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub database_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<DbConnectionRow> for DatabaseConnection {
    fn from(row: DbConnectionRow) -> Self {
        let db_type = match row.db_type.to_lowercase().as_str() {
            "mysql" => DatabaseType::MySQL,
            "postgresql" | "postgres" => DatabaseType::PostgreSQL,
            _ => DatabaseType::MySQL,
        };
        
        DatabaseConnection {
            id: row.id,
            server_id: row.server_id,
            name: row.name,
            db_type,
            host: row.host,
            port: row.port as u16,
            username: row.username,
            password: String::new(), // Password retrieved from keychain separately
            database: row.database_name,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

/// Input for creating a database connection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateConnectionInput {
    pub server_id: String,
    pub name: String,
    pub db_type: DatabaseType,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub database: Option<String>,
}

/// Input for updating a database connection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateConnectionInput {
    pub name: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database: Option<String>,
}

/// Database info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseInfo {
    pub name: String,
    pub size: Option<String>,
    pub tables_count: Option<i64>,
    pub charset: Option<String>,
    pub collation: Option<String>,
}

/// Table info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub name: String,
    pub rows: Option<i64>,
    pub size: Option<String>,
    pub engine: Option<String>,
    pub collation: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// Column info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub column_default: Option<String>,
    pub is_primary_key: bool,
    pub is_unique: bool,
    pub is_auto_increment: bool,
    pub max_length: Option<i64>,
    pub numeric_precision: Option<i64>,
    pub numeric_scale: Option<i64>,
    pub comment: Option<String>,
}

/// Index info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
    pub is_primary: bool,
    pub index_type: Option<String>,
}

/// Database user info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseUser {
    pub username: String,
    pub host: String,
    pub privileges: Vec<String>,
}

/// Input for creating a database user
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateUserInput {
    pub username: String,
    pub password: String,
    pub host: String,
    pub privileges: Vec<String>,
    pub database: Option<String>,
}

/// Query result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub affected_rows: i64,
    pub execution_time_ms: u64,
    pub is_select: bool,
    pub error: Option<String>,
}

/// Input for executing a query
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecuteQueryInput {
    pub connection_id: String,
    pub database: String,
    pub query: String,
}

/// Table data for editing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableData {
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub total_rows: i64,
    pub page: i32,
    pub page_size: i32,
    pub primary_key_columns: Vec<String>,
}

/// Input for fetching table data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchTableDataInput {
    pub connection_id: String,
    pub database: String,
    pub table: String,
    pub page: Option<i32>,
    pub page_size: Option<i32>,
    pub order_by: Option<String>,
    pub order_dir: Option<String>,
    pub filter: Option<String>,
}

/// Input for updating a row
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRowInput {
    pub connection_id: String,
    pub database: String,
    pub table: String,
    pub primary_key_values: std::collections::HashMap<String, serde_json::Value>,
    pub updates: std::collections::HashMap<String, serde_json::Value>,
}

/// Input for inserting a row
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsertRowInput {
    pub connection_id: String,
    pub database: String,
    pub table: String,
    pub values: std::collections::HashMap<String, serde_json::Value>,
}

/// Input for deleting rows
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteRowsInput {
    pub connection_id: String,
    pub database: String,
    pub table: String,
    pub primary_key_values: Vec<std::collections::HashMap<String, serde_json::Value>>,
}

/// Connection test result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionTestResult {
    pub success: bool,
    pub message: String,
    pub version: Option<String>,
}

/// Input for creating a database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateDatabaseInput {
    pub connection_id: String,
    pub name: String,
    pub charset: Option<String>,
    pub collation: Option<String>,
}

/// Input for creating a table
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTableInput {
    pub connection_id: String,
    pub database: String,
    pub name: String,
    pub columns: Vec<CreateColumnInput>,
    pub primary_key: Option<Vec<String>>,
    pub engine: Option<String>,
}

/// Input for creating a column
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateColumnInput {
    pub name: String,
    pub data_type: String,
    pub length: Option<i64>,
    pub is_nullable: bool,
    pub default_value: Option<String>,
    pub is_auto_increment: bool,
    pub comment: Option<String>,
}

/// Export format
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    SQL,
    CSV,
    JSON,
}

/// Export options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub connection_id: String,
    pub database: String,
    pub tables: Option<Vec<String>>,
    pub format: ExportFormat,
    pub include_structure: bool,
    pub include_data: bool,
}

/// Query history entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryHistoryEntry {
    pub id: String,
    pub connection_id: String,
    pub database: String,
    pub query: String,
    pub execution_time_ms: u64,
    pub rows_affected: i64,
    pub success: bool,
    pub error: Option<String>,
    pub executed_at: String,
}

/// SQLite row mapping for query history
#[derive(Debug, sqlx::FromRow)]
pub struct QueryHistoryRow {
    pub id: String,
    pub connection_id: String,
    pub database_name: String,
    pub query: String,
    pub execution_time_ms: i64,
    pub rows_affected: i64,
    pub success: i32,
    pub error: Option<String>,
    pub executed_at: String,
}

impl From<QueryHistoryRow> for QueryHistoryEntry {
    fn from(row: QueryHistoryRow) -> Self {
        QueryHistoryEntry {
            id: row.id,
            connection_id: row.connection_id,
            database: row.database_name,
            query: row.query,
            execution_time_ms: row.execution_time_ms as u64,
            rows_affected: row.rows_affected,
            success: row.success != 0,
            error: row.error,
            executed_at: row.executed_at,
        }
    }
}

/// Saved query (favorites)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedQuery {
    pub id: String,
    pub connection_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub query: String,
    pub database: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// SQLite row mapping for saved queries
#[derive(Debug, sqlx::FromRow)]
pub struct SavedQueryRow {
    pub id: String,
    pub connection_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub query: String,
    pub database_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<SavedQueryRow> for SavedQuery {
    fn from(row: SavedQueryRow) -> Self {
        SavedQuery {
            id: row.id,
            connection_id: row.connection_id,
            name: row.name,
            description: row.description,
            query: row.query,
            database: row.database_name,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

/// Input for saving a query
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveQueryInput {
    pub connection_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub query: String,
    pub database: Option<String>,
}


// ==================== Backup Types ====================

/// Backup options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupOptions {
    pub connection_id: String,
    pub database: String,
    pub tables: Option<Vec<String>>,  // None = all tables
    pub include_structure: bool,
    pub include_data: bool,
    pub compress: bool,
    pub remote_path: Option<String>,  // If None, returns content directly
}

/// Backup result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupResult {
    pub success: bool,
    pub file_path: Option<String>,
    pub file_size: Option<i64>,
    pub content: Option<String>,  // Only if remote_path is None and not compressed
    pub duration_ms: u64,
    pub error: Option<String>,
}

/// Restore options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreOptions {
    pub connection_id: String,
    pub database: String,
    pub source: RestoreSource,
    pub drop_existing: bool,  // Drop existing tables before restore
}

/// Source for restore operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum RestoreSource {
    /// Restore from a file path on the remote server
    RemotePath(String),
    /// Restore from SQL content directly
    Content(String),
}

/// Restore result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreResult {
    pub success: bool,
    pub tables_restored: i32,
    pub duration_ms: u64,
    pub error: Option<String>,
}

/// Backup history entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupHistoryEntry {
    pub id: String,
    pub connection_id: String,
    pub database: String,
    pub file_path: Option<String>,
    pub file_size: Option<i64>,
    pub tables: Option<Vec<String>>,
    pub include_structure: bool,
    pub include_data: bool,
    pub compressed: bool,
    pub status: String,  // "success" | "failed"
    pub error: Option<String>,
    pub created_at: String,
}

/// SQLite row mapping for backup history
#[derive(Debug, sqlx::FromRow)]
pub struct BackupHistoryRow {
    pub id: String,
    pub connection_id: String,
    pub database_name: String,
    pub file_path: Option<String>,
    pub file_size: Option<i64>,
    pub tables_json: Option<String>,
    pub include_structure: i32,
    pub include_data: i32,
    pub compressed: i32,
    pub status: String,
    pub error: Option<String>,
    pub created_at: String,
}

impl From<BackupHistoryRow> for BackupHistoryEntry {
    fn from(row: BackupHistoryRow) -> Self {
        let tables: Option<Vec<String>> = row.tables_json
            .and_then(|json| serde_json::from_str(&json).ok());
        
        BackupHistoryEntry {
            id: row.id,
            connection_id: row.connection_id,
            database: row.database_name,
            file_path: row.file_path,
            file_size: row.file_size,
            tables,
            include_structure: row.include_structure != 0,
            include_data: row.include_data != 0,
            compressed: row.compressed != 0,
            status: row.status,
            error: row.error,
            created_at: row.created_at,
        }
    }
}


/// Backup file info (for listing backup files on server)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupFileInfo {
    pub name: String,
    pub path: String,
    pub size: i64,
    pub modified_at: String,
    pub compressed: bool,
}
