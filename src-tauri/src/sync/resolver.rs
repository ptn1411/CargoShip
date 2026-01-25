use super::engine::SyncEngine;
use super::models::*;
use crate::cache::CacheFileInput;
use crate::error::{AppError, Result};
use crate::server::Server;
use std::sync::Arc;

/// Handles file conflict detection and resolution
pub struct ConflictResolver {
    sync_engine: Arc<SyncEngine>,
}

impl ConflictResolver {
    /// Create a new ConflictResolver
    pub fn new(sync_engine: Arc<SyncEngine>) -> Self {
        Self { sync_engine }
    }

    /// Generate a diff between local cached content and remote content
    pub async fn get_diff(&self, server: &Server, remote_path: &str) -> Result<FileDiff> {
        // Get local cached content
        let local_content = self
            .sync_engine
            .cache_manager()
            .read_cached_content(&server.id, remote_path)
            .await?
            .map(|bytes| String::from_utf8_lossy(&bytes).to_string())
            .unwrap_or_default();

        // Get remote content
        let remote_file = self
            .sync_engine
            .file_manager()
            .download_file(server, remote_path)
            .await?;
        let remote_content = remote_file.content;

        // Generate diff
        let changes = generate_diff(&local_content, &remote_content);

        Ok(FileDiff {
            local_content,
            remote_content,
            changes,
        })
    }

    /// Resolve a conflict using the specified resolution strategy
    pub async fn resolve_conflict(
        &self,
        server: &Server,
        remote_path: &str,
        resolution: ConflictResolution,
    ) -> Result<()> {
        match resolution {
            ConflictResolution::KeepLocal => {
                // Upload local content to remote
                let local_content = self
                    .sync_engine
                    .cache_manager()
                    .read_cached_content(&server.id, remote_path)
                    .await?
                    .ok_or_else(|| {
                        AppError::FileOperationFailed(format!(
                            "No local cache found for: {}",
                            remote_path
                        ))
                    })?;

                let content_str = String::from_utf8_lossy(&local_content).to_string();
                self.sync_engine
                    .file_manager()
                    .save_file(server, remote_path, &content_str)
                    .await?;

                // Cache remains unchanged for KeepLocal
            }
            ConflictResolution::UseRemote => {
                // Download remote and update cache
                let remote_file = self
                    .sync_engine
                    .file_manager()
                    .download_file(server, remote_path)
                    .await?;

                // Update cache with remote content
                let cache_input = CacheFileInput {
                    server_id: server.id.clone(),
                    remote_path: remote_path.to_string(),
                    content: remote_file.content.as_bytes().to_vec(),
                    remote_modified_at: remote_file.modified_at,
                };
                self.sync_engine
                    .cache_manager()
                    .cache_file(cache_input)
                    .await?;
            }
            ConflictResolution::MergeContent(merged_content) => {
                // Save merged content to remote
                self.sync_engine
                    .file_manager()
                    .save_file(server, remote_path, &merged_content)
                    .await?;

                // Update cache with merged content
                let remote_time = self
                    .sync_engine
                    .get_remote_modified_time(server, remote_path)?;

                let cache_input = CacheFileInput {
                    server_id: server.id.clone(),
                    remote_path: remote_path.to_string(),
                    content: merged_content.as_bytes().to_vec(),
                    remote_modified_at: remote_time,
                };
                self.sync_engine
                    .cache_manager()
                    .cache_file(cache_input)
                    .await?;
            }
        }

        Ok(())
    }

    /// Get a reference to the sync engine
    pub fn sync_engine(&self) -> &Arc<SyncEngine> {
        &self.sync_engine
    }
}

/// Generate a line-by-line diff between two strings
/// Uses a simple LCS-based diff algorithm
pub fn generate_diff(local: &str, remote: &str) -> Vec<DiffChange> {
    let local_lines: Vec<&str> = local.lines().collect();
    let remote_lines: Vec<&str> = remote.lines().collect();

    // Use Myers diff algorithm (simplified version)
    let mut changes = Vec::new();
    let lcs = longest_common_subsequence(&local_lines, &remote_lines);

    let mut local_idx = 0;
    let mut remote_idx = 0;
    let mut lcs_idx = 0;

    while local_idx < local_lines.len() || remote_idx < remote_lines.len() {
        if lcs_idx < lcs.len() {
            // Process lines before the next common line
            while local_idx < local_lines.len() && local_lines[local_idx] != lcs[lcs_idx] {
                changes.push(DiffChange {
                    change_type: DiffChangeType::Removed,
                    old_line: Some(local_idx + 1),
                    new_line: None,
                    content: local_lines[local_idx].to_string(),
                });
                local_idx += 1;
            }

            while remote_idx < remote_lines.len() && remote_lines[remote_idx] != lcs[lcs_idx] {
                changes.push(DiffChange {
                    change_type: DiffChangeType::Added,
                    old_line: None,
                    new_line: Some(remote_idx + 1),
                    content: remote_lines[remote_idx].to_string(),
                });
                remote_idx += 1;
            }

            // Add the common line
            if local_idx < local_lines.len() && remote_idx < remote_lines.len() {
                changes.push(DiffChange {
                    change_type: DiffChangeType::Unchanged,
                    old_line: Some(local_idx + 1),
                    new_line: Some(remote_idx + 1),
                    content: local_lines[local_idx].to_string(),
                });
                local_idx += 1;
                remote_idx += 1;
                lcs_idx += 1;
            }
        } else {
            // No more common lines, process remaining
            while local_idx < local_lines.len() {
                changes.push(DiffChange {
                    change_type: DiffChangeType::Removed,
                    old_line: Some(local_idx + 1),
                    new_line: None,
                    content: local_lines[local_idx].to_string(),
                });
                local_idx += 1;
            }

            while remote_idx < remote_lines.len() {
                changes.push(DiffChange {
                    change_type: DiffChangeType::Added,
                    old_line: None,
                    new_line: Some(remote_idx + 1),
                    content: remote_lines[remote_idx].to_string(),
                });
                remote_idx += 1;
            }
        }
    }

    changes
}

