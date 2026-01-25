use crate::error::{AppError, Result};
use super::models::*;
use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

pub struct FavoritesManager {
    db: SqlitePool,
}

impl FavoritesManager {
    pub fn new(db: SqlitePool) -> Self {
        Self { db }
    }

    /// Add an item to favorites
    /// Requirements: 7.2
    pub async fn add_favorite(&self, item_type: FavoriteType, item_id: &str) -> Result<Favorite> {
        let now = Utc::now();
        let id = Uuid::new_v4().to_string();
        let type_str = item_type.to_string();

        // Use INSERT OR REPLACE to handle duplicates
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO favorites (id, item_type, item_id, created_at)
            VALUES (
                COALESCE(
                    (SELECT id FROM favorites WHERE item_type = ? AND item_id = ?),
                    ?
                ),
                ?, ?, ?
            )
            "#,
        )
        .bind(&type_str)
        .bind(item_id)
        .bind(&id)
        .bind(&type_str)
        .bind(item_id)
        .bind(now.to_rfc3339())
        .execute(&self.db)
        .await?;

        // Fetch the actual record (might have existing id)
        let row = sqlx::query_as::<_, FavoriteRow>(
            "SELECT * FROM favorites WHERE item_type = ? AND item_id = ?"
        )
        .bind(&type_str)
        .bind(item_id)
        .fetch_one(&self.db)
        .await?;

        Ok(row.into_favorite())
    }

    /// Remove an item from favorites
    /// Requirements: 7.2
    pub async fn remove_favorite(&self, item_type: FavoriteType, item_id: &str) -> Result<()> {
        let type_str = item_type.to_string();

        sqlx::query("DELETE FROM favorites WHERE item_type = ? AND item_id = ?")
            .bind(&type_str)
            .bind(item_id)
            .execute(&self.db)
            .await?;

        Ok(())
    }

    /// List all favorites
    /// Requirements: 7.2
    pub async fn list_favorites(&self) -> Result<Vec<Favorite>> {
        let rows = sqlx::query_as::<_, FavoriteRow>(
            "SELECT * FROM favorites ORDER BY created_at DESC"
        )
        .fetch_all(&self.db)
        .await?;

        Ok(rows.into_iter().map(|r| r.into_favorite()).collect())
    }

    /// List favorites by type
    pub async fn list_favorites_by_type(&self, item_type: FavoriteType) -> Result<Vec<Favorite>> {
        let type_str = item_type.to_string();

        let rows = sqlx::query_as::<_, FavoriteRow>(
            "SELECT * FROM favorites WHERE item_type = ? ORDER BY created_at DESC"
        )
        .bind(&type_str)
        .fetch_all(&self.db)
        .await?;

        Ok(rows.into_iter().map(|r| r.into_favorite()).collect())
    }

    /// Check if an item is favorited
    pub async fn is_favorite(&self, item_type: FavoriteType, item_id: &str) -> Result<bool> {
        let type_str = item_type.to_string();

        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM favorites WHERE item_type = ? AND item_id = ?"
        )
        .bind(&type_str)
        .bind(item_id)
        .fetch_one(&self.db)
        .await?;

        Ok(count > 0)
    }

    /// Log an activity
    /// Requirements: 7.4
    pub async fn log_activity(&self, input: CreateActivityInput) -> Result<ActivityLog> {
        let now = Utc::now();
        let id = Uuid::new_v4().to_string();

        sqlx::query(
            r#"
            INSERT INTO activity_log (id, action, item_type, item_id, details, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&input.action)
        .bind(&input.item_type)
        .bind(&input.item_id)
        .bind(&input.details)
        .bind(now.to_rfc3339())
        .execute(&self.db)
        .await?;

        Ok(ActivityLog {
            id,
            action: input.action,
            item_type: input.item_type,
            item_id: input.item_id,
            details: input.details,
            created_at: now,
        })
    }

    /// Get recent activity
    /// Requirements: 7.4
    pub async fn get_recent_activity(&self, limit: u32) -> Result<Vec<ActivityLog>> {
        let rows = sqlx::query_as::<_, ActivityLogRow>(
            "SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?"
        )
        .bind(limit as i64)
        .fetch_all(&self.db)
        .await?;

        Ok(rows.into_iter().map(|r| r.into_activity_log()).collect())
    }

    /// Clear old activity logs (keep last N entries)
    pub async fn cleanup_activity_log(&self, keep_count: u32) -> Result<u64> {
        let result = sqlx::query(
            r#"
            DELETE FROM activity_log 
            WHERE id NOT IN (
                SELECT id FROM activity_log 
                ORDER BY created_at DESC 
                LIMIT ?
            )
            "#,
        )
        .bind(keep_count as i64)
        .execute(&self.db)
        .await?;

        Ok(result.rows_affected())
    }
}

// Helper struct for database row mapping
#[derive(sqlx::FromRow)]
struct FavoriteRow {
    id: String,
    item_type: String,
    item_id: String,
    created_at: String,
}

impl FavoriteRow {
    fn into_favorite(self) -> Favorite {
        Favorite {
            id: self.id,
            item_type: self.item_type.parse().unwrap_or(FavoriteType::Server),
            item_id: self.item_id,
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
        }
    }
}

#[derive(sqlx::FromRow)]
struct ActivityLogRow {
    id: String,
    action: String,
    item_type: Option<String>,
    item_id: Option<String>,
    details: Option<String>,
    created_at: String,
}

impl ActivityLogRow {
    fn into_activity_log(self) -> ActivityLog {
        ActivityLog {
            id: self.id,
            action: self.action,
            item_type: self.item_type,
            item_id: self.item_id,
            details: self.details,
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
        }
    }
}
