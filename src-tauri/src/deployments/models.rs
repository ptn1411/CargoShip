use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Status of a deployment
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DeploymentStatus {
    Pending,
    Running,
    Success,
    Failed,
    Partial,
    Cancelled,
    RolledBack,
    RollbackFailed,
}

impl std::fmt::Display for DeploymentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DeploymentStatus::Pending => write!(f, "pending"),
            DeploymentStatus::Running => write!(f, "running"),
            DeploymentStatus::Success => write!(f, "success"),
            DeploymentStatus::Failed => write!(f, "failed"),
            DeploymentStatus::Partial => write!(f, "partial"),
            DeploymentStatus::Cancelled => write!(f, "cancelled"),
            DeploymentStatus::RolledBack => write!(f, "rolled_back"),
            DeploymentStatus::RollbackFailed => write!(f, "rollback_failed"),
        }
    }
}

impl std::str::FromStr for DeploymentStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "pending" => Ok(DeploymentStatus::Pending),
            "running" => Ok(DeploymentStatus::Running),
            "success" => Ok(DeploymentStatus::Success),
            "failed" => Ok(DeploymentStatus::Failed),
            "partial" => Ok(DeploymentStatus::Partial),
            "cancelled" => Ok(DeploymentStatus::Cancelled),
            "rolled_back" => Ok(DeploymentStatus::RolledBack),
            "rollback_failed" => Ok(DeploymentStatus::RollbackFailed),
            _ => Err(format!("Invalid deployment status: {}", s)),
        }
    }
}

/// Status of a deployment step
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum StepStatus {
    Pending,
    Running,
    Success,
    Failed,
    Skipped,
}

impl std::fmt::Display for StepStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StepStatus::Pending => write!(f, "pending"),
            StepStatus::Running => write!(f, "running"),
            StepStatus::Success => write!(f, "success"),
            StepStatus::Failed => write!(f, "failed"),
            StepStatus::Skipped => write!(f, "skipped"),
        }
    }
}

impl std::str::FromStr for StepStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "pending" => Ok(StepStatus::Pending),
            "running" => Ok(StepStatus::Running),
            "success" => Ok(StepStatus::Success),
            "failed" => Ok(StepStatus::Failed),
            "skipped" => Ok(StepStatus::Skipped),
            _ => Err(format!("Invalid step status: {}", s)),
        }
    }
}

/// A deployment record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Deployment {
    pub id: String,
    pub script_id: String,
    pub script_name: String,
    pub server_ids: Vec<String>,
    pub variables: HashMap<String, String>,
    pub status: DeploymentStatus,
    pub logs: Vec<DeploymentLog>,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub duration_ms: Option<u64>,
    pub triggered_by: String,
    pub rollback_of: Option<String>,
}

impl Deployment {
    /// Create a new deployment with initial status
    pub fn new(
        script_id: String,
        script_name: String,
        server_ids: Vec<String>,
        variables: HashMap<String, String>,
        triggered_by: String,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            script_id,
            script_name,
            server_ids,
            variables,
            status: DeploymentStatus::Running,
            logs: Vec::new(),
            started_at: Utc::now(),
            completed_at: None,
            duration_ms: None,
            triggered_by,
            rollback_of: None,
        }
    }
}

/// A log entry for a deployment step
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentLog {
    pub id: String,
    pub deployment_id: String,
    pub step_id: String,
    pub step_name: String,
    pub server_id: String,
    pub server_name: String,
    pub output: String,
    pub exit_code: Option<i32>,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub duration_ms: Option<u64>,
    pub status: StepStatus,
}

impl DeploymentLog {
    /// Create a new deployment log entry
    pub fn new(
        deployment_id: String,
        step_id: String,
        step_name: String,
        server_id: String,
        server_name: String,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            deployment_id,
            step_id,
            step_name,
            server_id,
            server_name,
            output: String::new(),
            exit_code: None,
            started_at: Utc::now(),
            completed_at: None,
            duration_ms: None,
            status: StepStatus::Running,
        }
    }
}

/// Result of a step execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepResult {
    pub exit_code: i32,
    pub output: String,
    pub duration_ms: u64,
}

/// Filters for querying deployments
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DeploymentFilters {
    pub server_id: Option<String>,
    pub script_id: Option<String>,
    pub status: Option<DeploymentStatus>,
    pub from_date: Option<DateTime<Utc>>,
    pub to_date: Option<DateTime<Utc>>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

/// Export format for deployment logs
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportFormat {
    Txt,
    Json,
}

impl std::str::FromStr for ExportFormat {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "txt" | "text" => Ok(ExportFormat::Txt),
            "json" => Ok(ExportFormat::Json),
            _ => Err(format!("Invalid export format: {}", s)),
        }
    }
}
