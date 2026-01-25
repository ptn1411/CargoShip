use serde::{Deserialize, Serialize};

/// Result of a batch command execution on a single server
/// Requirements: 2.5
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchResult {
    pub server_id: String,
    pub server_name: String,
    pub success: bool,
    pub output: Option<String>,
    pub error: Option<String>,
    pub duration_ms: u64,
}

/// Result of a health check on a single server
/// Requirements: 2.4
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheckResult {
    pub server_id: String,
    pub server_name: String,
    pub connected: bool,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
}

/// Event payload for batch operation progress
/// Requirements: 2.3
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchProgressPayload {
    pub completed: usize,
    pub total: usize,
    pub current_server: String,
    pub current_server_id: String,
}

/// Summary of batch operation results
/// Requirements: 2.5
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchSummary {
    pub total: usize,
    pub success_count: usize,
    pub failure_count: usize,
    pub results: Vec<BatchResult>,
}

impl BatchSummary {
    pub fn from_results(results: Vec<BatchResult>) -> Self {
        let total = results.len();
        let success_count = results.iter().filter(|r| r.success).count();
        let failure_count = total - success_count;
        
        Self {
            total,
            success_count,
            failure_count,
            results,
        }
    }

    /// Get only successful results
    pub fn successful_results(&self) -> Vec<&BatchResult> {
        self.results.iter().filter(|r| r.success).collect()
    }

    /// Get only failed results
    pub fn failed_results(&self) -> Vec<&BatchResult> {
        self.results.iter().filter(|r| !r.success).collect()
    }

    /// Check if all operations succeeded
    pub fn all_succeeded(&self) -> bool {
        self.failure_count == 0
    }

    /// Check if any operation succeeded
    pub fn any_succeeded(&self) -> bool {
        self.success_count > 0
    }
}

/// Summary of health check results
/// Requirements: 2.4
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheckSummary {
    pub total: usize,
    pub online_count: usize,
    pub offline_count: usize,
    pub results: Vec<HealthCheckResult>,
}

impl HealthCheckSummary {
    pub fn from_results(results: Vec<HealthCheckResult>) -> Self {
        let total = results.len();
        let online_count = results.iter().filter(|r| r.connected).count();
        let offline_count = total - online_count;
        
        Self {
            total,
            online_count,
            offline_count,
            results,
        }
    }

    /// Get only online servers
    pub fn online_servers(&self) -> Vec<&HealthCheckResult> {
        self.results.iter().filter(|r| r.connected).collect()
    }

    /// Get only offline servers
    pub fn offline_servers(&self) -> Vec<&HealthCheckResult> {
        self.results.iter().filter(|r| !r.connected).collect()
    }

    /// Check if all servers are online
    pub fn all_online(&self) -> bool {
        self.offline_count == 0
    }

    /// Check if any server is online
    pub fn any_online(&self) -> bool {
        self.online_count > 0
    }
}
