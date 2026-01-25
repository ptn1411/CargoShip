use super::models::*;
use crate::credentials::CredentialStore;
use crate::error::{AppError, Result};
use crate::server::{Server, ServerManager};
use crate::ssh::{authenticate_session, create_ssh_session, SshKeyManager};

use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, RwLock};
use uuid::Uuid;

/// Maximum retry attempts for failed transfers
const MAX_RETRY_ATTEMPTS: u32 = 3;

/// Default chunk size for file transfers (64KB)
const DEFAULT_CHUNK_SIZE: usize = 64 * 1024;

/// Progress update interval in milliseconds
const PROGRESS_UPDATE_INTERVAL_MS: u64 = 100;

/// TransferManager handles file uploads and downloads with queue management
/// Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8
pub struct TransferManager {
    credential_store: Arc<CredentialStore>,
    server_manager: Arc<Mutex<ServerManager>>,
    app_handle: Arc<RwLock<Option<AppHandle>>>,
    // Transfer state
    transfers: Arc<RwLock<HashMap<String, TransferJob>>>,
    queue: Arc<Mutex<VecDeque<String>>>,
    // Configuration
    speed_limit: Arc<RwLock<Option<u64>>>,
    // Control
    cancel_flags: Arc<RwLock<HashMap<String, Arc<AtomicBool>>>>,
    // Processing state
    is_processing: Arc<AtomicBool>,
    ssh_key_manager: Option<Arc<SshKeyManager>>,
}

impl TransferManager {
    /// Create a new TransferManager
    pub fn new(
        credential_store: Arc<CredentialStore>,
        server_manager: Arc<Mutex<ServerManager>>,
    ) -> Self {
        Self {
            credential_store,
            server_manager,
            app_handle: Arc::new(RwLock::new(None)),
            transfers: Arc::new(RwLock::new(HashMap::new())),
            queue: Arc::new(Mutex::new(VecDeque::new())),
            speed_limit: Arc::new(RwLock::new(None)),
            cancel_flags: Arc::new(RwLock::new(HashMap::new())),
            is_processing: Arc::new(AtomicBool::new(false)),
            ssh_key_manager: None,
        }
    }

    pub fn with_key_manager(
        credential_store: Arc<CredentialStore>,
        server_manager: Arc<Mutex<ServerManager>>,
        ssh_key_manager: Arc<SshKeyManager>,
    ) -> Self {
        Self {
            credential_store,
            server_manager,
            app_handle: Arc::new(RwLock::new(None)),
            transfers: Arc::new(RwLock::new(HashMap::new())),
            queue: Arc::new(Mutex::new(VecDeque::new())),
            speed_limit: Arc::new(RwLock::new(None)),
            cancel_flags: Arc::new(RwLock::new(HashMap::new())),
            is_processing: Arc::new(AtomicBool::new(false)),
            ssh_key_manager: Some(ssh_key_manager),
        }
    }

    /// Set the Tauri app handle for emitting events
    pub async fn set_app_handle(&self, app_handle: AppHandle) {
        let mut handle = self.app_handle.write().await;
        *handle = Some(app_handle);
    }

    /// Upload a single file
    /// Requirements: 3.1
    pub async fn upload(
        &self,
        server_id: &str,
        local_path: &str,
        remote_path: &str,
    ) -> Result<String> {
        let transfers = vec![TransferRequest {
            local_path: local_path.to_string(),
            remote_path: remote_path.to_string(),
        }];

        let ids = self.queue_uploads(server_id, transfers).await?;
        Ok(ids.into_iter().next().unwrap_or_default())
    }

    /// Download a single file
    /// Requirements: 3.2
    pub async fn download(
        &self,
        server_id: &str,
        remote_path: &str,
        local_path: &str,
    ) -> Result<String> {
        let transfers = vec![TransferRequest {
            local_path: local_path.to_string(),
            remote_path: remote_path.to_string(),
        }];

        let ids = self.queue_downloads(server_id, transfers).await?;
        Ok(ids.into_iter().next().unwrap_or_default())
    }

