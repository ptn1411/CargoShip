use crate::error::Result;
use crate::server::{Server, ServerManager};
use crate::ssh::SshClient;
use super::models::*;
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, RwLock};

/// Default concurrency limit for parallel execution
const DEFAULT_MAX_PARALLEL: usize = 5;

/// BatchExecutor handles executing commands on multiple servers
/// Requirements: 2.2, 2.4
pub struct BatchExecutor {
    ssh_client: Arc<SshClient>,
    server_manager: Arc<Mutex<ServerManager>>,
    app_handle: Arc<RwLock<Option<AppHandle>>>,
}

impl BatchExecutor {
    pub fn new(ssh_client: Arc<SshClient>, server_manager: Arc<Mutex<ServerManager>>) -> Self {
        Self {
            ssh_client,
            server_manager,
            app_handle: Arc::new(RwLock::new(None)),
        }
    }

    /// Set the Tauri app handle for emitting events
    pub async fn set_app_handle(&self, app_handle: AppHandle) {
        let mut handle = self.app_handle.write().await;
        *handle = Some(app_handle);
    }

    /// Emit batch progress event
    /// Requirements: 2.3
    async fn emit_progress(&self, completed: usize, total: usize, server_name: &str, server_id: &str) {
        if let Some(ref app_handle) = *self.app_handle.read().await {
            let _ = app_handle.emit("batch-progress", BatchProgressPayload {
                completed,
                total,
                current_server: server_name.to_string(),
                current_server_id: server_id.to_string(),
            });
        }
    }

    /// Execute a command on multiple servers sequentially
    /// Requirements: 2.2, 2.5, 2.6
    pub async fn execute_command(
        &self,
        server_ids: &[String],
        command: &str,
    ) -> Result<Vec<BatchResult>> {
        self.execute_parallel(server_ids, command, 1).await
    }

    /// Execute a command on multiple servers with configurable concurrency
    /// Requirements: 2.2, 2.3, 2.5, 2.6
    pub async fn execute_parallel(
        &self,
        server_ids: &[String],
        command: &str,
        max_parallel: usize,
    ) -> Result<Vec<BatchResult>> {
        let max_parallel = if max_parallel == 0 { DEFAULT_MAX_PARALLEL } else { max_parallel };
        
        // Get all servers first
        let servers = self.get_servers(server_ids).await?;
        let total = servers.len();
        
        // Use semaphore to limit concurrency
        let semaphore = Arc::new(tokio::sync::Semaphore::new(max_parallel));
        let completed_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let mut handles = Vec::new();
        
        for server in servers {
            let ssh_client = self.ssh_client.clone();
            let command = command.to_string();
            let permit = semaphore.clone().acquire_owned().await.unwrap();
            let app_handle = self.app_handle.clone();
            let completed = completed_count.clone();
            let server_name = server.name.clone();
            let server_id = server.id.clone();
            
            let handle = tokio::spawn(async move {
                // Emit progress before starting
                if let Some(ref h) = *app_handle.read().await {
                    let _ = h.emit("batch-progress", BatchProgressPayload {
                        completed: completed.load(std::sync::atomic::Ordering::SeqCst),
                        total,
                        current_server: server_name.clone(),
                        current_server_id: server_id.clone(),
                    });
                }
                
                let result = execute_on_server(ssh_client, server, command).await;
                
                // Increment completed count
                completed.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                
                drop(permit); // Release semaphore permit
                result
            });
            
            handles.push(handle);
        }
        
        // Collect all results (continue on failure - Requirements: 2.6)
        let mut results = Vec::new();
        for handle in handles {
            match handle.await {
                Ok(result) => results.push(result),
                Err(e) => {
                    // Task panicked - create error result
                    results.push(BatchResult {
                        server_id: "unknown".to_string(),
                        server_name: "unknown".to_string(),
                        success: false,
                        output: None,
                        error: Some(format!("Task failed: {}", e)),
                        duration_ms: 0,
                    });
                }
            }
        }
        
        // Emit final progress
        self.emit_progress(results.len(), total, "", "").await;
        
        Ok(results)
    }

    /// Perform health check on multiple servers
    /// Requirements: 2.4
    pub async fn health_check(&self, server_ids: &[String]) -> Result<Vec<HealthCheckResult>> {
        self.health_check_parallel(server_ids, DEFAULT_MAX_PARALLEL).await
    }

