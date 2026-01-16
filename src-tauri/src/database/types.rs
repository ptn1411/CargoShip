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
