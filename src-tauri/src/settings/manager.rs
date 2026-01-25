use super::models::TerminalSettings;
use crate::error::Result;
use sqlx::SqlitePool;

pub struct SettingsManager {
    db: SqlitePool,
}

impl SettingsManager {
    pub fn new(db: SqlitePool) -> Self {
        Self { db }
    }

    pub async fn get_terminal_settings(&self) -> Result<TerminalSettings> {
        let row = sqlx::query_scalar::<_, String>(
            "SELECT value FROM app_settings WHERE key = 'terminal_settings'",
        )
        .fetch_optional(&self.db)
        .await?;

        match row {
            Some(json) => serde_json::from_str(&json).map_err(|e| {
                crate::error::AppError::ValidationError(format!("Invalid settings JSON: {}", e))
            }),
            None => Ok(TerminalSettings::default()),
        }
    }

    pub async fn save_terminal_settings(&self, settings: &TerminalSettings) -> Result<()> {
        let json = serde_json::to_string(settings).map_err(|e| {
            crate::error::AppError::ValidationError(format!("Failed to serialize settings: {}", e))
        })?;

        sqlx::query(
            r#"
            INSERT INTO app_settings (key, value, updated_at)
            VALUES ('terminal_settings', ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            "#,
        )
        .bind(&json)
        .execute(&self.db)
        .await?;

        Ok(())
    }
}