    /// Queue multiple files for upload
    /// Requirements: 3.1, 3.3
    pub async fn queue_uploads(
        &self,
        server_id: &str,
        transfers: Vec<TransferRequest>,
    ) -> Result<Vec<String>> {
        let mut transfer_ids = Vec::new();

        for request in transfers {
            // Get file size
            let metadata = std::fs::metadata(&request.local_path).map_err(|e| {
                AppError::FileOperationFailed(format!(
                    "Failed to read local file '{}': {}",
                    request.local_path, e
                ))
            })?;

            let total_bytes = metadata.len();
            let id = Uuid::new_v4().to_string();

            let job = TransferJob::new(
                id.clone(),
                server_id.to_string(),
                request.local_path,
                request.remote_path,
                TransferDirection::Upload,
                total_bytes,
            );

            // Add to transfers map
            {
                let mut transfers = self.transfers.write().await;
                transfers.insert(id.clone(), job);
            }

            // Add cancel flag
            {
                let mut flags = self.cancel_flags.write().await;
                flags.insert(id.clone(), Arc::new(AtomicBool::new(false)));
            }

            // Add to queue
            {
                let mut queue = self.queue.lock().await;
                queue.push_back(id.clone());
            }

            transfer_ids.push(id);
        }

        // Start processing if not already running
        self.start_processing().await;

        Ok(transfer_ids)
    }

    /// Queue multiple files for download
    /// Requirements: 3.2, 3.3
    pub async fn queue_downloads(
        &self,
        server_id: &str,
        transfers: Vec<TransferRequest>,
    ) -> Result<Vec<String>> {
        let server = self.get_server(server_id).await?;
        let mut transfer_ids = Vec::new();

        for request in transfers {
            // Get remote file size via SSH
            let total_bytes = self
                .get_remote_file_size(&server, &request.remote_path)
                .await?;
            let id = Uuid::new_v4().to_string();

            let job = TransferJob::new(
                id.clone(),
                server_id.to_string(),
                request.local_path,
                request.remote_path,
                TransferDirection::Download,
                total_bytes,
            );

            // Add to transfers map
            {
                let mut transfers = self.transfers.write().await;
                transfers.insert(id.clone(), job);
            }

            // Add cancel flag
            {
                let mut flags = self.cancel_flags.write().await;
                flags.insert(id.clone(), Arc::new(AtomicBool::new(false)));
            }

            // Add to queue
            {
                let mut queue = self.queue.lock().await;
                queue.push_back(id.clone());
            }

            transfer_ids.push(id);
        }

        // Start processing if not already running
        self.start_processing().await;

        Ok(transfer_ids)
    }

    /// Cancel a transfer
    /// Requirements: 3.6
    pub async fn cancel_transfer(&self, transfer_id: &str) -> Result<()> {
        // Set cancel flag
        {
            let flags = self.cancel_flags.read().await;
            if let Some(flag) = flags.get(transfer_id) {
                flag.store(true, Ordering::SeqCst);
            }
        }

        // Update job state
        {
            let mut transfers = self.transfers.write().await;
            if let Some(job) = transfers.get_mut(transfer_id) {
                job.cancel();
            }
        }

        // Emit completion event
        self.emit_completed(
            transfer_id,
            false,
            Some("Transfer cancelled by user".to_string()),
        )
        .await;

        Ok(())
    }

    /// Get status of a specific transfer
    /// Requirements: 3.3
    pub async fn get_transfer_status(&self, transfer_id: &str) -> Result<TransferStatus> {
        let transfers = self.transfers.read().await;
        transfers
            .get(transfer_id)
            .map(|job| job.to_status())
            .ok_or_else(|| {
                AppError::FileOperationFailed(format!("Transfer not found: {}", transfer_id))
            })
    }

    /// Get all transfers
    /// Requirements: 3.3
    pub async fn get_all_transfers(&self) -> Vec<TransferStatus> {
        let transfers = self.transfers.read().await;
        transfers.values().map(|job| job.to_status()).collect()
    }

    /// Set speed limit in bytes per second
    /// Requirements: 3.8
    pub async fn set_speed_limit(&self, bytes_per_second: Option<u64>) -> Result<()> {
        let mut limit = self.speed_limit.write().await;
        *limit = bytes_per_second;
        Ok(())
    }