    /// Perform health check on multiple servers with configurable concurrency
    /// Requirements: 2.3, 2.4
    pub async fn health_check_parallel(
        &self,
        server_ids: &[String],
        max_parallel: usize,
    ) -> Result<Vec<HealthCheckResult>> {
        let max_parallel = if max_parallel == 0 { DEFAULT_MAX_PARALLEL } else { max_parallel };
        
        // Get all servers first
        let servers = self.get_servers(server_ids).await?;
        let total = servers.len();
        
        // Use semaphore to limit concurrency
        let semaphore = Arc::new(tokio::sync::Semaphore::new(max_parallel));
        let completed_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let mut handles = Vec::new();
        
        for server in servers {
            let ssh_client = self.ssh_client.clone();
            let permit = semaphore.clone().acquire_owned().await.unwrap();
            let app_handle = self.app_handle.clone();
            let completed = completed_count.clone();
            let server_name = server.name.clone();
            let server_id = server.id.clone();
            
            let handle = tokio::spawn(async move {
                // Emit progress before starting
                if let Some(ref h) = *app_handle.read().await {
                    let _ = h.emit("batch-progress", BatchProgressPayload {
                        completed: completed.load(std::sync::atomic::Ordering::SeqCst),
                        total,
                        current_server: server_name.clone(),
                        current_server_id: server_id.clone(),
                    });
                }
                
                let result = check_server_health(ssh_client, server).await;
                
                // Increment completed count
                completed.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                
                drop(permit);
                result
            });
            
            handles.push(handle);
        }
        
        // Collect all results
        let mut results = Vec::new();
        for handle in handles {
            match handle.await {
                Ok(result) => results.push(result),
                Err(e) => {
                    results.push(HealthCheckResult {
                        server_id: "unknown".to_string(),
                        server_name: "unknown".to_string(),
                        connected: false,
                        latency_ms: None,
                        error: Some(format!("Task failed: {}", e)),
                    });
                }
            }
        }
        
        // Emit final progress
        self.emit_progress(results.len(), total, "", "").await;
        
        Ok(results)
    }

    /// Get servers by IDs, filtering out non-existent ones
    async fn get_servers(&self, server_ids: &[String]) -> Result<Vec<Server>> {
        let manager = self.server_manager.lock().await;
        let mut servers = Vec::new();
        
        for id in server_ids {
            if let Ok(Some(server)) = manager.get_server(id).await {
                servers.push(server);
            }
        }
        
        Ok(servers)
    }
}

/// Execute command on a single server (blocking operation wrapped in spawn_blocking)
async fn execute_on_server(ssh_client: Arc<SshClient>, server: Server, command: String) -> BatchResult {
    let start = Instant::now();
    let server_id = server.id.clone();
    let server_name = server.name.clone();
    
    // SSH operations are blocking, so we use spawn_blocking
    let result = tokio::task::spawn_blocking(move || {
        ssh_client.execute_command(&server, &command, Some(60))
    }).await;
    
    let duration_ms = start.elapsed().as_millis() as u64;
    
    match result {
        Ok(Ok(output)) => BatchResult {
            server_id,
            server_name,
            success: output.exit_code == 0,
            output: Some(output.stdout),
            error: if output.exit_code != 0 { Some(output.stderr) } else { None },
            duration_ms,
        },
        Ok(Err(e)) => BatchResult {
            server_id,
            server_name,
            success: false,
            output: None,
            error: Some(e.to_string()),
            duration_ms,
        },
        Err(e) => BatchResult {
            server_id,
            server_name,
            success: false,
            output: None,
            error: Some(format!("Task panicked: {}", e)),
            duration_ms,
        },
    }
}

/// Check health of a single server
async fn check_server_health(ssh_client: Arc<SshClient>, server: Server) -> HealthCheckResult {
    let server_id = server.id.clone();
    let server_name = server.name.clone();
    
    let result = tokio::task::spawn_blocking(move || {
        ssh_client.test_connection(&server)
    }).await;
    
    match result {
        Ok(Ok(status)) => HealthCheckResult {
            server_id,
            server_name,
            connected: status.connected,
            latency_ms: status.latency_ms,
            error: status.error,
        },
        Ok(Err(e)) => HealthCheckResult {
            server_id,
            server_name,
            connected: false,
            latency_ms: None,
            error: Some(e.to_string()),
        },
        Err(e) => HealthCheckResult {
            server_id,
            server_name,
            connected: false,
            latency_ms: None,
            error: Some(format!("Task panicked: {}", e)),
        },
    }
}
