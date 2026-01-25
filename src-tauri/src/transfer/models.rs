use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Request for a file transfer operation
/// Requirements: 3.1, 3.2
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferRequest {
    pub local_path: String,
    pub remote_path: String,
}

/// Direction of file transfer
/// Requirements: 3.1, 3.2
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransferDirection {
    Upload,
    Download,
}

/// Current state of a transfer
/// Requirements: 3.3, 3.4, 3.6
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransferState {
    Queued,
    InProgress,
    Completed,
    Failed(String),
    Cancelled,
}

/// Status of a file transfer with progress information
/// Requirements: 3.3, 3.5
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferStatus {
    pub id: String,
    pub file_name: String,
    pub direction: TransferDirection,
    pub bytes_transferred: u64,
    pub total_bytes: u64,
    pub speed_bps: u64,
    pub eta_seconds: Option<u64>,
    pub state: TransferState,
    pub server_id: String,
    pub local_path: String,
    pub remote_path: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Internal representation of a transfer job
#[derive(Debug, Clone)]
pub struct TransferJob {
    pub id: String,
    pub server_id: String,
    pub file_name: String,
    pub local_path: String,
    pub remote_path: String,
    pub direction: TransferDirection,
    pub total_bytes: u64,
    pub bytes_transferred: u64,
    pub speed_bps: u64,
    pub state: TransferState,
    pub retry_count: u32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
}

impl TransferJob {
    /// Create a new transfer job
    pub fn new(
        id: String,
        server_id: String,
        local_path: String,
        remote_path: String,
        direction: TransferDirection,
        total_bytes: u64,
    ) -> Self {
        let file_name = std::path::Path::new(&local_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let now = Utc::now();

        Self {
            id,
            server_id,
            file_name,
            local_path,
            remote_path,
            direction,
            total_bytes,
            bytes_transferred: 0,
            speed_bps: 0,
            state: TransferState::Queued,
            retry_count: 0,
            created_at: now,
            updated_at: now,
            started_at: None,
            completed_at: None,
        }
    }

    /// Convert to TransferStatus for external API
    pub fn to_status(&self) -> TransferStatus {
        let eta_seconds = if self.speed_bps > 0 && self.bytes_transferred < self.total_bytes {
            let remaining = self.total_bytes - self.bytes_transferred;
            Some(remaining / self.speed_bps)
        } else {
            None
        };

        TransferStatus {
            id: self.id.clone(),
            file_name: self.file_name.clone(),
            direction: self.direction,
            bytes_transferred: self.bytes_transferred,
            total_bytes: self.total_bytes,
            speed_bps: self.speed_bps,
            eta_seconds,
            state: self.state.clone(),
            server_id: self.server_id.clone(),
            local_path: self.local_path.clone(),
            remote_path: self.remote_path.clone(),
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }

    /// Update progress
    pub fn update_progress(&mut self, bytes_transferred: u64, speed_bps: u64) {
        self.bytes_transferred = bytes_transferred;
        self.speed_bps = speed_bps;
        self.updated_at = Utc::now();
    }

    /// Mark as in progress
    pub fn start(&mut self) {
        self.state = TransferState::InProgress;
        self.started_at = Some(Utc::now());
        self.updated_at = Utc::now();
    }

    /// Mark as completed
    pub fn complete(&mut self) {
        self.state = TransferState::Completed;
        self.bytes_transferred = self.total_bytes;
        self.completed_at = Some(Utc::now());
        self.updated_at = Utc::now();
    }

    /// Mark as failed
    pub fn fail(&mut self, error: String) {
        self.state = TransferState::Failed(error);
        self.completed_at = Some(Utc::now());
        self.updated_at = Utc::now();
    }

    /// Mark as cancelled
    pub fn cancel(&mut self) {
        self.state = TransferState::Cancelled;
        self.completed_at = Some(Utc::now());
        self.updated_at = Utc::now();
    }

    /// Increment retry count and reset state for retry
    pub fn retry(&mut self) {
        self.retry_count += 1;
        self.state = TransferState::Queued;
        self.bytes_transferred = 0;
        self.speed_bps = 0;
        self.started_at = None;
        self.completed_at = None;
        self.updated_at = Utc::now();
    }

    /// Check if transfer can be retried
    pub fn can_retry(&self, max_retries: u32) -> bool {
        matches!(self.state, TransferState::Failed(_)) && self.retry_count < max_retries
    }
}

/// Event payload for transfer progress
/// Requirements: 3.3, 3.5
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferProgressPayload {
    pub transfer_id: String,
    pub bytes_transferred: u64,
    pub total_bytes: u64,
    pub speed_bps: u64,
    pub eta_seconds: Option<u64>,
}

/// Event payload for transfer completion
/// Requirements: 3.4, 3.6
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferCompletedPayload {
    pub transfer_id: String,
    pub success: bool,
    pub error: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transfer_job_creation() {
        let job = TransferJob::new(
            "test-id".to_string(),
            "server-1".to_string(),
            "/local/path/file.txt".to_string(),
            "/remote/path/file.txt".to_string(),
            TransferDirection::Upload,
            1024,
        );

        assert_eq!(job.id, "test-id");
        assert_eq!(job.file_name, "file.txt");
        assert_eq!(job.direction, TransferDirection::Upload);
        assert_eq!(job.total_bytes, 1024);
        assert_eq!(job.bytes_transferred, 0);
        assert!(matches!(job.state, TransferState::Queued));
    }

    #[test]
    fn test_transfer_job_lifecycle() {
        let mut job = TransferJob::new(
            "test-id".to_string(),
            "server-1".to_string(),
            "/local/file.txt".to_string(),
            "/remote/file.txt".to_string(),
            TransferDirection::Download,
            1000,
        );

        // Start
        job.start();
        assert!(matches!(job.state, TransferState::InProgress));
        assert!(job.started_at.is_some());

        // Update progress
        job.update_progress(500, 100);
        assert_eq!(job.bytes_transferred, 500);
        assert_eq!(job.speed_bps, 100);

        // Complete
        job.complete();
        assert!(matches!(job.state, TransferState::Completed));
        assert!(job.completed_at.is_some());
    }

    #[test]
    fn test_transfer_job_failure_and_retry() {
        let mut job = TransferJob::new(
            "test-id".to_string(),
            "server-1".to_string(),
            "/local/file.txt".to_string(),
            "/remote/file.txt".to_string(),
            TransferDirection::Upload,
            1000,
        );

        job.start();
        job.fail("Connection lost".to_string());
        assert!(matches!(job.state, TransferState::Failed(_)));
        assert!(job.can_retry(3));

        job.retry();
        assert_eq!(job.retry_count, 1);
        assert!(matches!(job.state, TransferState::Queued));
        assert_eq!(job.bytes_transferred, 0);
    }

    #[test]
    fn test_transfer_status_eta_calculation() {
        let mut job = TransferJob::new(
            "test-id".to_string(),
            "server-1".to_string(),
            "/local/file.txt".to_string(),
            "/remote/file.txt".to_string(),
            TransferDirection::Download,
            1000,
        );

        job.bytes_transferred = 500;
        job.speed_bps = 100;

        let status = job.to_status();
        assert_eq!(status.eta_seconds, Some(5)); // 500 remaining / 100 bps = 5 seconds
    }
}