    /// Get current speed limit
    pub async fn get_speed_limit(&self) -> Option<u64> {
        let limit = self.speed_limit.read().await;
        *limit
    }

    /// Start the queue processing loop
    async fn start_processing(&self) {
        if self
            .is_processing
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return; // Already processing
        }

        let transfers = self.transfers.clone();
        let queue = self.queue.clone();
        let credential_store = self.credential_store.clone();
        let server_manager = self.server_manager.clone();
        let speed_limit = self.speed_limit.clone();
        let cancel_flags = self.cancel_flags.clone();
        let is_processing = self.is_processing.clone();
        let app_handle = self.app_handle.clone();
        let ssh_key_manager = self.ssh_key_manager.clone();

        tokio::spawn(async move {
            loop {
                // Get next transfer from queue
                let transfer_id = {
                    let mut q = queue.lock().await;
                    q.pop_front()
                };

                let Some(transfer_id) = transfer_id else {
                    // Queue is empty, stop processing
                    is_processing.store(false, Ordering::SeqCst);
                    break;
                };

                // Get job details
                let job_info = {
                    let t = transfers.read().await;
                    t.get(&transfer_id).cloned()
                };

                let Some(job) = job_info else {
                    continue;
                };

                // Check if cancelled
                let is_cancelled = {
                    let flags = cancel_flags.read().await;
                    flags
                        .get(&transfer_id)
                        .map(|f| f.load(Ordering::SeqCst))
                        .unwrap_or(false)
                };

                if is_cancelled {
                    continue;
                }

                // Get server
                let server = {
                    let manager = server_manager.lock().await;
                    manager.get_server(&job.server_id).await.ok().flatten()
                };

                let Some(server) = server else {
                    // Mark as failed
                    let mut t = transfers.write().await;
                    if let Some(j) = t.get_mut(&transfer_id) {
                        j.fail("Server not found".to_string());
                    }

                    let handle = app_handle.read().await;
                    if let Some(h) = handle.as_ref() {
                        let _ = h.emit(
                            "transfer-completed",
                            TransferCompletedPayload {
                                transfer_id: transfer_id.clone(),
                                success: false,
                                error: Some("Server not found".to_string()),
                            },
                        );
                    }
                    continue;
                };

                // Mark as in progress
                {
                    let mut t = transfers.write().await;
                    if let Some(j) = t.get_mut(&transfer_id) {
                        j.start();
                    }
                }

                // Get cancel flag
                let cancel_flag = {
                    let flags = cancel_flags.read().await;
                    flags.get(&transfer_id).cloned()
                }
                .unwrap_or_else(|| Arc::new(AtomicBool::new(false)));

                // Get speed limit
                let limit = {
                    let l = speed_limit.read().await;
                    *l
                };

                // Execute transfer
                let result = match job.direction {
                    TransferDirection::Upload => {
                        execute_upload(
                            &credential_store,
                            ssh_key_manager.as_ref(),
                            &server,
                            &job.local_path,
                            &job.remote_path,
                            &transfers,
                            &transfer_id,
                            cancel_flag,
                            limit,
                            app_handle.clone(),
                        )
                        .await
                    }
                    TransferDirection::Download => {
                        execute_download(
                            &credential_store,
                            ssh_key_manager.as_ref(),
                            &server,
                            &job.remote_path,
                            &job.local_path,
                            &transfers,
                            &transfer_id,
                            cancel_flag,
                            limit,
                            app_handle.clone(),
                        )
                        .await
                    }
                };

                match result {
                    Ok(()) => {
                        // Mark as completed
                        {
                            let mut t = transfers.write().await;
                            if let Some(j) = t.get_mut(&transfer_id) {
                                j.complete();
                            }
                        }

                        let handle = app_handle.read().await;
                        if let Some(h) = handle.as_ref() {
                            let _ = h.emit(
                                "transfer-completed",
                                TransferCompletedPayload {
                                    transfer_id: transfer_id.clone(),
                                    success: true,
                                    error: None,
                                },
                            );
                        }
                    }
                    Err(e) => {
                        let error_msg = e.to_string();

                        // Check if should retry
                        let should_retry = {
                            let t = transfers.read().await;
                            t.get(&transfer_id)
                                .map(|j| j.retry_count < MAX_RETRY_ATTEMPTS)
                                .unwrap_or(false)
                        };

                        if should_retry && !error_msg.contains("cancelled") {
                            // Retry
                            {
                                let mut t = transfers.write().await;
                                if let Some(j) = t.get_mut(&transfer_id) {
                                    j.retry();
                                }
                            }

                            // Re-add to queue
                            let mut q = queue.lock().await;
                            q.push_back(transfer_id.clone());
                        } else {
                            // Mark as failed
                            {
                                let mut t = transfers.write().await;
                                if let Some(j) = t.get_mut(&transfer_id) {
                                    j.fail(error_msg.clone());
                                }
                            }

                            let handle = app_handle.read().await;
                            if let Some(h) = handle.as_ref() {
                                let _ = h.emit(
                                    "transfer-completed",
                                    TransferCompletedPayload {
                                        transfer_id: transfer_id.clone(),
                                        success: false,
                                        error: Some(error_msg),
                                    },
                                );
                            }
                        }
                    }
                }
            }
        });
    }

    /// Get server by ID
    async fn get_server(&self, server_id: &str) -> Result<Server> {
        let manager = self.server_manager.lock().await;
        manager
            .get_server(server_id)
            .await?
            .ok_or_else(|| AppError::ServerNotFound(server_id.to_string()))
    }

    /// Get remote file size via SSH
    async fn get_remote_file_size(&self, server: &Server, remote_path: &str) -> Result<u64> {
        let server = server.clone();
        let remote_path = remote_path.to_string();
        let credential_store = self.credential_store.clone();
        let ssh_key_manager = self.ssh_key_manager.clone();

        tokio::task::spawn_blocking(move || {
            let (session, _tcp) = create_ssh_session(&server.host, server.port)?;
            authenticate_session(&session, &server, &credential_store, ssh_key_manager.as_deref())?;

            let sftp = session.sftp().map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to open SFTP: {}", e))
            })?;

            let stat = sftp.stat(Path::new(&remote_path)).map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to stat file: {}", e))
            })?;

            Ok(stat.size.unwrap_or(0))
        })
        .await
        .map_err(|e| AppError::FileOperationFailed(format!("Task failed: {}", e)))?
    }

    /// Emit transfer progress event
    #[allow(dead_code)]
    async fn emit_progress(
        &self,
        transfer_id: &str,
        bytes_transferred: u64,
        total_bytes: u64,
        speed_bps: u64,
    ) {
        let eta_seconds = if speed_bps > 0 && bytes_transferred < total_bytes {
            Some((total_bytes - bytes_transferred) / speed_bps)
        } else {
            None
        };

        let handle = self.app_handle.read().await;
        if let Some(h) = handle.as_ref() {
            let _ = h.emit(
                "transfer-progress",
                TransferProgressPayload {
                    transfer_id: transfer_id.to_string(),
                    bytes_transferred,
                    total_bytes,
                    speed_bps,
                    eta_seconds,
                },
            );
        }
    }

    /// Emit transfer completed event
    async fn emit_completed(&self, transfer_id: &str, success: bool, error: Option<String>) {
        let handle = self.app_handle.read().await;
        if let Some(h) = handle.as_ref() {
            let _ = h.emit(
                "transfer-completed",
                TransferCompletedPayload {
                    transfer_id: transfer_id.to_string(),
                    success,
                    error,
                },
            );
        }
    }
}

