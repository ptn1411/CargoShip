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

    // Create indexes
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_servers_environment ON servers(environment)")
        .execute(pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create index: {}", e)))?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_servers_host ON servers(host)")
        .execute(pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create index: {}", e)))?;

    Ok(())
}
