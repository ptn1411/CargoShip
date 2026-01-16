use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Favorite item types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FavoriteType {
    Server,
    Script,
    Snippet,
}

impl std::fmt::Display for FavoriteType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FavoriteType::Server => write!(f, "server"),
            FavoriteType::Script => write!(f, "script"),
            FavoriteType::Snippet => write!(f, "snippet"),
        }
    }
}

impl std::str::FromStr for FavoriteType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "server" => Ok(FavoriteType::Server),
            "script" => Ok(FavoriteType::Script),
            "snippet" => Ok(FavoriteType::Snippet),
            _ => Err(format!("Invalid favorite type: {}", s)),
        }
    }
}

/// Favorite represents a user's favorited item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Favorite {
    pub id: String,
    pub item_type: FavoriteType,
    pub item_id: String,
    pub created_at: DateTime<Utc>,
}

/// Activity log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityLog {
    pub id: String,
    pub action: String,
    pub item_type: Option<String>,
    pub item_id: Option<String>,
    pub details: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Input for creating an activity log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateActivityInput {
    pub action: String,
    pub item_type: Option<String>,
    pub item_id: Option<String>,
    pub details: Option<String>,
}
