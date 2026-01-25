use crate::error::{AppError, Result};
use super::models::{CachedFile, CacheFileInput};
use sha2::{Sha256, Digest};
use sqlx::SqlitePool;
use std::path::PathBuf;
use chrono::Utc;
use uuid::Uuid;

/// Manages local file cache for remote files
pub struct CacheManager {
    cache_dir: PathBuf,
    db: SqlitePool,
}

impl CacheManager {
    /// Create a new CacheManager
    pub fn new(cache_dir: PathBuf, db: SqlitePool) -> Self {
        Self { cache_dir, db }
    }

    /// Initialize the cache directory and database schema
    pub async fn init(&self) -> Result<()> {
        // Create cache directory if it doesn't exist
        std::fs::create_dir_all(&self.cache_dir)
            .map_err(|e| AppError::FileOperationFailed(format!("Failed to create cache directory: {}", e)))?;

        // Run migrations for file_cache table
        self.run_migrations().await?;

        Ok(())
    }

    /// Run database migrations for the cache table
    async fn run_migrations(&self) -> Result<()> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS file_cache (
                id TEXT PRIMARY KEY,
                server_id TEXT NOT NULL,
                remote_path TEXT NOT NULL,
                local_path TEXT NOT NULL,
                remote_modified_at INTEGER NOT NULL,
                local_modified_at INTEGER NOT NULL,
                size INTEGER NOT NULL,
                checksum TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
                UNIQUE(server_id, remote_path)
            )
            "#,
        )
        .execute(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create file_cache table: {}", e)))?;

        // Create index for faster lookups
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_file_cache_server ON file_cache(server_id)")
            .execute(&self.db)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to create index: {}", e)))?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_file_cache_path ON file_cache(server_id, remote_path)")
            .execute(&self.db)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to create index: {}", e)))?;

        Ok(())
    }


    /// Get a cached file by server ID and remote path
    pub async fn get_cached_file(&self, server_id: &str, remote_path: &str) -> Result<Option<CachedFile>> {
        let row = sqlx::query_as::<_, CachedFileRow>(
            r#"
            SELECT id, server_id, remote_path, local_path, remote_modified_at, 
                   local_modified_at, size, checksum, created_at
            FROM file_cache
            WHERE server_id = ? AND remote_path = ?
            "#,
        )
        .bind(server_id)
        .bind(remote_path)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get cached file: {}", e)))?;

        Ok(row.map(|r| r.into()))
    }

    /// Cache a file locally with metadata
    pub async fn cache_file(&self, input: CacheFileInput) -> Result<PathBuf> {
        let CacheFileInput {
            server_id,
            remote_path,
            content,
            remote_modified_at,
        } = input;

        // Generate unique local path
        let local_path = self.generate_local_path(&server_id, &remote_path);

        // Ensure parent directory exists
        if let Some(parent) = local_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AppError::FileOperationFailed(format!("Failed to create cache subdirectory: {}", e)))?;
        }

        // Write content to local file
        std::fs::write(&local_path, &content)
            .map_err(|e| AppError::FileOperationFailed(format!("Failed to write cache file: {}", e)))?;

        // Calculate checksum
        let checksum = calculate_checksum(&content);
        let size = content.len() as u64;
        let now = Utc::now();
        let local_modified_at = now.timestamp();
        let created_at = now.to_rfc3339();
        let id = Uuid::new_v4().to_string();

        // Insert or update cache entry
        sqlx::query(
            r#"
            INSERT INTO file_cache (id, server_id, remote_path, local_path, remote_modified_at, 
                                    local_modified_at, size, checksum, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(server_id, remote_path) DO UPDATE SET
                local_path = excluded.local_path,
                remote_modified_at = excluded.remote_modified_at,
                local_modified_at = excluded.local_modified_at,
                size = excluded.size,
                checksum = excluded.checksum
            "#,
        )
        .bind(&id)
        .bind(&server_id)
        .bind(&remote_path)
        .bind(local_path.to_string_lossy().to_string())
        .bind(remote_modified_at)
        .bind(local_modified_at)
        .bind(size as i64)
        .bind(&checksum)
        .bind(&created_at)
        .execute(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to insert cache entry: {}", e)))?;

        Ok(local_path)
    }


    /// Update cache content for an existing cached file
    pub async fn update_cache(&self, server_id: &str, remote_path: &str, content: &[u8]) -> Result<()> {
        // Get existing cache entry
        let cached = self.get_cached_file(server_id, remote_path).await?
            .ok_or_else(|| AppError::FileOperationFailed(format!("Cache entry not found for: {}", remote_path)))?;

        // Write new content to local file
        std::fs::write(&cached.local_path, content)
            .map_err(|e| AppError::FileOperationFailed(format!("Failed to update cache file: {}", e)))?;

        // Calculate new checksum
        let checksum = calculate_checksum(content);
        let size = content.len() as u64;
        let local_modified_at = Utc::now().timestamp();

        // Update cache entry
        sqlx::query(
            r#"
            UPDATE file_cache
            SET local_modified_at = ?, size = ?, checksum = ?
            WHERE server_id = ? AND remote_path = ?
            "#,
        )
        .bind(local_modified_at)
        .bind(size as i64)
        .bind(&checksum)
        .bind(server_id)
        .bind(remote_path)
        .execute(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to update cache entry: {}", e)))?;

        Ok(())
    }

    /// Invalidate (remove) a cache entry
    pub async fn invalidate_cache(&self, server_id: &str, remote_path: &str) -> Result<()> {
        // Get existing cache entry to delete local file
        if let Some(cached) = self.get_cached_file(server_id, remote_path).await? {
            // Delete local file if it exists
            if cached.local_path.exists() {
                std::fs::remove_file(&cached.local_path)
                    .map_err(|e| AppError::FileOperationFailed(format!("Failed to delete cache file: {}", e)))?;
            }
        }

        // Delete cache entry from database
        sqlx::query(
            r#"
            DELETE FROM file_cache
            WHERE server_id = ? AND remote_path = ?
            "#,
        )
        .bind(server_id)
        .bind(remote_path)
        .execute(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to delete cache entry: {}", e)))?;

        Ok(())
    }

    /// Clear all cache entries for a server
    pub async fn clear_server_cache(&self, server_id: &str) -> Result<()> {
        // Get all cache entries for the server
        let rows = sqlx::query_as::<_, CachedFileRow>(
            r#"
            SELECT id, server_id, remote_path, local_path, remote_modified_at, 
                   local_modified_at, size, checksum, created_at
            FROM file_cache
            WHERE server_id = ?
            "#,
        )
        .bind(server_id)
        .fetch_all(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get cache entries: {}", e)))?;

        // Delete local files
        for row in rows {
            let local_path = PathBuf::from(&row.local_path);
            if local_path.exists() {
                let _ = std::fs::remove_file(&local_path);
            }
        }

        // Delete all cache entries for the server
        sqlx::query(
            r#"
            DELETE FROM file_cache
            WHERE server_id = ?
            "#,
        )
        .bind(server_id)
        .execute(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to clear server cache: {}", e)))?;

        Ok(())
    }


    /// Read cached file content
    pub async fn read_cached_content(&self, server_id: &str, remote_path: &str) -> Result<Option<Vec<u8>>> {
        let cached = self.get_cached_file(server_id, remote_path).await?;
        
        match cached {
            Some(c) if c.local_path.exists() => {
                let content = std::fs::read(&c.local_path)
                    .map_err(|e| AppError::FileOperationFailed(format!("Failed to read cache file: {}", e)))?;
                Ok(Some(content))
            }
            _ => Ok(None),
        }
    }

    /// Generate a unique local path for caching a file
    fn generate_local_path(&self, server_id: &str, remote_path: &str) -> PathBuf {
        // Create a safe filename from the remote path
        let safe_path = remote_path
            .replace('/', "_")
            .replace('\\', "_")
            .trim_start_matches('_')
            .to_string();
        
        // Use server_id as subdirectory
        self.cache_dir
            .join(server_id)
            .join(safe_path)
    }

    /// Get the cache directory path
    pub fn cache_dir(&self) -> &PathBuf {
        &self.cache_dir
    }
}

/// Calculate SHA-256 checksum of content
fn calculate_checksum(content: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content);
    let result = hasher.finalize();
    hex::encode(result)
}

/// Internal row type for database queries
#[derive(sqlx::FromRow)]
struct CachedFileRow {
    id: String,
    server_id: String,
    remote_path: String,
    local_path: String,
    remote_modified_at: i64,
    local_modified_at: i64,
    size: i64,
    checksum: String,
    created_at: String,
}

impl From<CachedFileRow> for CachedFile {
    fn from(row: CachedFileRow) -> Self {
        CachedFile {
            id: row.id,
            server_id: row.server_id,
            remote_path: row.remote_path,
            local_path: PathBuf::from(row.local_path),
            remote_modified_at: row.remote_modified_at,
            local_modified_at: row.local_modified_at,
            size: row.size as u64,
            checksum: row.checksum,
            created_at: row.created_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    async fn setup_test_db() -> (SqlitePool, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let db_url = format!("sqlite:{}?mode=rwc", db_path.display());
        
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&db_url)
            .await
            .unwrap();

        // Create servers table for foreign key
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS servers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 22,
                username TEXT NOT NULL,
                auth_method TEXT NOT NULL,
                tags TEXT DEFAULT '[]',
                environment TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_connected TEXT
            )
            "#,
        )
        .execute(&pool)
        .await
        .unwrap();

        // Insert a test server
        sqlx::query(
            r#"
            INSERT INTO servers (id, name, host, port, username, auth_method, environment, created_at, updated_at)
            VALUES ('test-server', 'Test Server', 'localhost', 22, 'user', 'password', 'dev', '2024-01-01', '2024-01-01')
            "#,
        )
        .execute(&pool)
        .await
        .unwrap();

        (pool, temp_dir)
    }

    #[tokio::test]
    async fn test_cache_file_and_retrieve() {
        let (pool, temp_dir) = setup_test_db().await;
        let cache_dir = temp_dir.path().join("cache");
        let manager = CacheManager::new(cache_dir, pool);
        manager.init().await.unwrap();

        let input = CacheFileInput {
            server_id: "test-server".to_string(),
            remote_path: "/etc/nginx/nginx.conf".to_string(),
            content: b"server { listen 80; }".to_vec(),
            remote_modified_at: 1704067200,
        };

        // Cache the file
        let local_path = manager.cache_file(input.clone()).await.unwrap();
        assert!(local_path.exists());

        // Retrieve cached file
        let cached = manager.get_cached_file("test-server", "/etc/nginx/nginx.conf").await.unwrap();
        assert!(cached.is_some());
        
        let cached = cached.unwrap();
        assert_eq!(cached.server_id, "test-server");
        assert_eq!(cached.remote_path, "/etc/nginx/nginx.conf");
        assert_eq!(cached.remote_modified_at, 1704067200);
        assert_eq!(cached.size, 21);
    }

    #[tokio::test]
    async fn test_invalidate_cache() {
        let (pool, temp_dir) = setup_test_db().await;
        let cache_dir = temp_dir.path().join("cache");
        let manager = CacheManager::new(cache_dir, pool);
        manager.init().await.unwrap();

        let input = CacheFileInput {
            server_id: "test-server".to_string(),
            remote_path: "/tmp/test.txt".to_string(),
            content: b"test content".to_vec(),
            remote_modified_at: 1704067200,
        };

        // Cache the file
        let local_path = manager.cache_file(input).await.unwrap();
        assert!(local_path.exists());

        // Invalidate cache
        manager.invalidate_cache("test-server", "/tmp/test.txt").await.unwrap();

        // Verify file is deleted
        assert!(!local_path.exists());

        // Verify cache entry is removed
        let cached = manager.get_cached_file("test-server", "/tmp/test.txt").await.unwrap();
        assert!(cached.is_none());
    }

    #[tokio::test]
    async fn test_update_cache() {
        let (pool, temp_dir) = setup_test_db().await;
        let cache_dir = temp_dir.path().join("cache");
        let manager = CacheManager::new(cache_dir, pool);
        manager.init().await.unwrap();

        let input = CacheFileInput {
            server_id: "test-server".to_string(),
            remote_path: "/tmp/update.txt".to_string(),
            content: b"original content".to_vec(),
            remote_modified_at: 1704067200,
        };

        // Cache the file
        manager.cache_file(input).await.unwrap();

        // Update cache
        let new_content = b"updated content";
        manager.update_cache("test-server", "/tmp/update.txt", new_content).await.unwrap();

        // Verify content is updated
        let content = manager.read_cached_content("test-server", "/tmp/update.txt").await.unwrap();
        assert_eq!(content, Some(new_content.to_vec()));

        // Verify metadata is updated
        let cached = manager.get_cached_file("test-server", "/tmp/update.txt").await.unwrap().unwrap();
        assert_eq!(cached.size, new_content.len() as u64);
    }

    #[tokio::test]
    async fn test_clear_server_cache() {
        let (pool, temp_dir) = setup_test_db().await;
        let cache_dir = temp_dir.path().join("cache");
        let manager = CacheManager::new(cache_dir, pool);
        manager.init().await.unwrap();

        // Cache multiple files
        for i in 0..3 {
            let input = CacheFileInput {
                server_id: "test-server".to_string(),
                remote_path: format!("/tmp/file{}.txt", i),
                content: format!("content {}", i).into_bytes(),
                remote_modified_at: 1704067200,
            };
            manager.cache_file(input).await.unwrap();
        }

        // Clear server cache
        manager.clear_server_cache("test-server").await.unwrap();

        // Verify all entries are removed
        for i in 0..3 {
            let cached = manager.get_cached_file("test-server", &format!("/tmp/file{}.txt", i)).await.unwrap();
            assert!(cached.is_none());
        }
    }
}
