use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Server metrics collected via SSH commands
/// Requirements: 4.2
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerMetrics {
    pub cpu_percent: f32,
    pub memory_used: u64,
    pub memory_total: u64,
    pub disk_used: u64,
    pub disk_total: u64,
    pub load_average: [f32; 3],
    pub uptime_seconds: u64,
    pub collected_at: DateTime<Utc>,
}

/// Server status overview for dashboard
/// Requirements: 4.1
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStatus {
    pub server_id: String,
    pub server_name: String,
    pub online: bool,
    pub metrics: Option<ServerMetrics>,
    pub last_checked: DateTime<Utc>,
}

/// Metric type for alerts and history
/// Requirements: 4.3, 4.5
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MetricType {
    CpuUsage,
    MemoryUsage,
    DiskUsage,
}

impl std::fmt::Display for MetricType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MetricType::CpuUsage => write!(f, "cpu_usage"),
            MetricType::MemoryUsage => write!(f, "memory_usage"),
            MetricType::DiskUsage => write!(f, "disk_usage"),
        }
    }
}

impl std::str::FromStr for MetricType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "cpu_usage" | "cpu" => Ok(MetricType::CpuUsage),
            "memory_usage" | "memory" | "ram" => Ok(MetricType::MemoryUsage),
            "disk_usage" | "disk" => Ok(MetricType::DiskUsage),
            _ => Err(format!("Unknown metric type: {}", s)),
        }
    }
}

/// Alert condition for threshold evaluation
/// Requirements: 4.3
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AlertCondition {
    GreaterThan,
    LessThan,
    Equals,
}

impl std::fmt::Display for AlertCondition {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AlertCondition::GreaterThan => write!(f, "greater_than"),
            AlertCondition::LessThan => write!(f, "less_than"),
            AlertCondition::Equals => write!(f, "equals"),
        }
    }
}

impl std::str::FromStr for AlertCondition {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "greater_than" | "gt" | ">" => Ok(AlertCondition::GreaterThan),
            "less_than" | "lt" | "<" => Ok(AlertCondition::LessThan),
            "equals" | "eq" | "=" => Ok(AlertCondition::Equals),
            _ => Err(format!("Unknown alert condition: {}", s)),
        }
    }
}


/// Alert configuration
/// Requirements: 4.3, 4.6
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertConfig {
    pub id: String,
    pub server_id: Option<String>, // None = all servers
    pub metric: MetricType,
    pub condition: AlertCondition,
    pub threshold: f32,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
}

/// Triggered alert
/// Requirements: 4.6
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alert {
    pub alert_config_id: String,
    pub server_id: String,
    pub server_name: String,
    pub metric: MetricType,
    pub condition: AlertCondition,
    pub threshold: f32,
    pub actual_value: f32,
    pub triggered_at: DateTime<Utc>,
}

/// Metric data point for history
/// Requirements: 4.5
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricPoint {
    pub timestamp: DateTime<Utc>,
    pub value: f32,
}

/// Input for creating an alert
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateAlertInput {
    pub server_id: Option<String>,
    pub metric: MetricType,
    pub condition: AlertCondition,
    pub threshold: f32,
    pub enabled: bool,
}

/// Input for updating an alert
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateAlertInput {
    pub server_id: Option<String>,
    pub metric: Option<MetricType>,
    pub condition: Option<AlertCondition>,
    pub threshold: Option<f32>,
    pub enabled: Option<bool>,
}
