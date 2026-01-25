use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub file_type: FileType,
    pub size: u64,
    pub permissions: String,
    pub modified_at: DateTime<Utc>,
}

/// File content returned when downloading a file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub size: u64,
    pub modified_at: i64,
    pub permissions: String,
    pub encoding: String,
}

/// Warning for large files
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LargeFileWarning {
    pub path: String,
    pub size: u64,
    pub threshold: u64,
}

/// Upload progress tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadProgress {
    pub file_name: String,
    pub bytes_uploaded: u64,
    pub total_bytes: u64,
    pub status: UploadStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum UploadStatus {
    Pending,
    Uploading,
    Completed,
    Failed(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FileType {
    File,
    Directory,
    Symlink,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Breadcrumb {
    pub name: String,
    pub path: String,
}

/// Convert a path to breadcrumb segments
pub fn path_to_breadcrumbs(path: &str) -> Vec<Breadcrumb> {
    let normalized = normalize_path(path);
    let mut breadcrumbs = vec![Breadcrumb {
        name: "/".to_string(),
        path: "/".to_string(),
    }];

    let mut current_path = String::new();
    for segment in normalized.split('/').filter(|s| !s.is_empty()) {
        current_path.push('/');
        current_path.push_str(segment);
        breadcrumbs.push(Breadcrumb {
            name: segment.to_string(),
            path: current_path.clone(),
        });
    }

    breadcrumbs
}

/// Normalize a file path (remove double slashes, resolve . and ..)
pub fn normalize_path(path: &str) -> String {
    let mut segments: Vec<&str> = Vec::new();

    for segment in path.split('/') {
        match segment {
            "" | "." => continue,
            ".." => {
                segments.pop();
            }
            s => segments.push(s),
        }
    }

    if segments.is_empty() {
        "/".to_string()
    } else {
        format!("/{}", segments.join("/"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_path() {
        assert_eq!(normalize_path("/home/user"), "/home/user");
        assert_eq!(normalize_path("/home//user"), "/home/user");
        assert_eq!(normalize_path("/home/./user"), "/home/user");
        assert_eq!(normalize_path("/home/user/../other"), "/home/other");
        assert_eq!(normalize_path("/"), "/");
        assert_eq!(normalize_path(""), "/");
    }

    #[test]
    fn test_normalize_path_edge_cases() {
        // Multiple consecutive slashes
        assert_eq!(normalize_path("///home///user///"), "/home/user");
        // Multiple parent references
        assert_eq!(normalize_path("/a/b/c/../../d"), "/a/d");
        // Parent reference at root
        assert_eq!(normalize_path("/a/../.."), "/");
        // Only dots
        assert_eq!(normalize_path("/./././"), "/");
        // Mixed
        assert_eq!(normalize_path("/a/./b/../c/./d"), "/a/c/d");
    }

    #[test]
    fn test_normalize_path_idempotence() {
        // Property 15: Path Normalization Idempotence
        let paths = vec![
            "/home/user",
            "/home//user",
            "/home/./user",
            "/home/user/../other",
            "/",
            "",
            "/a/b/c/../../d",
        ];

        for path in paths {
            let once = normalize_path(path);
            let twice = normalize_path(&once);
            assert_eq!(
                once, twice,
                "Normalizing '{}' twice should equal normalizing once",
                path
            );
        }
    }

    #[test]
    fn test_path_to_breadcrumbs() {
        let breadcrumbs = path_to_breadcrumbs("/home/user/docs");
        assert_eq!(breadcrumbs.len(), 4);
        assert_eq!(breadcrumbs[0].name, "/");
        assert_eq!(breadcrumbs[1].name, "home");
        assert_eq!(breadcrumbs[2].name, "user");
        assert_eq!(breadcrumbs[3].name, "docs");
        assert_eq!(breadcrumbs[3].path, "/home/user/docs");
    }

    #[test]
    fn test_path_to_breadcrumbs_root() {
        let breadcrumbs = path_to_breadcrumbs("/");
        assert_eq!(breadcrumbs.len(), 1);
        assert_eq!(breadcrumbs[0].name, "/");
        assert_eq!(breadcrumbs[0].path, "/");
    }

    #[test]
    fn test_path_to_breadcrumbs_empty() {
        let breadcrumbs = path_to_breadcrumbs("");
        assert_eq!(breadcrumbs.len(), 1);
        assert_eq!(breadcrumbs[0].name, "/");
        assert_eq!(breadcrumbs[0].path, "/");
    }

    #[test]
    fn test_path_to_breadcrumbs_roundtrip() {
        // Property 10: Path to Breadcrumb Conversion
        // Converting to breadcrumbs and joining segments should produce the original normalized path
        let paths = vec!["/home/user/docs", "/var/log", "/", "/a/b/c/d/e"];

        for path in paths {
            let normalized = normalize_path(path);
            let breadcrumbs = path_to_breadcrumbs(&normalized);

            // Join breadcrumb paths - the last breadcrumb's path should equal the normalized path
            let reconstructed = breadcrumbs
                .last()
                .map(|b| b.path.clone())
                .unwrap_or_else(|| "/".to_string());
            assert_eq!(
                reconstructed, normalized,
                "Breadcrumb roundtrip failed for '{}'",
                path
            );
        }
    }

    #[test]
    fn test_path_to_breadcrumbs_incremental_paths() {
        let breadcrumbs = path_to_breadcrumbs("/a/b/c");

        // Each breadcrumb should have the correct incremental path
        assert_eq!(breadcrumbs[0].path, "/");
        assert_eq!(breadcrumbs[1].path, "/a");
        assert_eq!(breadcrumbs[2].path, "/a/b");
        assert_eq!(breadcrumbs[3].path, "/a/b/c");
    }
}
