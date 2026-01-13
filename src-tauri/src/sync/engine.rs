use crate::cache::CacheManager;
use crate::error::{AppError, Result};
use crate::files::FileManager;
use crate::server::Server;
use super::models::*;
use std::sync::Arc;

/// Manages synchronization between local cache and remote files
pub struct SyncEngine {
    file_manager: Arc<FileManager>,
    cache_manager: Arc<CacheManager>,
}

impl SyncEngine {
    /// Create a new SyncEngine
    pub fn new(file_manager: Arc<FileManager>, cache_manager: Arc<CacheManager>) -> Self {
        Self {
            file_manager,
            cache_manager,
        }
    }

    /// Check for conflicts between local cache and remote file
    /// 
    /// Compares the remote file's modification time with the cached modification time.
    /// Returns appropriate ConflictStatus based on the comparison.
    pub async fn check_for_conflicts(
        &self,
        server: &Server,
        remote_path: &str,
    ) -> Result<ConflictStatus> {
        // Get cached file metadata
        let cached = self.cache_manager
            .get_cached_file(&server.id, remote_path)
            .await?;

        // Try to get remote file modification time
        let remote_time_result = self.file_manager.get_remote_modified_time(server, remote_path);

        match (cached, remote_time_result) {
            // Both exist - compare modification times
            (Some(cached_file), Ok(remote_time)) => {
                let local_time = cached_file.remote_modified_at;
                
                if remote_time > local_time {
                    // Remote file has been modified since we cached it
                    Ok(ConflictStatus::RemoteModified {
                        remote_time,
                        local_time,
                    })
                } else {
                    // No conflict - remote hasn't changed
                    Ok(ConflictStatus::NoConflict)
                }
            }
            // Only local cache exists (remote file was deleted or doesn't exist)
            (Some(_), Err(_)) => {
                Ok(ConflictStatus::LocalOnly)
            }
            // Only remote exists (not cached locally)
            (None, Ok(_)) => {
                Ok(ConflictStatus::RemoteOnly)
            }
            // Neither exists - this shouldn't happen in normal usage
            (None, Err(e)) => {
                Err(e)
            }
        }
    }

    /// Sync a file using the specified strategy
    pub async fn sync_file(
        &self,
        server: &Server,
        remote_path: &str,
        strategy: SyncStrategy,
    ) -> Result<SyncResult> {
        match strategy {
            SyncStrategy::UseLocal => {
                // Read local cached content and upload to remote
                let local_content = self.cache_manager
                    .read_cached_content(&server.id, remote_path)
                    .await?
                    .ok_or_else(|| AppError::FileOperationFailed(
                        format!("No local cache found for: {}", remote_path)
                    ))?;

                let content_str = String::from_utf8_lossy(&local_content).to_string();
                self.file_manager.save_file(server, remote_path, &content_str).await?;

                Ok(SyncResult {
                    success: true,
                    strategy: SyncStrategy::UseLocal,
                    message: format!("Uploaded local version to remote: {}", remote_path),
                })
            }
            SyncStrategy::UseRemote => {
                // Download remote file and update cache
                self.file_manager.download_file(server, remote_path).await?;

                Ok(SyncResult {
                    success: true,
                    strategy: SyncStrategy::UseRemote,
                    message: format!("Downloaded remote version: {}", remote_path),
                })
            }
            SyncStrategy::Manual => {
                Ok(SyncResult {
                    success: false,
                    strategy: SyncStrategy::Manual,
                    message: "Manual merge required".to_string(),
                })
            }
        }
    }

    /// Create a backup of the remote file
    /// Returns the backup path
    pub async fn create_backup(
        &self,
        server: &Server,
        remote_path: &str,
    ) -> Result<String> {
        let backup_path = format!("{}.backup.{}", remote_path, chrono::Utc::now().timestamp());
        
        // Download current remote content
        let content = self.file_manager.download_file(server, remote_path).await?;
        
        // Save to backup path
        self.file_manager.save_file(server, &backup_path, &content.content).await?;
        
        Ok(backup_path)
    }

    /// Get the remote file modification time
    pub fn get_remote_modified_time(&self, server: &Server, remote_path: &str) -> Result<i64> {
        self.file_manager.get_remote_modified_time(server, remote_path)
    }

    /// Get a reference to the cache manager
    pub fn cache_manager(&self) -> &Arc<CacheManager> {
        &self.cache_manager
    }

    /// Get a reference to the file manager
    pub fn file_manager(&self) -> &Arc<FileManager> {
        &self.file_manager
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_conflict_status_serialization() {
        // Test NoConflict
        let status = ConflictStatus::NoConflict;
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("no_conflict"));

        // Test RemoteModified
        let status = ConflictStatus::RemoteModified {
            remote_time: 1704067200,
            local_time: 1704063600,
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("remote_modified"));
        assert!(json.contains("1704067200"));
        assert!(json.contains("1704063600"));
    }

    #[test]
    fn test_sync_strategy_serialization() {
        let strategy = SyncStrategy::UseLocal;
        let json = serde_json::to_string(&strategy).unwrap();
        assert_eq!(json, "\"use_local\"");

        let strategy = SyncStrategy::UseRemote;
        let json = serde_json::to_string(&strategy).unwrap();
        assert_eq!(json, "\"use_remote\"");
    }
}
