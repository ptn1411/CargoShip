use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// ServerGroup represents a logical grouping of servers for batch operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerGroup {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub server_ids: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Input for creating a new server group
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateGroupInput {
    pub name: String,
    pub description: Option<String>,
    #[serde(default)]
    pub server_ids: Vec<String>,
}

/// Input for updating an existing server group
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateGroupInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub server_ids: Option<Vec<String>>,
}
