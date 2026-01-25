use super::types::*;
use crate::server::Server;
use crate::ssh::SshClient;
use anyhow::{anyhow, Result};
use serde_json::json;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;

/// Database Manager - handles database operations via SSH
pub struct DatabaseManager {
    ssh_client: Arc<SshClient>,
    db_pool: SqlitePool,
}

impl DatabaseManager {
    pub fn new(ssh_client: Arc<SshClient>, db_pool: SqlitePool) -> Self {
        Self {
            ssh_client,
            db_pool,
        }
    }

    /// Store a connection in SQLite
    pub async fn add_connection(&self, conn: DatabaseConnection) -> Result<()> {
        let db_type_str = match conn.db_type {
            DatabaseType::MySQL => "mysql",
            DatabaseType::PostgreSQL => "postgresql",
        };

        sqlx::query(
            r#"
            INSERT INTO database_connections (id, server_id, name, db_type, host, port, username, password, database_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&conn.id)
        .bind(&conn.server_id)
        .bind(&conn.name)
        .bind(db_type_str)
        .bind(&conn.host)
        .bind(conn.port as i32)
        .bind(&conn.username)
        .bind(&conn.password)
        .bind(&conn.database)
        .bind(&conn.created_at)
        .bind(&conn.updated_at)
        .execute(&self.db_pool)
        .await
        .map_err(|e| anyhow!("Failed to save connection: {}", e))?;

        Ok(())
    }

    /// Get a connection by ID from SQLite
    pub async fn get_connection(&self, id: &str) -> Option<DatabaseConnection> {
        let row = sqlx::query_as::<_, DbConnectionRow>(
            "SELECT id, server_id, name, db_type, host, port, username, password, database_name, created_at, updated_at FROM database_connections WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(&self.db_pool)
        .await
        .ok()??;

        Some(row.into())
    }

    /// Remove a connection from SQLite
    pub async fn remove_connection(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM database_connections WHERE id = ?")
            .bind(id)
            .execute(&self.db_pool)
            .await
            .map_err(|e| anyhow!("Failed to remove connection: {}", e))?;

        Ok(())
    }

    /// List all connections from SQLite
    pub async fn list_connections(&self) -> Vec<DatabaseConnection> {
        let rows = sqlx::query_as::<_, DbConnectionRow>(
            "SELECT id, server_id, name, db_type, host, port, username, password, database_name, created_at, updated_at FROM database_connections ORDER BY name"
        )
        .fetch_all(&self.db_pool)
        .await
        .unwrap_or_default();

        rows.into_iter().map(|r| r.into()).collect()
    }

    /// Test database connection
    pub fn test_connection(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
    ) -> Result<ConnectionTestResult> {
        let cmd = match conn.db_type {
            DatabaseType::MySQL => {
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' -e 'SELECT VERSION();' 2>&1",
                    conn.host, conn.port, conn.username, conn.password
                )
            }
            DatabaseType::PostgreSQL => {
                // Connect to 'postgres' database for testing connection
                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d postgres -c 'SELECT version();' 2>&1",
                    conn.password, conn.host, conn.port, conn.username
                )
            }
        };

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        // With 2>&1, errors go to stdout, so check both
        let combined = format!("{}{}", output.stdout, output.stderr);
        let has_error = output.exit_code != 0
            || combined.to_lowercase().contains("error")
            || combined.contains("FATAL")
            || combined.contains("could not connect")
            || combined.contains("Connection refused");

        if !has_error {
            let version = output
                .stdout
                .lines()
                .find(|line| {
                    !line.trim().is_empty() && !line.contains("---") && !line.contains("version")
                })
                .map(|s| s.trim().to_string());
            Ok(ConnectionTestResult {
                success: true,
                message: "Connection successful".to_string(),
                version,
            })
        } else {
            // Get error message from stdout (due to 2>&1) or stderr
            let error_msg = if !output.stdout.trim().is_empty() {
                output.stdout.trim().to_string()
            } else {
                output.stderr.trim().to_string()
            };
            Ok(ConnectionTestResult {
                success: false,
                message: if error_msg.is_empty() {
                    format!("Connection failed with exit code {}", output.exit_code)
                } else {
                    error_msg
                },
                version: None,
            })
        }
    }

