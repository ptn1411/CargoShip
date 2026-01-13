use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Represents a cached file with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedFile {
    /// Unique identifier for the cache entry
    pub id: String,
    /// Server ID this file belongs to
    pub server_id: String,
    /// Remote path on the server
    pub remote_path: String,
    /// Local path where the file is cached
    pub local_path: PathBuf,
    /// Remote file modification timestamp (Unix timestamp)
    pub remote_modified_at: i64,
    /// Local cache modification timestamp (Unix timestamp)
    pub local_modified_at: i64,
    /// File size in bytes
    pub size: u64,
    /// SHA-256 checksum of the file content
    pub checksum: String,
    /// When the cache entry was created
    pub created_at: String,
}

/// Input for caching a file
#[derive(Debug, Clone)]
pub struct CacheFileInput {
    pub server_id: String,
    pub remote_path: String,
    pub content: Vec<u8>,
    pub remote_modified_at: i64,
}
