use serde::{Deserialize, Serialize};

/// Status of conflict detection between local cache and remote file
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ConflictStatus {
    /// No conflict - local cache is up to date with remote
    NoConflict,
    /// Remote file has been modified since local cache was created
    RemoteModified {
        remote_time: i64,
        local_time: i64,
    },
    /// File exists only in local cache (not on remote)
    LocalOnly,
    /// File exists only on remote (not in local cache)
    RemoteOnly,
}

/// Strategy for syncing files
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SyncStrategy {
    /// Use local version, overwrite remote
    UseLocal,
    /// Use remote version, overwrite local cache
    UseRemote,
    /// Manual merge required
    Manual,
}

/// Result of a sync operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    /// Whether the sync was successful
    pub success: bool,
    /// Strategy that was applied
    pub strategy: SyncStrategy,
    /// Message describing the result
    pub message: String,
}

/// Resolution choice for conflicts
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ConflictResolution {
    /// Keep local version
    KeepLocal,
    /// Use remote version
    UseRemote,
    /// Merge with custom content
    MergeContent(String),
}

/// Represents a diff between two file versions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    /// Local file content
    pub local_content: String,
    /// Remote file content
    pub remote_content: String,
    /// List of changes between versions
    pub changes: Vec<DiffChange>,
}

/// A single change in a diff
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DiffChange {
    /// Type of change
    pub change_type: DiffChangeType,
    /// Line number in the original (local) file (1-indexed)
    pub old_line: Option<usize>,
    /// Line number in the new (remote) file (1-indexed)
    pub new_line: Option<usize>,
    /// Content of the line
    pub content: String,
}

/// Type of diff change
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DiffChangeType {
    /// Line was added in remote
    Added,
    /// Line was removed in remote
    Removed,
    /// Line is unchanged
    Unchanged,
}