/// Find the longest common subsequence of two string slices
fn longest_common_subsequence<'a>(a: &[&'a str], b: &[&'a str]) -> Vec<&'a str> {
    let m = a.len();
    let n = b.len();

    if m == 0 || n == 0 {
        return Vec::new();
    }

    // Build LCS table
    let mut dp = vec![vec![0usize; n + 1]; m + 1];

    for i in 1..=m {
        for j in 1..=n {
            if a[i - 1] == b[j - 1] {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = dp[i - 1][j].max(dp[i][j - 1]);
            }
        }
    }

    // Backtrack to find LCS
    let mut lcs = Vec::new();
    let mut i = m;
    let mut j = n;

    while i > 0 && j > 0 {
        if a[i - 1] == b[j - 1] {
            lcs.push(a[i - 1]);
            i -= 1;
            j -= 1;
        } else if dp[i - 1][j] > dp[i][j - 1] {
            i -= 1;
        } else {
            j -= 1;
        }
    }

    lcs.reverse();
    lcs
}

/// Apply diff changes to local content to produce remote content
/// This is useful for verifying diff correctness
pub fn apply_diff(_local: &str, changes: &[DiffChange]) -> String {
    let mut result = Vec::new();

    for change in changes {
        match change.change_type {
            DiffChangeType::Unchanged | DiffChangeType::Added => {
                result.push(change.content.as_str());
            }
            DiffChangeType::Removed => {
                // Skip removed lines
            }
        }
    }

    result.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_diff_no_changes() {
        let content = "line1\nline2\nline3";
        let changes = generate_diff(content, content);

        assert_eq!(changes.len(), 3);
        for change in &changes {
            assert_eq!(change.change_type, DiffChangeType::Unchanged);
        }
    }

    #[test]
    fn test_generate_diff_added_lines() {
        let local = "line1\nline3";
        let remote = "line1\nline2\nline3";
        let changes = generate_diff(local, remote);

        let added: Vec<_> = changes
            .iter()
            .filter(|c| c.change_type == DiffChangeType::Added)
            .collect();

        assert_eq!(added.len(), 1);
        assert_eq!(added[0].content, "line2");
    }

    #[test]
    fn test_generate_diff_removed_lines() {
        let local = "line1\nline2\nline3";
        let remote = "line1\nline3";
        let changes = generate_diff(local, remote);

        let removed: Vec<_> = changes
            .iter()
            .filter(|c| c.change_type == DiffChangeType::Removed)
            .collect();

        assert_eq!(removed.len(), 1);
        assert_eq!(removed[0].content, "line2");
    }

    #[test]
    fn test_generate_diff_modified_lines() {
        let local = "line1\nold_line\nline3";
        let remote = "line1\nnew_line\nline3";
        let changes = generate_diff(local, remote);

        let removed: Vec<_> = changes
            .iter()
            .filter(|c| c.change_type == DiffChangeType::Removed)
            .collect();
        let added: Vec<_> = changes
            .iter()
            .filter(|c| c.change_type == DiffChangeType::Added)
            .collect();

        assert_eq!(removed.len(), 1);
        assert_eq!(removed[0].content, "old_line");
        assert_eq!(added.len(), 1);
        assert_eq!(added[0].content, "new_line");
    }

    #[test]
    fn test_apply_diff_roundtrip() {
        let local = "line1\nline2\nline3";
        let remote = "line1\nnew_line\nline3\nline4";

        let changes = generate_diff(local, remote);
        let reconstructed = apply_diff(local, &changes);

        assert_eq!(reconstructed, remote);
    }

    #[test]
    fn test_apply_diff_empty_to_content() {
        let local = "";
        let remote = "line1\nline2";

        let changes = generate_diff(local, remote);
        let reconstructed = apply_diff(local, &changes);

        assert_eq!(reconstructed, remote);
    }

    #[test]
    fn test_apply_diff_content_to_empty() {
        let local = "line1\nline2";
        let remote = "";

        let changes = generate_diff(local, remote);
        let reconstructed = apply_diff(local, &changes);

        assert_eq!(reconstructed, remote);
    }

    #[test]
    fn test_longest_common_subsequence() {
        let a = vec!["a", "b", "c", "d"];
        let b = vec!["a", "c", "d"];
        let lcs = longest_common_subsequence(&a, &b);

        assert_eq!(lcs, vec!["a", "c", "d"]);
    }

    #[test]
    fn test_longest_common_subsequence_empty() {
        let a: Vec<&str> = vec![];
        let b = vec!["a", "b"];
        let lcs = longest_common_subsequence(&a, &b);

        assert!(lcs.is_empty());
    }

    #[test]
    fn test_diff_change_serialization() {
        let change = DiffChange {
            change_type: DiffChangeType::Added,
            old_line: None,
            new_line: Some(5),
            content: "new content".to_string(),
        };

        let json = serde_json::to_string(&change).unwrap();
        assert!(json.contains("added"));
        assert!(json.contains("new content"));
    }
}