    /// List databases
    pub fn list_databases(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
    ) -> Result<Vec<DatabaseInfo>> {
        let cmd = match conn.db_type {
            DatabaseType::MySQL => {
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' -N -e \"SELECT schema_name, NULL, NULL, default_character_set_name, default_collation_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys');\" 2>&1",
                    conn.host, conn.port, conn.username, conn.password
                )
            }
            DatabaseType::PostgreSQL => {
                // Connect to 'postgres' database to list all databases
                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d postgres -t -A -F '|' -c \"SELECT datname, pg_size_pretty(pg_database_size(datname)), NULL, pg_encoding_to_char(encoding), datcollate FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres');\" 2>&1",
                    conn.password, conn.host, conn.port, conn.username
                )
            }
        };

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        // Check for errors in both stdout and stderr (2>&1 redirects stderr to stdout)
        let combined_output = format!("{}{}", output.stdout, output.stderr);
        if output.exit_code != 0
            || combined_output.to_lowercase().contains("error")
            || combined_output.contains("FATAL")
        {
            let error_msg = if !output.stderr.is_empty() {
                output.stderr.trim().to_string()
            } else if output.stdout.contains("psql:")
                || output.stdout.contains("ERROR")
                || output.stdout.contains("FATAL")
            {
                output.stdout.trim().to_string()
            } else {
                format!("Command failed with exit code {}", output.exit_code)
            };
            return Err(anyhow!("Failed to list databases: {}", error_msg));
        }

        let mut databases = Vec::new();
        for line in output.stdout.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            let parts: Vec<&str> = match conn.db_type {
                DatabaseType::MySQL => line.split('\t').collect(),
                DatabaseType::PostgreSQL => line.split('|').collect(),
            };

            if !parts.is_empty() {
                databases.push(DatabaseInfo {
                    name: parts.get(0).unwrap_or(&"").to_string(),
                    size: parts
                        .get(1)
                        .map(|s| s.to_string())
                        .filter(|s| !s.is_empty() && s != "NULL"),
                    tables_count: None,
                    charset: parts
                        .get(3)
                        .map(|s| s.to_string())
                        .filter(|s| !s.is_empty() && s != "NULL"),
                    collation: parts
                        .get(4)
                        .map(|s| s.to_string())
                        .filter(|s| !s.is_empty() && s != "NULL"),
                });
            }
        }

        Ok(databases)
    }

    /// List tables in a database
    pub fn list_tables(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        database: &str,
    ) -> Result<Vec<TableInfo>> {
        let cmd = match conn.db_type {
            DatabaseType::MySQL => {
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' {} -N -e \"SELECT table_name, table_rows, CONCAT(ROUND(data_length/1024/1024, 2), ' MB'), engine, table_collation, create_time, update_time FROM information_schema.tables WHERE table_schema = '{}';\"",
                    conn.host, conn.port, conn.username, conn.password, database, database
                )
            }
            DatabaseType::PostgreSQL => {
                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} -t -A -F '|' -c \"SELECT tablename, NULL, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)), NULL, NULL, NULL, NULL FROM pg_tables WHERE schemaname = 'public';\"",
                    conn.password, conn.host, conn.port, conn.username, database
                )
            }
        };

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        if output.exit_code != 0 {
            return Err(anyhow!("Failed to list tables: {}", output.stderr));
        }

        let mut tables = Vec::new();
        for line in output.stdout.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            let parts: Vec<&str> = match conn.db_type {
                DatabaseType::MySQL => line.split('\t').collect(),
                DatabaseType::PostgreSQL => line.split('|').collect(),
            };

            if !parts.is_empty() {
                tables.push(TableInfo {
                    name: parts.get(0).unwrap_or(&"").to_string(),
                    rows: parts.get(1).and_then(|s| s.parse().ok()),
                    size: parts
                        .get(2)
                        .map(|s| s.to_string())
                        .filter(|s| !s.is_empty() && s != "NULL"),
                    engine: parts
                        .get(3)
                        .map(|s| s.to_string())
                        .filter(|s| !s.is_empty() && s != "NULL"),
                    collation: parts
                        .get(4)
                        .map(|s| s.to_string())
                        .filter(|s| !s.is_empty() && s != "NULL"),
                    created_at: parts
                        .get(5)
                        .map(|s| s.to_string())
                        .filter(|s| !s.is_empty() && s != "NULL"),
                    updated_at: parts
                        .get(6)
                        .map(|s| s.to_string())
                        .filter(|s| !s.is_empty() && s != "NULL"),
                });
            }
        }

        Ok(tables)
    }

    /// Get table columns
    pub fn get_table_columns(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        database: &str,
        table: &str,
    ) -> Result<Vec<ColumnInfo>> {
        let cmd = match conn.db_type {
            DatabaseType::MySQL => {
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' {} -N -e \"SELECT column_name, column_type, is_nullable, column_default, column_key, extra, character_maximum_length, numeric_precision, numeric_scale, column_comment FROM information_schema.columns WHERE table_schema = '{}' AND table_name = '{}' ORDER BY ordinal_position;\"",
                    conn.host, conn.port, conn.username, conn.password, database, database, table
                )
            }
            DatabaseType::PostgreSQL => {
                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} -t -A -F '|' -c \"SELECT c.column_name, c.data_type, c.is_nullable, c.column_default, CASE WHEN pk.column_name IS NOT NULL THEN 'PRI' ELSE '' END, '', c.character_maximum_length, c.numeric_precision, c.numeric_scale, '' FROM information_schema.columns c LEFT JOIN (SELECT ku.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name WHERE tc.table_name = '{}' AND tc.constraint_type = 'PRIMARY KEY') pk ON c.column_name = pk.column_name WHERE c.table_name = '{}' ORDER BY c.ordinal_position;\"",
                    conn.password, conn.host, conn.port, conn.username, database, table, table
                )
            }
        };

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        if output.exit_code != 0 {
            return Err(anyhow!("Failed to get columns: {}", output.stderr));
        }

        let mut columns = Vec::new();
        for line in output.stdout.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            let parts: Vec<&str> = match conn.db_type {
                DatabaseType::MySQL => line.split('\t').collect(),
                DatabaseType::PostgreSQL => line.split('|').collect(),
            };

            if !parts.is_empty() {
                let column_key = parts.get(4).unwrap_or(&"");
                let extra = parts.get(5).unwrap_or(&"");

                columns.push(ColumnInfo {
                    name: parts.get(0).unwrap_or(&"").to_string(),
                    data_type: parts.get(1).unwrap_or(&"").to_string(),
                    is_nullable: parts
                        .get(2)
                        .map(|s| s.to_uppercase() == "YES")
                        .unwrap_or(true),
                    column_default: parts
                        .get(3)
                        .map(|s| s.to_string())
                        .filter(|s| !s.is_empty() && s != "NULL"),
                    is_primary_key: column_key.contains("PRI"),
                    is_unique: column_key.contains("UNI"),
                    is_auto_increment: extra.contains("auto_increment"),
                    max_length: parts.get(6).and_then(|s| s.parse().ok()),
                    numeric_precision: parts.get(7).and_then(|s| s.parse().ok()),
                    numeric_scale: parts.get(8).and_then(|s| s.parse().ok()),
                    comment: parts
                        .get(9)
                        .map(|s| s.to_string())
                        .filter(|s| !s.is_empty()),
                });
            }
        }

        Ok(columns)
    }

    /// Execute a query
    pub fn execute_query(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        database: &str,
        query: &str,
    ) -> Result<QueryResult> {
        let start = std::time::Instant::now();
        let is_select = query.trim().to_uppercase().starts_with("SELECT");

        // Escape single quotes in query
        let escaped_query = query.replace("'", "'\\''");

        let cmd = match conn.db_type {
            DatabaseType::MySQL => {
                if is_select {
                    format!(
                        "mysql -h {} -P {} -u {} -p'{}' {} -e '{}' --batch --raw 2>&1",
                        conn.host, conn.port, conn.username, conn.password, database, escaped_query
                    )
                } else {
                    format!(
                        "mysql -h {} -P {} -u {} -p'{}' {} -e '{}' 2>&1",
                        conn.host, conn.port, conn.username, conn.password, database, escaped_query
                    )
                }
            }
            DatabaseType::PostgreSQL => {
                if is_select {
                    format!(
                        "PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} -t -A -F '|' -c '{}' 2>&1",
                        conn.password, conn.host, conn.port, conn.username, database, escaped_query
                    )
                } else {
                    format!(
                        "PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} -c '{}' 2>&1",
                        conn.password, conn.host, conn.port, conn.username, database, escaped_query
                    )
                }
            }
        };

        let output = self.ssh_client.execute_command(server, &cmd, Some(120))?;
        let execution_time = start.elapsed().as_millis() as u64;

        if output.exit_code != 0
            || output.stdout.contains("ERROR")
            || output.stderr.contains("ERROR")
        {
            let error_msg = if !output.stderr.is_empty() {
                output.stderr.clone()
            } else {
                output.stdout.clone()
            };
            return Ok(QueryResult {
                columns: vec![],
                rows: vec![],
                affected_rows: 0,
                execution_time_ms: execution_time,
                is_select,
                error: Some(error_msg),
            });
        }

        if is_select {
            let mut lines: Vec<&str> = output.stdout.lines().collect();
            let columns: Vec<String> = if !lines.is_empty() {
                match conn.db_type {
                    DatabaseType::MySQL => {
                        lines.remove(0).split('\t').map(|s| s.to_string()).collect()
                    }
                    DatabaseType::PostgreSQL => {
                        // PostgreSQL with -t doesn't include headers, need to get from query
                        vec![] // Will be populated from first row structure
                    }
                }
            } else {
                vec![]
            };

            let rows: Vec<Vec<serde_json::Value>> = lines
                .iter()
                .filter(|line| !line.is_empty())
                .map(|line| {
                    let parts: Vec<&str> = match conn.db_type {
                        DatabaseType::MySQL => line.split('\t').collect(),
                        DatabaseType::PostgreSQL => line.split('|').collect(),
                    };
                    parts
                        .iter()
                        .map(|s| {
                            if *s == "NULL" || s.is_empty() {
                                serde_json::Value::Null
                            } else if let Ok(n) = s.parse::<i64>() {
                                json!(n)
                            } else if let Ok(f) = s.parse::<f64>() {
                                json!(f)
                            } else {
                                json!(s.to_string())
                            }
                        })
                        .collect()
                })
                .collect();

            Ok(QueryResult {
                columns,
                rows,
                affected_rows: 0,
                execution_time_ms: execution_time,
                is_select: true,
                error: None,
            })
        } else {
            // Parse affected rows from output
            let affected_rows = self.parse_affected_rows(&output.stdout, &conn.db_type);

            Ok(QueryResult {
                columns: vec![],
                rows: vec![],
                affected_rows,
                execution_time_ms: execution_time,
                is_select: false,
                error: None,
            })
        }
    }

    fn parse_affected_rows(&self, output: &str, db_type: &DatabaseType) -> i64 {
        match db_type {
            DatabaseType::MySQL => {
                // MySQL: "Query OK, X rows affected"
                if let Some(pos) = output.find("rows affected") {
                    let before = &output[..pos];
                    if let Some(num_start) = before.rfind(", ") {
                        let num_str = &before[num_start + 2..].trim();
                        return num_str.parse().unwrap_or(0);
                    }
                }
                0
            }
            DatabaseType::PostgreSQL => {
                // PostgreSQL: "INSERT 0 X" or "UPDATE X" or "DELETE X"
                let parts: Vec<&str> = output.split_whitespace().collect();
                if parts.len() >= 2 {
                    if parts[0] == "INSERT" && parts.len() >= 3 {
                        return parts[2].parse().unwrap_or(0);
                    } else if parts[0] == "UPDATE" || parts[0] == "DELETE" {
                        return parts[1].parse().unwrap_or(0);
                    }
                }
                0
            }
        }
    }

    /// Get table data with pagination
    pub fn get_table_data(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        input: &FetchTableDataInput,
    ) -> Result<TableData> {
        // Get columns first
        let columns = self.get_table_columns(server, conn, &input.database, &input.table)?;

        // Find primary key columns
        let primary_key_columns: Vec<String> = columns
            .iter()
            .filter(|c| c.is_primary_key)
            .map(|c| c.name.clone())
            .collect();

        let page = input.page.unwrap_or(1);
        let page_size = input.page_size.unwrap_or(50);
        let offset = (page - 1) * page_size;

        let order_clause = if let Some(ref order_by) = input.order_by {
            let dir = input.order_dir.as_deref().unwrap_or("ASC");
            format!("ORDER BY {} {}", order_by, dir)
        } else {
            String::new()
        };

        let where_clause = if let Some(ref filter) = input.filter {
            format!("WHERE {}", filter)
        } else {
            String::new()
        };

        // Get total count
        let count_cmd = match conn.db_type {
            DatabaseType::MySQL => {
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' {} -N -e \"SELECT COUNT(*) FROM {} {};\"",
                    conn.host,
                    conn.port,
                    conn.username,
                    conn.password,
                    input.database,
                    input.table,
                    where_clause
                )
            }
            DatabaseType::PostgreSQL => {
                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} -t -A -c \"SELECT COUNT(*) FROM {} {};\"",
                    conn.password, conn.host, conn.port, conn.username, input.database, input.table, where_clause
                )
            }
        };

        let count_output = self
            .ssh_client
            .execute_command(server, &count_cmd, Some(30))?;
        let total_rows: i64 = count_output.stdout.trim().parse().unwrap_or(0);

        // Get data
        let data_cmd = match conn.db_type {
            DatabaseType::MySQL => {
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' {} -N -e \"SELECT * FROM {} {} {} LIMIT {} OFFSET {};\"",
                    conn.host, conn.port, conn.username, conn.password, input.database, input.table, where_clause, order_clause, page_size, offset
                )
            }
            DatabaseType::PostgreSQL => {
                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} -t -A -F '|' -c \"SELECT * FROM {} {} {} LIMIT {} OFFSET {};\"",
                    conn.password, conn.host, conn.port, conn.username, input.database, input.table, where_clause, order_clause, page_size, offset
                )
            }
        };

        let data_output = self
            .ssh_client
            .execute_command(server, &data_cmd, Some(60))?;

        let rows: Vec<Vec<serde_json::Value>> = data_output
            .stdout
            .lines()
            .filter(|line| !line.is_empty())
            .map(|line| {
                let parts: Vec<&str> = match conn.db_type {
                    DatabaseType::MySQL => line.split('\t').collect(),
                    DatabaseType::PostgreSQL => line.split('|').collect(),
                };
                parts
                    .iter()
                    .map(|s| {
                        if *s == "NULL" || (*s == "\\N" && conn.db_type == DatabaseType::MySQL) {
                            serde_json::Value::Null
                        } else if let Ok(n) = s.parse::<i64>() {
                            json!(n)
                        } else if let Ok(f) = s.parse::<f64>() {
                            json!(f)
                        } else {
                            json!(s.to_string())
                        }
                    })
                    .collect()
            })
            .collect();

        Ok(TableData {
            columns,
            rows,
            total_rows,
            page,
            page_size,
            primary_key_columns,
        })
    }

    /// Update a row
    pub fn update_row(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        input: &UpdateRowInput,
    ) -> Result<i64> {
        let set_clause: Vec<String> = input
            .updates
            .iter()
            .map(|(k, v)| {
                let value = self.format_value(v, &conn.db_type);
                format!("{} = {}", k, value)
            })
            .collect();

        let where_clause: Vec<String> = input
            .primary_key_values
            .iter()
            .map(|(k, v)| {
                let value = self.format_value(v, &conn.db_type);
                format!("{} = {}", k, value)
            })
            .collect();

        let query = format!(
            "UPDATE {} SET {} WHERE {};",
            input.table,
            set_clause.join(", "),
            where_clause.join(" AND ")
        );

        let result = self.execute_query(server, conn, &input.database, &query)?;

        if let Some(error) = result.error {
            return Err(anyhow!("Update failed: {}", error));
        }

        Ok(result.affected_rows)
    }

    /// Insert a row
    pub fn insert_row(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        input: &InsertRowInput,
    ) -> Result<i64> {
        let columns: Vec<&String> = input.values.keys().collect();
        let values: Vec<String> = input
            .values
            .values()
            .map(|v| self.format_value(v, &conn.db_type))
            .collect();

        let query = format!(
            "INSERT INTO {} ({}) VALUES ({});",
            input.table,
            columns
                .iter()
                .map(|c| c.as_str())
                .collect::<Vec<_>>()
                .join(", "),
            values.join(", ")
        );

        let result = self.execute_query(server, conn, &input.database, &query)?;

        if let Some(error) = result.error {
            return Err(anyhow!("Insert failed: {}", error));
        }

        Ok(result.affected_rows)
    }

    /// Delete rows
    pub fn delete_rows(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        input: &DeleteRowsInput,
    ) -> Result<i64> {
        let mut total_affected = 0i64;

        for pk_values in &input.primary_key_values {
            let where_clause: Vec<String> = pk_values
                .iter()
                .map(|(k, v)| {
                    let value = self.format_value(v, &conn.db_type);
                    format!("{} = {}", k, value)
                })
                .collect();

            let query = format!(
                "DELETE FROM {} WHERE {};",
                input.table,
                where_clause.join(" AND ")
            );

            let result = self.execute_query(server, conn, &input.database, &query)?;

            if let Some(error) = result.error {
                return Err(anyhow!("Delete failed: {}", error));
            }

            total_affected += result.affected_rows;
        }

        Ok(total_affected)
    }

    fn format_value(&self, value: &serde_json::Value, db_type: &DatabaseType) -> String {
        match value {
            serde_json::Value::Null => "NULL".to_string(),
            serde_json::Value::Bool(b) => match db_type {
                DatabaseType::MySQL => if *b { "1" } else { "0" }.to_string(),
                DatabaseType::PostgreSQL => if *b { "TRUE" } else { "FALSE" }.to_string(),
            },
            serde_json::Value::Number(n) => n.to_string(),
            serde_json::Value::String(s) => {
                let escaped = s.replace("'", "''");
                format!("'{}'", escaped)
            }
            _ => format!("'{}'", value.to_string().replace("'", "''")),
        }
    }

    /// List database users
    pub fn list_users(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
    ) -> Result<Vec<DatabaseUser>> {
        let cmd = match conn.db_type {
            DatabaseType::MySQL => {
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' -N -e \"SELECT user, host FROM mysql.user WHERE user NOT IN ('mysql.sys', 'mysql.session', 'mysql.infoschema', 'root');\"",
                    conn.host, conn.port, conn.username, conn.password
                )
            }
            DatabaseType::PostgreSQL => {
                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d postgres -t -A -F '|' -c \"SELECT usename, '*' FROM pg_user WHERE usename NOT IN ('postgres');\"",
                    conn.password, conn.host, conn.port, conn.username
                )
            }
        };

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        if output.exit_code != 0 {
            return Err(anyhow!("Failed to list users: {}", output.stderr));
        }

        let mut users = Vec::new();
        for line in output.stdout.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            let parts: Vec<&str> = match conn.db_type {
                DatabaseType::MySQL => line.split('\t').collect(),
                DatabaseType::PostgreSQL => line.split('|').collect(),
            };

            if parts.len() >= 2 {
                users.push(DatabaseUser {
                    username: parts[0].to_string(),
                    host: parts[1].to_string(),
                    privileges: vec![],
                });
            }
        }

        Ok(users)
    }

    /// Create a database user
    pub fn create_user(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        input: &CreateUserInput,
    ) -> Result<()> {
        let cmd = match conn.db_type {
            DatabaseType::MySQL => {
                let create_user = format!(
                    "CREATE USER '{}'@'{}' IDENTIFIED BY '{}';",
                    input.username, input.host, input.password
                );

                let grant = if let Some(ref db) = input.database {
                    format!(
                        "GRANT {} ON {}.* TO '{}'@'{}';",
                        input.privileges.join(", "),
                        db,
                        input.username,
                        input.host
                    )
                } else {
                    format!(
                        "GRANT {} ON *.* TO '{}'@'{}';",
                        input.privileges.join(", "),
                        input.username,
                        input.host
                    )
                };

                format!(
                    "mysql -h {} -P {} -u {} -p'{}' -e \"{}{}FLUSH PRIVILEGES;\"",
                    conn.host, conn.port, conn.username, conn.password, create_user, grant
                )
            }
            DatabaseType::PostgreSQL => {
                let create_user = format!(
                    "CREATE USER {} WITH PASSWORD '{}';",
                    input.username, input.password
                );

                let grant = if let Some(ref db) = input.database {
                    format!(
                        "GRANT {} ON DATABASE {} TO {};",
                        input.privileges.join(", "),
                        db,
                        input.username
                    )
                } else {
                    String::new()
                };

                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d postgres -c \"{}{}\"",
                    conn.password, conn.host, conn.port, conn.username, create_user, grant
                )
            }
        };

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        if output.exit_code != 0 || output.stderr.contains("ERROR") {
            return Err(anyhow!("Failed to create user: {}", output.stderr));
        }

        Ok(())
    }

    /// Drop a database user
    pub fn drop_user(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        username: &str,
        host: &str,
    ) -> Result<()> {
        let cmd = match conn.db_type {
            DatabaseType::MySQL => {
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' -e \"DROP USER '{}'@'{}';\"",
                    conn.host, conn.port, conn.username, conn.password, username, host
                )
            }
            DatabaseType::PostgreSQL => {
                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d postgres -c \"DROP USER {};\"",
                    conn.password, conn.host, conn.port, conn.username, username
                )
            }
        };

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        if output.exit_code != 0 || output.stderr.contains("ERROR") {
            return Err(anyhow!("Failed to drop user: {}", output.stderr));
        }

        Ok(())
    }

    /// Create a database
    pub fn create_database(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        input: &CreateDatabaseInput,
    ) -> Result<()> {
        let cmd = match conn.db_type {
            DatabaseType::MySQL => {
                let charset = input.charset.as_deref().unwrap_or("utf8mb4");
                let collation = input.collation.as_deref().unwrap_or("utf8mb4_unicode_ci");
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' -e \"CREATE DATABASE {} CHARACTER SET {} COLLATE {};\"",
                    conn.host, conn.port, conn.username, conn.password, input.name, charset, collation
                )
            }
            DatabaseType::PostgreSQL => {
                let encoding = input.charset.as_deref().unwrap_or("UTF8");
                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d postgres -c \"CREATE DATABASE {} ENCODING '{}';\"",
                    conn.password, conn.host, conn.port, conn.username, input.name, encoding
                )
            }
        };

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        if output.exit_code != 0 || output.stderr.contains("ERROR") {
            return Err(anyhow!("Failed to create database: {}", output.stderr));
        }

        Ok(())
    }

    /// Drop a database
    pub fn drop_database(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        database: &str,
    ) -> Result<()> {
        let cmd = match conn.db_type {
            DatabaseType::MySQL => {
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' -e \"DROP DATABASE {};\"",
                    conn.host, conn.port, conn.username, conn.password, database
                )
            }
            DatabaseType::PostgreSQL => {
                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d postgres -c \"DROP DATABASE {};\"",
                    conn.password, conn.host, conn.port, conn.username, database
                )
            }
        };

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        if output.exit_code != 0 || output.stderr.contains("ERROR") {
            return Err(anyhow!("Failed to drop database: {}", output.stderr));
        }

        Ok(())
    }

    /// Get table indexes
    pub fn get_table_indexes(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        database: &str,
        table: &str,
    ) -> Result<Vec<IndexInfo>> {
        let cmd = match conn.db_type {
            DatabaseType::MySQL => {
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' {} -N -e \"SHOW INDEX FROM {};\"",
                    conn.host, conn.port, conn.username, conn.password, database, table
                )
            }
            DatabaseType::PostgreSQL => {
                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} -t -A -F '|' -c \"SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '{}';\"",
                    conn.password, conn.host, conn.port, conn.username, database, table
                )
            }
        };

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        if output.exit_code != 0 {
            return Err(anyhow!("Failed to get indexes: {}", output.stderr));
        }

        let mut indexes: HashMap<String, IndexInfo> = HashMap::new();

        for line in output.stdout.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            match conn.db_type {
                DatabaseType::MySQL => {
                    let parts: Vec<&str> = line.split('\t').collect();
                    if parts.len() >= 5 {
                        let key_name = parts[2].to_string();
                        let column_name = parts[4].to_string();
                        let non_unique: i32 = parts[1].parse().unwrap_or(1);
                        let index_type = parts.get(10).map(|s| s.to_string());

                        indexes
                            .entry(key_name.clone())
                            .and_modify(|idx| idx.columns.push(column_name.clone()))
                            .or_insert(IndexInfo {
                                name: key_name.clone(),
                                columns: vec![column_name],
                                is_unique: non_unique == 0,
                                is_primary: key_name == "PRIMARY",
                                index_type,
                            });
                    }
                }
                DatabaseType::PostgreSQL => {
                    let parts: Vec<&str> = line.split('|').collect();
                    if parts.len() >= 2 {
                        let name = parts[0].to_string();
                        let def = parts[1];
                        let is_unique = def.contains("UNIQUE");
                        let is_primary = name.ends_with("_pkey");

                        // Extract columns from definition
                        let columns = if let Some(start) = def.find('(') {
                            if let Some(end) = def.find(')') {
                                def[start + 1..end]
                                    .split(',')
                                    .map(|s| s.trim().to_string())
                                    .collect()
                            } else {
                                vec![]
                            }
                        } else {
                            vec![]
                        };

                        indexes.insert(
                            name.clone(),
                            IndexInfo {
                                name,
                                columns,
                                is_unique,
                                is_primary,
                                index_type: Some("btree".to_string()),
                            },
                        );
                    }
                }
            }
        }

        Ok(indexes.into_values().collect())
    }

    /// Get user privileges
    pub fn get_user_privileges(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        username: &str,
        host: &str,
    ) -> Result<Vec<String>> {
        let cmd = match conn.db_type {
            DatabaseType::MySQL => {
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' -N -e \"SHOW GRANTS FOR '{}'@'{}';\"",
                    conn.host, conn.port, conn.username, conn.password, username, host
                )
            }
            DatabaseType::PostgreSQL => {
                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d postgres -t -A -c \"SELECT string_agg(privilege_type, ', ') FROM information_schema.role_table_grants WHERE grantee = '{}';\"",
                    conn.password, conn.host, conn.port, conn.username, username
                )
            }
        };

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        if output.exit_code != 0 {
            return Err(anyhow!("Failed to get user privileges: {}", output.stderr));
        }

        let privileges: Vec<String> = output
            .stdout
            .lines()
            .filter(|line| !line.is_empty())
            .map(|s| s.to_string())
            .collect();

        Ok(privileges)
    }

    /// Grant privileges to a user
    pub fn grant_privileges(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        username: &str,
        host: &str,
        privileges: &[String],
        database: Option<&str>,
    ) -> Result<()> {
        let priv_str = privileges.join(", ");

        let cmd = match conn.db_type {
            DatabaseType::MySQL => {
                let target = match database {
                    Some(db) => format!("{}.*", db),
                    None => "*.*".to_string(),
                };
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' -e \"GRANT {} ON {} TO '{}'@'{}'; FLUSH PRIVILEGES;\"",
                    conn.host, conn.port, conn.username, conn.password, priv_str, target, username, host
                )
            }
            DatabaseType::PostgreSQL => {
                match database {
                    Some(db) => format!(
                        "PGPASSWORD='{}' psql -h {} -p {} -U {} -d postgres -c \"GRANT {} ON DATABASE {} TO {};\"",
                        conn.password, conn.host, conn.port, conn.username, priv_str, db, username
                    ),
                    None => format!(
                        "PGPASSWORD='{}' psql -h {} -p {} -U {} -d postgres -c \"ALTER USER {} WITH {};\"",
                        conn.password, conn.host, conn.port, conn.username, username, priv_str
                    ),
                }
            }
        };

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        if output.exit_code != 0 || output.stderr.contains("ERROR") {
            return Err(anyhow!("Failed to grant privileges: {}", output.stderr));
        }

        Ok(())
    }

    /// Revoke privileges from a user
    pub fn revoke_privileges(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        username: &str,
        host: &str,
        privileges: &[String],
        database: Option<&str>,
    ) -> Result<()> {
        let priv_str = privileges.join(", ");

        let cmd = match conn.db_type {
            DatabaseType::MySQL => {
                let target = match database {
                    Some(db) => format!("{}.*", db),
                    None => "*.*".to_string(),
                };
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' -e \"REVOKE {} ON {} FROM '{}'@'{}'; FLUSH PRIVILEGES;\"",
                    conn.host, conn.port, conn.username, conn.password, priv_str, target, username, host
                )
            }
            DatabaseType::PostgreSQL => {
                match database {
                    Some(db) => format!(
                        "PGPASSWORD='{}' psql -h {} -p {} -U {} -d postgres -c \"REVOKE {} ON DATABASE {} FROM {};\"",
                        conn.password, conn.host, conn.port, conn.username, priv_str, db, username
                    ),
                    None => format!(
                        "PGPASSWORD='{}' psql -h {} -p {} -U {} -d postgres -c \"ALTER USER {} WITH NO{};\"",
                        conn.password, conn.host, conn.port, conn.username, username, priv_str
                    ),
                }
            }
        };

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        if output.exit_code != 0 || output.stderr.contains("ERROR") {
            return Err(anyhow!("Failed to revoke privileges: {}", output.stderr));
        }

        Ok(())
    }

    /// Change user password
    pub fn change_user_password(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        username: &str,
        host: &str,
        new_password: &str,
    ) -> Result<()> {
        let cmd = match conn.db_type {
            DatabaseType::MySQL => {
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' -e \"ALTER USER '{}'@'{}' IDENTIFIED BY '{}'; FLUSH PRIVILEGES;\"",
                    conn.host, conn.port, conn.username, conn.password, username, host, new_password
                )
            }
            DatabaseType::PostgreSQL => {
                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d postgres -c \"ALTER USER {} WITH PASSWORD '{}';\"",
                    conn.password, conn.host, conn.port, conn.username, username, new_password
                )
            }
        };

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        if output.exit_code != 0 || output.stderr.contains("ERROR") {
            return Err(anyhow!("Failed to change password: {}", output.stderr));
        }

        Ok(())
    }

    /// Create a table
    pub fn create_table(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        input: &super::types::CreateTableInput,
    ) -> Result<()> {
        let mut column_defs: Vec<String> = Vec::new();

        for col in &input.columns {
            let mut def = format!("{} {}", col.name, col.data_type);

            if let Some(len) = col.length {
                def = format!("{}({})", def, len);
            }

            if !col.is_nullable {
                def.push_str(" NOT NULL");
            }

            if col.is_auto_increment {
                match conn.db_type {
                    DatabaseType::MySQL => def.push_str(" AUTO_INCREMENT"),
                    DatabaseType::PostgreSQL => {
                        // PostgreSQL uses SERIAL type instead
                        def = format!("{} SERIAL", col.name);
                        if !col.is_nullable {
                            def.push_str(" NOT NULL");
                        }
                    }
                }
            }

            if let Some(ref default) = col.default_value {
                def.push_str(&format!(" DEFAULT {}", default));
            }

            if let Some(ref comment) = col.comment {
                if conn.db_type == DatabaseType::MySQL {
                    def.push_str(&format!(" COMMENT '{}'", comment.replace("'", "''")));
                }
            }

            column_defs.push(def);
        }

        // Add primary key
        if let Some(ref pk_cols) = input.primary_key {
            if !pk_cols.is_empty() {
                column_defs.push(format!("PRIMARY KEY ({})", pk_cols.join(", ")));
            }
        }

        let engine_clause = match conn.db_type {
            DatabaseType::MySQL => input
                .engine
                .as_ref()
                .map(|e| format!(" ENGINE={}", e))
                .unwrap_or_default(),
            DatabaseType::PostgreSQL => String::new(),
        };

        let create_sql = format!(
            "CREATE TABLE {} ({}){}",
            input.name,
            column_defs.join(", "),
            engine_clause
        );

        let cmd = match conn.db_type {
            DatabaseType::MySQL => {
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' {} -e \"{}\"",
                    conn.host, conn.port, conn.username, conn.password, input.database, create_sql
                )
            }
            DatabaseType::PostgreSQL => {
                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} -c \"{}\"",
                    conn.password, conn.host, conn.port, conn.username, input.database, create_sql
                )
            }
        };

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        if output.exit_code != 0 || output.stderr.contains("ERROR") {
            return Err(anyhow!("Failed to create table: {}", output.stderr));
        }

        Ok(())
    }

    /// Drop a table
    pub fn drop_table(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        database: &str,
        table: &str,
    ) -> Result<()> {
        let cmd = match conn.db_type {
            DatabaseType::MySQL => {
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' {} -e \"DROP TABLE {};\"",
                    conn.host, conn.port, conn.username, conn.password, database, table
                )
            }
            DatabaseType::PostgreSQL => {
                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} -c \"DROP TABLE {};\"",
                    conn.password, conn.host, conn.port, conn.username, database, table
                )
            }
        };

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        if output.exit_code != 0 || output.stderr.contains("ERROR") {
            return Err(anyhow!("Failed to drop table: {}", output.stderr));
        }

        Ok(())
    }

    /// Truncate a table
    pub fn truncate_table(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        database: &str,
        table: &str,
    ) -> Result<()> {
        let cmd = match conn.db_type {
            DatabaseType::MySQL => {
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' {} -e \"TRUNCATE TABLE {};\"",
                    conn.host, conn.port, conn.username, conn.password, database, table
                )
            }
            DatabaseType::PostgreSQL => {
                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} -c \"TRUNCATE TABLE {};\"",
                    conn.password, conn.host, conn.port, conn.username, database, table
                )
            }
        };

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        if output.exit_code != 0 || output.stderr.contains("ERROR") {
            return Err(anyhow!("Failed to truncate table: {}", output.stderr));
        }

        Ok(())
    }

    /// Search data in table
    pub fn search_table_data(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        database: &str,
        table: &str,
        search_term: &str,
        columns: &[String],
        page: i32,
        page_size: i32,
    ) -> Result<super::types::TableData> {
        // Get columns first
        let table_columns = self.get_table_columns(server, conn, database, table)?;

        // Find primary key columns
        let primary_key_columns: Vec<String> = table_columns
            .iter()
            .filter(|c| c.is_primary_key)
            .map(|c| c.name.clone())
            .collect();

        // Build search condition
        let search_columns = if columns.is_empty() {
            table_columns
                .iter()
                .map(|c| c.name.clone())
                .collect::<Vec<_>>()
        } else {
            columns.to_vec()
        };

        let escaped_term = search_term.replace("'", "''");
        let where_conditions: Vec<String> = search_columns
            .iter()
            .map(|col| match conn.db_type {
                DatabaseType::MySQL => format!("{} LIKE '%{}%'", col, escaped_term),
                DatabaseType::PostgreSQL => format!("{}::text ILIKE '%{}%'", col, escaped_term),
            })
            .collect();

        let where_clause = if where_conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", where_conditions.join(" OR "))
        };

        let offset = (page - 1) * page_size;

        // Get total count
        let count_cmd = match conn.db_type {
            DatabaseType::MySQL => {
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' {} -N -e \"SELECT COUNT(*) FROM {} {};\"",
                    conn.host,
                    conn.port,
                    conn.username,
                    conn.password,
                    database,
                    table,
                    where_clause
                )
            }
            DatabaseType::PostgreSQL => {
                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} -t -A -c \"SELECT COUNT(*) FROM {} {};\"",
                    conn.password, conn.host, conn.port, conn.username, database, table, where_clause
                )
            }
        };

        let count_output = self
            .ssh_client
            .execute_command(server, &count_cmd, Some(30))?;
        let total_rows: i64 = count_output.stdout.trim().parse().unwrap_or(0);

        // Get data
        let data_cmd = match conn.db_type {
            DatabaseType::MySQL => {
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' {} -N -e \"SELECT * FROM {} {} LIMIT {} OFFSET {};\"",
                    conn.host, conn.port, conn.username, conn.password, database, table, where_clause, page_size, offset
                )
            }
            DatabaseType::PostgreSQL => {
                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} -t -A -F '|' -c \"SELECT * FROM {} {} LIMIT {} OFFSET {};\"",
                    conn.password, conn.host, conn.port, conn.username, database, table, where_clause, page_size, offset
                )
            }
        };

        let data_output = self
            .ssh_client
            .execute_command(server, &data_cmd, Some(60))?;

        let rows: Vec<Vec<serde_json::Value>> = data_output
            .stdout
            .lines()
            .filter(|line| !line.is_empty())
            .map(|line| {
                let parts: Vec<&str> = match conn.db_type {
                    DatabaseType::MySQL => line.split('\t').collect(),
                    DatabaseType::PostgreSQL => line.split('|').collect(),
                };
                parts
                    .iter()
                    .map(|s| {
                        if *s == "NULL" || (*s == "\\N" && conn.db_type == DatabaseType::MySQL) {
                            serde_json::Value::Null
                        } else if let Ok(n) = s.parse::<i64>() {
                            serde_json::json!(n)
                        } else if let Ok(f) = s.parse::<f64>() {
                            serde_json::json!(f)
                        } else {
                            serde_json::json!(s.to_string())
                        }
                    })
                    .collect()
            })
            .collect();

        Ok(super::types::TableData {
            columns: table_columns,
            rows,
            total_rows,
            page,
            page_size,
            primary_key_columns,
        })
    }

    // ==================== Query History ====================

    /// Add entry to query history
    pub async fn add_to_history(
        &self,
        connection_id: &str,
        database: &str,
        query: &str,
        result: &QueryResult,
    ) -> Result<()> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        sqlx::query(
            r#"
            INSERT INTO query_history 
            (id, connection_id, database_name, query, execution_time_ms, rows_affected, success, error, executed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(connection_id)
        .bind(database)
        .bind(query)
        .bind(result.execution_time_ms as i64)
        .bind(result.affected_rows)
        .bind(if result.error.is_none() { 1 } else { 0 })
        .bind(&result.error)
        .bind(&now)
        .execute(&self.db_pool)
        .await
        .map_err(|e| anyhow!("Failed to add query history: {}", e))?;

        Ok(())
    }

    /// Get query history for a connection
    pub async fn get_query_history(
        &self,
        connection_id: &str,
        limit: i32,
    ) -> Result<Vec<QueryHistoryEntry>> {
        let rows: Vec<QueryHistoryRow> = sqlx::query_as(
            "SELECT * FROM query_history WHERE connection_id = ? ORDER BY executed_at DESC LIMIT ?",
        )
        .bind(connection_id)
        .bind(limit)
        .fetch_all(&self.db_pool)
        .await
        .map_err(|e| anyhow!("Failed to get query history: {}", e))?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Clear query history for a connection
    pub async fn clear_query_history(&self, connection_id: &str) -> Result<()> {
        sqlx::query("DELETE FROM query_history WHERE connection_id = ?")
            .bind(connection_id)
            .execute(&self.db_pool)
            .await
            .map_err(|e| anyhow!("Failed to clear query history: {}", e))?;

        Ok(())
    }

    // ==================== Saved Queries ====================

    /// Save a query
    pub async fn save_query(&self, input: SaveQueryInput) -> Result<SavedQuery> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        sqlx::query(
            r#"
            INSERT INTO saved_queries 
            (id, connection_id, name, description, query, database_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&input.connection_id)
        .bind(&input.name)
        .bind(&input.description)
        .bind(&input.query)
        .bind(&input.database)
        .bind(&now)
        .bind(&now)
        .execute(&self.db_pool)
        .await
        .map_err(|e| anyhow!("Failed to save query: {}", e))?;

        Ok(SavedQuery {
            id,
            connection_id: input.connection_id,
            name: input.name,
            description: input.description,
            query: input.query,
            database: input.database,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    /// Get saved queries
    pub async fn get_saved_queries(&self, connection_id: Option<&str>) -> Result<Vec<SavedQuery>> {
        let rows: Vec<SavedQueryRow> = if let Some(conn_id) = connection_id {
            sqlx::query_as(
                "SELECT * FROM saved_queries WHERE connection_id = ? OR connection_id IS NULL ORDER BY name",
            )
            .bind(conn_id)
            .fetch_all(&self.db_pool)
            .await
        } else {
            sqlx::query_as(
                "SELECT * FROM saved_queries ORDER BY name",
            )
            .fetch_all(&self.db_pool)
            .await
        }
        .map_err(|e| anyhow!("Failed to get saved queries: {}", e))?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Delete a saved query
    pub async fn delete_saved_query(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM saved_queries WHERE id = ?")
            .bind(id)
            .execute(&self.db_pool)
            .await
            .map_err(|e| anyhow!("Failed to delete saved query: {}", e))?;

        Ok(())
    }

    /// Update a connection
    pub async fn update_connection(&self, id: &str, input: UpdateConnectionInput) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();

        // Get current connection to merge updates
        let current = self
            .get_connection(id)
            .await
            .ok_or_else(|| anyhow!("Connection not found: {}", id))?;

        let name = input.name.unwrap_or(current.name);
        let host = input.host.unwrap_or(current.host);
        let port = input.port.unwrap_or(current.port);
        let username = input.username.unwrap_or(current.username);
        let password = input.password.unwrap_or(current.password);
        let database = input.database.or(current.database);

        sqlx::query(
            r#"
            UPDATE database_connections 
            SET name = ?, host = ?, port = ?, username = ?, password = ?, database_name = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(&name)
        .bind(&host)
        .bind(port as i32)
        .bind(&username)
        .bind(&password)
        .bind(&database)
        .bind(&now)
        .bind(id)
        .execute(&self.db_pool)
        .await
        .map_err(|e| anyhow!("Failed to update connection: {}", e))?;

        Ok(())
    }

    // ==================== Backup & Restore ====================

    /// Create a database backup
    pub fn backup_database(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        options: &super::types::BackupOptions,
    ) -> Result<super::types::BackupResult> {
        let start = std::time::Instant::now();

        // Build table list if specified
        let table_args = match &options.tables {
            Some(tables) if !tables.is_empty() => tables.join(" "),
            _ => String::new(),
        };

        // Build dump command based on database type
        let dump_cmd = match conn.db_type {
            DatabaseType::MySQL => {
                let mut args = vec![
                    format!("-h {}", conn.host),
                    format!("-P {}", conn.port),
                    format!("-u {}", conn.username),
                    format!("-p'{}'", conn.password),
                ];

                if !options.include_structure && options.include_data {
                    args.push("--no-create-info".to_string());
                }
                if options.include_structure && !options.include_data {
                    args.push("--no-data".to_string());
                }

                args.push(options.database.clone());

                if !table_args.is_empty() {
                    args.push(table_args);
                }

                format!("mysqldump {}", args.join(" "))
            }
            DatabaseType::PostgreSQL => {
                let mut args = vec![
                    format!("-h {}", conn.host),
                    format!("-p {}", conn.port),
                    format!("-U {}", conn.username),
                    format!("-d {}", options.database),
                ];

                if !options.include_structure && options.include_data {
                    args.push("--data-only".to_string());
                }
                if options.include_structure && !options.include_data {
                    args.push("--schema-only".to_string());
                }

                if let Some(tables) = &options.tables {
                    for table in tables {
                        args.push(format!("-t {}", table));
                    }
                }

                format!("PGPASSWORD='{}' pg_dump {}", conn.password, args.join(" "))
            }
        };

        // Determine output handling
        let cmd = if let Some(ref remote_path) = options.remote_path {
            if options.compress {
                format!("{} | gzip > {}", dump_cmd, remote_path)
            } else {
                format!("{} > {}", dump_cmd, remote_path)
            }
        } else if options.compress {
            // Compress and base64 encode for transfer
            format!("{} | gzip | base64", dump_cmd)
        } else {
            dump_cmd
        };

        // Execute with longer timeout for large databases
        let output = self.ssh_client.execute_command(server, &cmd, Some(600))?;
        let duration_ms = start.elapsed().as_millis() as u64;

        if output.exit_code != 0 {
            return Ok(super::types::BackupResult {
                success: false,
                file_path: None,
                file_size: None,
                content: None,
                duration_ms,
                error: Some(output.stderr),
            });
        }

        // Get file size if saved to remote path
        let file_size = if let Some(ref remote_path) = options.remote_path {
            let size_cmd = format!(
                "stat -c%s {} 2>/dev/null || stat -f%z {}",
                remote_path, remote_path
            );
            if let Ok(size_output) = self.ssh_client.execute_command(server, &size_cmd, Some(10)) {
                size_output.stdout.trim().parse().ok()
            } else {
                None
            }
        } else {
            None
        };

        Ok(super::types::BackupResult {
            success: true,
            file_path: options.remote_path.clone(),
            file_size,
            content: if options.remote_path.is_none() && !options.compress {
                Some(output.stdout)
            } else if options.remote_path.is_none() && options.compress {
                Some(output.stdout) // Base64 encoded gzip content
            } else {
                None
            },
            duration_ms,
            error: None,
        })
    }

    /// Restore a database from backup
    pub fn restore_database(
        &self,
        server: &Server,
        conn: &DatabaseConnection,
        options: &super::types::RestoreOptions,
    ) -> Result<super::types::RestoreResult> {
        let start = std::time::Instant::now();

        // Build restore command based on source type
        let restore_cmd = match &options.source {
            super::types::RestoreSource::RemotePath(path) => {
                let is_compressed = path.ends_with(".gz") || path.ends_with(".gzip");
                let cat_cmd = if is_compressed {
                    format!("zcat {}", path)
                } else {
                    format!("cat {}", path)
                };

                match conn.db_type {
                    DatabaseType::MySQL => {
                        format!(
                            "{} | mysql -h {} -P {} -u {} -p'{}' {}",
                            cat_cmd,
                            conn.host,
                            conn.port,
                            conn.username,
                            conn.password,
                            options.database
                        )
                    }
                    DatabaseType::PostgreSQL => {
                        format!(
                            "{} | PGPASSWORD='{}' psql -h {} -p {} -U {} -d {}",
                            cat_cmd,
                            conn.password,
                            conn.host,
                            conn.port,
                            conn.username,
                            options.database
                        )
                    }
                }
            }
            super::types::RestoreSource::Content(content) => {
                // For content, we need to write to a temp file first
                let temp_file = format!("/tmp/db_restore_{}.sql", uuid::Uuid::new_v4());
                let escaped_content = content.replace("'", "'\\''");

                match conn.db_type {
                    DatabaseType::MySQL => {
                        format!(
                            "echo '{}' > {} && mysql -h {} -P {} -u {} -p'{}' {} < {} && rm -f {}",
                            escaped_content,
                            temp_file,
                            conn.host,
                            conn.port,
                            conn.username,
                            conn.password,
                            options.database,
                            temp_file,
                            temp_file
                        )
                    }
                    DatabaseType::PostgreSQL => {
                        format!(
                            "echo '{}' > {} && PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} < {} && rm -f {}",
                            escaped_content, temp_file, conn.password, conn.host, conn.port, conn.username, options.database, temp_file, temp_file
                        )
                    }
                }
            }
        };

        // Optionally drop existing tables first
        if options.drop_existing {
            let drop_cmd = match conn.db_type {
                DatabaseType::MySQL => {
                    format!(
                        "mysql -h {} -P {} -u {} -p'{}' {} -N -e \"SET FOREIGN_KEY_CHECKS=0; SELECT CONCAT('DROP TABLE IF EXISTS ', table_name, ';') FROM information_schema.tables WHERE table_schema = '{}';\" | mysql -h {} -P {} -u {} -p'{}' {}; mysql -h {} -P {} -u {} -p'{}' {} -e \"SET FOREIGN_KEY_CHECKS=1;\"",
                        conn.host, conn.port, conn.username, conn.password, options.database, options.database,
                        conn.host, conn.port, conn.username, conn.password, options.database,
                        conn.host, conn.port, conn.username, conn.password, options.database
                    )
                }
                DatabaseType::PostgreSQL => {
                    format!(
                        "PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} -c \"DROP SCHEMA public CASCADE; CREATE SCHEMA public;\"",
                        conn.password, conn.host, conn.port, conn.username, options.database
                    )
                }
            };

            let _ = self.ssh_client.execute_command(server, &drop_cmd, Some(60));
        }

        // Execute restore
        let output = self
            .ssh_client
            .execute_command(server, &restore_cmd, Some(600))?;
        let duration_ms = start.elapsed().as_millis() as u64;

        if output.exit_code != 0 {
            return Ok(super::types::RestoreResult {
                success: false,
                tables_restored: 0,
                duration_ms,
                error: Some(output.stderr),
            });
        }

        // Count restored tables
        let count_cmd = match conn.db_type {
            DatabaseType::MySQL => {
                format!(
                    "mysql -h {} -P {} -u {} -p'{}' {} -N -e \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '{}';\"",
                    conn.host, conn.port, conn.username, conn.password, options.database, options.database
                )
            }
            DatabaseType::PostgreSQL => {
                format!(
                    "PGPASSWORD='{}' psql -h {} -p {} -U {} -d {} -t -A -c \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';\"",
                    conn.password, conn.host, conn.port, conn.username, options.database
                )
            }
        };

        let tables_restored = if let Ok(count_output) =
            self.ssh_client
                .execute_command(server, &count_cmd, Some(10))
        {
            count_output.stdout.trim().parse().unwrap_or(0)
        } else {
            0
        };

        Ok(super::types::RestoreResult {
            success: true,
            tables_restored,
            duration_ms,
            error: None,
        })
    }

    /// List backup files on remote server
    pub fn list_backup_files(
        &self,
        server: &Server,
        directory: &str,
    ) -> Result<Vec<super::types::BackupFileInfo>> {
        let cmd = format!(
            "find {} -maxdepth 1 -type f \\( -name '*.sql' -o -name '*.sql.gz' -o -name '*.dump' -o -name '*.dump.gz' \\) -printf '%f|%s|%T@\\n' 2>/dev/null | sort -t'|' -k3 -rn",
            directory
        );

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        let mut files = Vec::new();
        for line in output.stdout.lines() {
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() >= 3 {
                let name = parts[0].to_string();
                let size: i64 = parts[1].parse().unwrap_or(0);
                let timestamp: f64 = parts[2].parse().unwrap_or(0.0);
                let modified_at = chrono::DateTime::from_timestamp(timestamp as i64, 0)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default();

                files.push(super::types::BackupFileInfo {
                    name,
                    path: format!("{}/{}", directory.trim_end_matches('/'), parts[0]),
                    size,
                    modified_at,
                    compressed: parts[0].ends_with(".gz"),
                });
            }
        }

        Ok(files)
    }

    /// Delete a backup file
    pub fn delete_backup_file(&self, server: &Server, file_path: &str) -> Result<()> {
        let cmd = format!("rm -f {}", file_path);
        let output = self.ssh_client.execute_command(server, &cmd, Some(10))?;

        if output.exit_code != 0 {
            return Err(anyhow!("Failed to delete backup file: {}", output.stderr));
        }

        Ok(())
    }

    /// Save backup history entry
    pub async fn save_backup_history(
        &self,
        entry: &super::types::BackupHistoryEntry,
    ) -> Result<()> {
        let tables_json = entry
            .tables
            .as_ref()
            .map(|t| serde_json::to_string(t).unwrap_or_default());

        sqlx::query(
            r#"
            INSERT INTO backup_history 
            (id, connection_id, database_name, file_path, file_size, tables_json, include_structure, include_data, compressed, status, error, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&entry.id)
        .bind(&entry.connection_id)
        .bind(&entry.database)
        .bind(&entry.file_path)
        .bind(entry.file_size)
        .bind(&tables_json)
        .bind(if entry.include_structure { 1 } else { 0 })
        .bind(if entry.include_data { 1 } else { 0 })
        .bind(if entry.compressed { 1 } else { 0 })
        .bind(&entry.status)
        .bind(&entry.error)
        .bind(&entry.created_at)
        .execute(&self.db_pool)
        .await
        .map_err(|e| anyhow!("Failed to save backup history: {}", e))?;

        Ok(())
    }

    /// Get backup history
    pub async fn get_backup_history(
        &self,
        connection_id: Option<&str>,
        limit: i32,
    ) -> Result<Vec<super::types::BackupHistoryEntry>> {
        let rows: Vec<super::types::BackupHistoryRow> = if let Some(conn_id) = connection_id {
            sqlx::query_as(
                "SELECT * FROM backup_history WHERE connection_id = ? ORDER BY created_at DESC LIMIT ?",
            )
            .bind(conn_id)
            .bind(limit)
            .fetch_all(&self.db_pool)
            .await
        } else {
            sqlx::query_as(
                "SELECT * FROM backup_history ORDER BY created_at DESC LIMIT ?",
            )
            .bind(limit)
            .fetch_all(&self.db_pool)
            .await
        }
        .map_err(|e| anyhow!("Failed to get backup history: {}", e))?;

        Ok(rows
            .into_iter()
            .map(|r: super::types::BackupHistoryRow| r.into())
            .collect())
    }

    /// Clear backup history
    pub async fn clear_backup_history(&self, connection_id: Option<&str>) -> Result<()> {
        if let Some(conn_id) = connection_id {
            sqlx::query("DELETE FROM backup_history WHERE connection_id = ?")
                .bind(conn_id)
                .execute(&self.db_pool)
                .await
        } else {
            sqlx::query("DELETE FROM backup_history")
                .execute(&self.db_pool)
                .await
        }
        .map_err(|e| anyhow!("Failed to clear backup history: {}", e))?;

        Ok(())
    }
}
