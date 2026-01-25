use crate::error::{AppError, Result};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::Path;
use std::str::FromStr;

/// Initialize the SQLite database.
/// Sensitive data (passwords, SSH keys) are stored in OS keychain, not in SQLite.
pub async fn init_database(app_data_dir: &Path) -> Result<SqlitePool> {
    // Ensure the directory exists
    std::fs::create_dir_all(app_data_dir)
        .map_err(|e| AppError::DatabaseError(format!("Failed to create data directory: {}", e)))?;

    let db_path = app_data_dir.join("cargoship.db");
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

    let options = SqliteConnectOptions::from_str(&db_url)
        .map_err(|e| AppError::DatabaseError(format!("Invalid database URL: {}", e)))?
        .create_if_missing(true)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to connect to database: {}", e)))?;

    // Run migrations
    run_migrations(&pool).await?;

    Ok(pool)
}

async fn run_migrations(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS servers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            host TEXT NOT NULL,
            port INTEGER NOT NULL DEFAULT 22,
            username TEXT NOT NULL,
            auth_method TEXT NOT NULL CHECK (auth_method IN ('password', 'ssh-key')),
            tags TEXT DEFAULT '[]',
            environment TEXT NOT NULL CHECK (environment IN ('dev', 'staging', 'prod')),
            use_sudo INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_connected TEXT,
            UNIQUE(host, port, username)
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to create servers table: {}", e)))?;

    // Migration: Add use_sudo column if it doesn't exist
    let _ = sqlx::query("ALTER TABLE servers ADD COLUMN use_sudo INTEGER NOT NULL DEFAULT 0")
        .execute(pool)
        .await;

    // Migration: Add ssh_key_id column if it doesn't exist
    let _ = sqlx::query("ALTER TABLE servers ADD COLUMN ssh_key_id TEXT")
        .execute(pool)
        .await;

    // Create indexes
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_servers_environment ON servers(environment)")
        .execute(pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create index: {}", e)))?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_servers_host ON servers(host)")
        .execute(pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create index: {}", e)))?;

    // Create deployment_scripts table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS deployment_scripts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            variables TEXT NOT NULL DEFAULT '[]',
            steps TEXT NOT NULL DEFAULT '[]',
            rollback_steps TEXT DEFAULT '[]',
            tags TEXT DEFAULT '[]',
            is_template INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| {
        AppError::DatabaseError(format!("Failed to create deployment_scripts table: {}", e))
    })?;

    // Create deployments table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS deployments (
            id TEXT PRIMARY KEY,
            script_id TEXT NOT NULL,
            script_name TEXT NOT NULL,
            server_ids TEXT NOT NULL,
            variables TEXT NOT NULL,
            status TEXT NOT NULL,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            duration_ms INTEGER,
            triggered_by TEXT NOT NULL,
            rollback_of TEXT,
            FOREIGN KEY (script_id) REFERENCES deployment_scripts(id)
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to create deployments table: {}", e)))?;

    // Create deployment_logs table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS deployment_logs (
            id TEXT PRIMARY KEY,
            deployment_id TEXT NOT NULL,
            step_id TEXT NOT NULL,
            step_name TEXT NOT NULL,
            server_id TEXT NOT NULL,
            server_name TEXT NOT NULL,
            output TEXT,
            stderr TEXT,
            exit_code INTEGER,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            duration_ms INTEGER,
            status TEXT NOT NULL,
            FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| {
        AppError::DatabaseError(format!("Failed to create deployment_logs table: {}", e))
    })?;

    // Migration: Add stderr column if it doesn't exist
    let _ = sqlx::query("ALTER TABLE deployment_logs ADD COLUMN stderr TEXT DEFAULT ''")
        .execute(pool)
        .await;

    // Create indexes for deployments table
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_deployments_script ON deployments(script_id)")
        .execute(pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to create deployments script index: {}", e))
        })?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status)")
        .execute(pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to create deployments status index: {}", e))
        })?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_deployments_started ON deployments(started_at)")
        .execute(pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!(
                "Failed to create deployments started_at index: {}",
                e
            ))
        })?;

    // Create index for deployment_logs table
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_deployment_logs_deployment ON deployment_logs(deployment_id)")
        .execute(pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create deployment_logs index: {}", e)))?;

    // Phase 4: Create server_groups table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS server_groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to create server_groups table: {}", e)))?;

    // Phase 4: Create group_members table with foreign keys and cascade delete
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS group_members (
            group_id TEXT NOT NULL,
            server_id TEXT NOT NULL,
            added_at TEXT NOT NULL,
            PRIMARY KEY (group_id, server_id),
            FOREIGN KEY (group_id) REFERENCES server_groups(id) ON DELETE CASCADE,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to create group_members table: {}", e)))?;

    // Create indexes for group_members
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id)")
        .execute(pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to create group_members group index: {}", e))
        })?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_group_members_server ON group_members(server_id)")
        .execute(pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!(
                "Failed to create group_members server index: {}",
                e
            ))
        })?;

    // Phase 4: Create snippets table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS snippets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            command TEXT NOT NULL,
            category TEXT NOT NULL,
            tags TEXT DEFAULT '[]',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to create snippets table: {}", e)))?;

    // Create index for snippets category
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_snippets_category ON snippets(category)")
        .execute(pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to create snippets category index: {}", e))
        })?;

    // Phase 4: Create server_metrics table for monitoring
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS server_metrics (
            id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            cpu_percent REAL,
            memory_used INTEGER,
            memory_total INTEGER,
            disk_used INTEGER,
            disk_total INTEGER,
            load_average TEXT,
            uptime_seconds INTEGER,
            collected_at TEXT NOT NULL,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| {
        AppError::DatabaseError(format!("Failed to create server_metrics table: {}", e))
    })?;

    // Create indexes for server_metrics
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_server_metrics_server ON server_metrics(server_id)",
    )
    .execute(pool)
    .await
    .map_err(|e| {
        AppError::DatabaseError(format!(
            "Failed to create server_metrics server index: {}",
            e
        ))
    })?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_server_metrics_time ON server_metrics(collected_at)",
    )
    .execute(pool)
    .await
    .map_err(|e| {
        AppError::DatabaseError(format!("Failed to create server_metrics time index: {}", e))
    })?;

    // Phase 4: Create alerts table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS alerts (
            id TEXT PRIMARY KEY,
            server_id TEXT,
            metric TEXT NOT NULL,
            condition TEXT NOT NULL,
            threshold REAL NOT NULL,
            enabled INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to create alerts table: {}", e)))?;

    // Create index for alerts
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_alerts_server ON alerts(server_id)")
        .execute(pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to create alerts server index: {}", e))
        })?;

    // Phase 4: Create favorites table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS favorites (
            id TEXT PRIMARY KEY,
            item_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(item_type, item_id)
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to create favorites table: {}", e)))?;

    // Create index for favorites
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_favorites_type ON favorites(item_type)")
        .execute(pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to create favorites type index: {}", e))
        })?;

    // Phase 4: Create activity_log table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS activity_log (
            id TEXT PRIMARY KEY,
            action TEXT NOT NULL,
            item_type TEXT,
            item_id TEXT,
            details TEXT,
            created_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to create activity_log table: {}", e)))?;

    // Create index for activity_log time
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_activity_log_time ON activity_log(created_at)")
        .execute(pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to create activity_log time index: {}", e))
        })?;

    // Create ssh_keys table for storing generated SSH keys (encrypted in keychain)
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS ssh_keys (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            key_type TEXT NOT NULL,
            public_key TEXT NOT NULL,
            fingerprint TEXT NOT NULL,
            comment TEXT,
            created_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to create ssh_keys table: {}", e)))?;

    // Create index for ssh_keys
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_ssh_keys_name ON ssh_keys(name)")
        .execute(pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to create ssh_keys name index: {}", e))
        })?;

    // Migration: Add encrypted_private_key column if it doesn't exist
    // This allows identifying keys that use the hybrid storage strategy (KEK in keyring, Blob in DB)
    let _ = sqlx::query("ALTER TABLE ssh_keys ADD COLUMN encrypted_private_key TEXT")
        .execute(pool)
        .await;

    // Create database_connections table (passwords stored in keychain, not here)
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
            database_name TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| {
        AppError::DatabaseError(format!(
            "Failed to create database_connections table: {}",
            e
        ))
    })?;

    // Create indexes for database_connections
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_db_connections_server ON database_connections(server_id)",
    )
    .execute(pool)
    .await
    .map_err(|e| {
        AppError::DatabaseError(format!(
            "Failed to create database_connections server index: {}",
            e
        ))
    })?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_db_connections_name ON database_connections(name)")
        .execute(pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!(
                "Failed to create database_connections name index: {}",
                e
            ))
        })?;

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
    .execute(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to create query_history table: {}", e)))?;

    // Create index for query_history
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_query_history_connection ON query_history(connection_id, executed_at DESC)")
        .execute(pool)
        .await
        .ok();

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
    .execute(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to create saved_queries table: {}", e)))?;

    // Create backup_history table
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS backup_history (
            id TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL,
            database_name TEXT NOT NULL,
            file_path TEXT,
            file_size INTEGER,
            tables_json TEXT,
            include_structure INTEGER NOT NULL DEFAULT 1,
            include_data INTEGER NOT NULL DEFAULT 1,
            compressed INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL,
            error TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (connection_id) REFERENCES database_connections(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| {
        AppError::DatabaseError(format!("Failed to create backup_history table: {}", e))
    })?;

    // Create index for backup_history
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_backup_history_connection ON backup_history(connection_id, created_at DESC)")
        .execute(pool)
        .await
        .ok();

    // Create app_settings table for storing application settings
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to create app_settings table: {}", e)))?;

    Ok(())
}