/// Execute upload operation
async fn execute_upload(
    credential_store: &Arc<CredentialStore>,
    ssh_key_manager: Option<&Arc<SshKeyManager>>,
    server: &Server,
    local_path: &str,
    remote_path: &str,
    transfers: &Arc<RwLock<HashMap<String, TransferJob>>>,
    transfer_id: &str,
    cancel_flag: Arc<AtomicBool>,
    speed_limit: Option<u64>,
    app_handle: Arc<RwLock<Option<AppHandle>>>,
) -> Result<()> {
    let server = server.clone();
    let local_path = local_path.to_string();
    let remote_path = remote_path.to_string();
    let credential_store = credential_store.clone();
    let transfers = transfers.clone();
    let transfer_id = transfer_id.to_string();
    let ssh_key_manager = ssh_key_manager.cloned();

    tokio::task::spawn_blocking(move || {
        // Open local file
        let mut local_file = std::fs::File::open(&local_path).map_err(|e| {
            AppError::FileOperationFailed(format!("Failed to open local file: {}", e))
        })?;

        let metadata = local_file.metadata().map_err(|e| {
            AppError::FileOperationFailed(format!("Failed to get file metadata: {}", e))
        })?;
        let total_bytes = metadata.len();

        // Create SSH session
        let (session, _tcp) = create_ssh_session(&server.host, server.port)?;
        authenticate_session(&session, &server, &credential_store, ssh_key_manager.as_deref())?;

        let sftp = session
            .sftp()
            .map_err(|e| AppError::FileOperationFailed(format!("Failed to open SFTP: {}", e)))?;

        // Create remote file
        let mut remote_file = sftp.create(Path::new(&remote_path)).map_err(|e| {
            AppError::FileOperationFailed(format!("Failed to create remote file: {}", e))
        })?;

        // Transfer in chunks
        let mut buffer = vec![0u8; DEFAULT_CHUNK_SIZE];
        let mut bytes_transferred: u64 = 0;
        let start_time = Instant::now();
        let mut last_progress_update = Instant::now();

        loop {
            // Check for cancellation
            if cancel_flag.load(Ordering::SeqCst) {
                return Err(AppError::FileOperationFailed(
                    "Transfer cancelled".to_string(),
                ));
            }

            let bytes_read = local_file.read(&mut buffer).map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to read local file: {}", e))
            })?;

            if bytes_read == 0 {
                break;
            }

            remote_file.write_all(&buffer[..bytes_read]).map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to write remote file: {}", e))
            })?;

            bytes_transferred += bytes_read as u64;

            // Apply speed limiting
            if let Some(limit) = speed_limit {
                let elapsed = start_time.elapsed().as_secs_f64();
                let expected_time = bytes_transferred as f64 / limit as f64;
                if expected_time > elapsed {
                    let sleep_time = Duration::from_secs_f64(expected_time - elapsed);
                    std::thread::sleep(sleep_time);
                }
            }

            // Update progress periodically
            if last_progress_update.elapsed().as_millis() >= PROGRESS_UPDATE_INTERVAL_MS as u128 {
                let elapsed_secs = start_time.elapsed().as_secs().max(1);
                let speed_bps = bytes_transferred / elapsed_secs;

                // Update job
                {
                    if let Ok(mut t) = transfers.try_write() {
                        if let Some(job) = t.get_mut(&transfer_id) {
                            job.update_progress(bytes_transferred, speed_bps);
                        }
                    }
                }

                // Emit progress event
                let eta_seconds = if speed_bps > 0 && bytes_transferred < total_bytes {
                    Some((total_bytes - bytes_transferred) / speed_bps)
                } else {
                    None
                };

                if let Ok(handle) = app_handle.try_read() {
                    if let Some(h) = handle.as_ref() {
                        let _ = h.emit(
                            "transfer-progress",
                            TransferProgressPayload {
                                transfer_id: transfer_id.clone(),
                                bytes_transferred,
                                total_bytes,
                                speed_bps,
                                eta_seconds,
                            },
                        );
                    }
                }

                last_progress_update = Instant::now();
            }
        }

        Ok(())
    })
    .await
    .map_err(|e| AppError::FileOperationFailed(format!("Task failed: {}", e)))?
}

