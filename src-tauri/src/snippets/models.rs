use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Snippet represents a reusable command snippet
/// Requirements: 5.1
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snippet {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub command: String,
    pub category: String,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Input for creating a new snippet
/// Requirements: 5.1
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSnippetInput {
    pub name: String,
    pub description: Option<String>,
    pub command: String,
    pub category: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

/// Input for updating an existing snippet
/// Requirements: 5.1
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateSnippetInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub command: Option<String>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
}

/// Result of importing snippets
/// Requirements: 5.7
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

/// Export format for snippets (used for JSON export/import)
/// Requirements: 5.6, 5.7
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnippetExport {
    pub version: String,
    pub exported_at: DateTime<Utc>,
    pub snippets: Vec<SnippetExportItem>,
}

/// Individual snippet in export format (excludes auto-generated fields)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnippetExportItem {
    pub name: String,
    pub description: Option<String>,
    pub command: String,
    pub category: String,
    pub tags: Vec<String>,
}

impl From<&Snippet> for SnippetExportItem {
    fn from(snippet: &Snippet) -> Self {
        Self {
            name: snippet.name.clone(),
            description: snippet.description.clone(),
            command: snippet.command.clone(),
            category: snippet.category.clone(),
            tags: snippet.tags.clone(),
        }
    }
}
