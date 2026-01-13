use crate::error::{AppError, Result};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::Path;
use std::str::FromStr;

pub async fn init_database(app_data_dir: &Path) -> Result<SqlitePool> {
    // Ensure the directory exists
    std::fs::create_dir_all(app_data_dir)
        .map_err(|e| AppError::DatabaseError(format!("Failed to create data directory: {}", e)))?;

    let db_path = app_data_dir.join("devops-commander.db");
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

    let options = SqliteConnectOptions::from_str(&db_url)
        .map_err(|e| AppError::DatabaseError(format!("Invalid database URL: {}", e)))?
        .create_if_missing(true);

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
    .map_err(|e| AppError::DatabaseError(format!("Failed to create deployment_scripts table: {}", e)))?;

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
    .map_err(|e| AppError::DatabaseError(format!("Failed to create deployment_logs table: {}", e)))?;

    // Create indexes for deployments table
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_deployments_script ON deployments(script_id)")
        .execute(pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create deployments script index: {}", e)))?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status)")
        .execute(pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create deployments status index: {}", e)))?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_deployments_started ON deployments(started_at)")
        .execute(pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create deployments started_at index: {}", e)))?;

    // Create index for deployment_logs table
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_deployment_logs_deployment ON deployment_logs(deployment_id)")
        .execute(pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create deployment_logs index: {}", e)))?;

    Ok(())
}