/// Execute download operation
async fn execute_download(
    credential_store: &Arc<CredentialStore>,
    ssh_key_manager: Option<&Arc<SshKeyManager>>,
    server: &Server,
    remote_path: &str,
    local_path: &str,
    transfers: &Arc<RwLock<HashMap<String, TransferJob>>>,
    transfer_id: &str,
    cancel_flag: Arc<AtomicBool>,
    speed_limit: Option<u64>,
    app_handle: Arc<RwLock<Option<AppHandle>>>,
) -> Result<()> {
    let server = server.clone();
    let local_path = local_path.to_string();
    let remote_path = remote_path.to_string();
    let credential_store = credential_store.clone();
    let transfers = transfers.clone();
    let transfer_id = transfer_id.to_string();
    let ssh_key_manager = ssh_key_manager.cloned();

    tokio::task::spawn_blocking(move || {
        // Create SSH session
        let (session, _tcp) = create_ssh_session(&server.host, server.port)?;
        authenticate_session(&session, &server, &credential_store, ssh_key_manager.as_deref())?;

        let sftp = session
            .sftp()
            .map_err(|e| AppError::FileOperationFailed(format!("Failed to open SFTP: {}", e)))?;

        // Get remote file size
        let stat = sftp.stat(Path::new(&remote_path)).map_err(|e| {
            AppError::FileOperationFailed(format!("Failed to stat remote file: {}", e))
        })?;
        let total_bytes = stat.size.unwrap_or(0);

        // Open remote file
        let mut remote_file = sftp.open(Path::new(&remote_path)).map_err(|e| {
            AppError::FileOperationFailed(format!("Failed to open remote file: {}", e))
        })?;

        // Create parent directory if needed
        if let Some(parent) = Path::new(&local_path).parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to create directory: {}", e))
            })?;
        }

        // Create local file
        let mut local_file = std::fs::File::create(&local_path).map_err(|e| {
            AppError::FileOperationFailed(format!("Failed to create local file: {}", e))
        })?;

        // Transfer in chunks
        let mut buffer = vec![0u8; DEFAULT_CHUNK_SIZE];
        let mut bytes_transferred: u64 = 0;
        let start_time = Instant::now();
        let mut last_progress_update = Instant::now();

        loop {
            // Check for cancellation
            if cancel_flag.load(Ordering::SeqCst) {
                // Clean up partial file
                let _ = std::fs::remove_file(&local_path);
                return Err(AppError::FileOperationFailed(
                    "Transfer cancelled".to_string(),
                ));
            }

            let bytes_read = remote_file.read(&mut buffer).map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to read remote file: {}", e))
            })?;

            if bytes_read == 0 {
                break;
            }

            local_file.write_all(&buffer[..bytes_read]).map_err(|e| {
                AppError::FileOperationFailed(format!("Failed to write local file: {}", e))
            })?;

            bytes_transferred += bytes_read as u64;

            // Apply speed limiting
            if let Some(limit) = speed_limit {
                let elapsed = start_time.elapsed().as_secs_f64();
                let expected_time = bytes_transferred as f64 / limit as f64;
                if expected_time > elapsed {
                    let sleep_time = Duration::from_secs_f64(expected_time - elapsed);
                    std::thread::sleep(sleep_time);
                }
            }

            // Update progress periodically
            if last_progress_update.elapsed().as_millis() >= PROGRESS_UPDATE_INTERVAL_MS as u128 {
                let elapsed_secs = start_time.elapsed().as_secs().max(1);
                let speed_bps = bytes_transferred / elapsed_secs;

                // Update job
                {
                    if let Ok(mut t) = transfers.try_write() {
                        if let Some(job) = t.get_mut(&transfer_id) {
                            job.update_progress(bytes_transferred, speed_bps);
                        }
                    }
                }

                // Emit progress event
                let eta_seconds = if speed_bps > 0 && bytes_transferred < total_bytes {
                    Some((total_bytes - bytes_transferred) / speed_bps)
                } else {
                    None
                };

                if let Ok(handle) = app_handle.try_read() {
                    if let Some(h) = handle.as_ref() {
                        let _ = h.emit(
                            "transfer-progress",
                            TransferProgressPayload {
                                transfer_id: transfer_id.clone(),
                                bytes_transferred,
                                total_bytes,
                                speed_bps,
                                eta_seconds,
                            },
                        );
                    }
                }

                last_progress_update = Instant::now();
            }
        }

        Ok(())
    })
    .await
    .map_err(|e| AppError::FileOperationFailed(format!("Task failed: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chunk_size_is_reasonable() {
        assert!(DEFAULT_CHUNK_SIZE >= 1024); // At least 1KB
        assert!(DEFAULT_CHUNK_SIZE <= 1024 * 1024); // At most 1MB
    }

    #[test]
    fn test_max_retry_attempts() {
        assert!(MAX_RETRY_ATTEMPTS >= 1);
        assert!(MAX_RETRY_ATTEMPTS <= 10);
    }
}
