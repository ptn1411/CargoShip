pub mod batch;
pub mod cache;
pub mod credentials;
pub mod database;
pub mod db;
pub mod deployments;
pub mod error;
pub mod favorites;
pub mod files;
pub mod groups;
pub mod monitor;
pub mod nginx;
pub mod scripts;
pub mod server;
pub mod snippets;
pub mod ssh;
pub mod sync;
pub mod terminal;
pub mod transfer;

use batch::{BatchExecutor, BatchResult, HealthCheckResult, BatchSummary, HealthCheckSummary};
use cache::CacheManager;
use credentials::CredentialStore;
use database::{DatabaseManager, DatabaseConnection, DatabaseInfo, TableInfo, ColumnInfo, IndexInfo, DatabaseUser, QueryResult, TableData, CreateConnectionInput, UpdateConnectionInput, CreateUserInput, ExecuteQueryInput, FetchTableDataInput, UpdateRowInput, InsertRowInput, DeleteRowsInput, ConnectionTestResult, CreateDatabaseInput, CreateTableInput, QueryHistoryEntry, SavedQuery, SaveQueryInput};
use db::init_database;
use deployments::{DeploymentLogger, Deployment, DeploymentLog, DeploymentFilters, ExportFormat};
use favorites::{FavoritesManager, Favorite, FavoriteType, ActivityLog, CreateActivityInput};
use files::{Breadcrumb, FileBrowser, FileContent, FileManager, path_to_breadcrumbs};
use groups::{GroupManager, ServerGroup, CreateGroupInput, UpdateGroupInput};
use monitor::{MonitorService, ServerMetrics, ServerStatus, MetricType, MetricPoint, AlertConfig, Alert, CreateAlertInput, UpdateAlertInput};
use nginx::{NginxManager, NginxDomain, NginxStatus, SslCertificate, SslResult, ConfigSnippet, CreateDomainInput, UpdateDomainInput};
use scripts::{ScriptManager, DeploymentScript, CreateScriptInput, UpdateScriptInput, ValidationResult, TemplateLibrary, TemplateInfo, RollbackManager, RollbackInfo, ScriptEngine, ExecutionConfig, DryRunResult};
use server::{CreateServerInput, Server, ServerManager, UpdateServerInput};
use snippets::{SnippetLibrary, Snippet, CreateSnippetInput, UpdateSnippetInput, ImportResult as SnippetImportResult};
use ssh::{CommandOutput, ConnectionStatus, ServerInfo, SshClient};
use ssh::ConnectionPool;
use ssh::{SshKeyManager, SshKey, CreateSshKeyInput, GeneratedKey};
use sync::{ConflictResolver, ConflictResolution, ConflictStatus, FileDiff, SyncEngine};
use terminal::TerminalManager;
use transfer::{TransferManager, TransferRequest, TransferStatus};

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

pub struct AppState {
    pub server_manager: Arc<Mutex<ServerManager>>,
    pub group_manager: Arc<Mutex<GroupManager>>,
    pub script_manager: Arc<Mutex<ScriptManager>>,
    pub template_library: Arc<TemplateLibrary>,
    pub deployment_logger: Arc<DeploymentLogger>,
    pub rollback_manager: Arc<RollbackManager>,
    pub script_engine: Arc<ScriptEngine>,
    pub batch_executor: Arc<BatchExecutor>,
    pub monitor_service: Arc<MonitorService>,
    pub snippet_library: Arc<Mutex<SnippetLibrary>>,
    pub favorites_manager: Arc<Mutex<FavoritesManager>>,
    pub nginx_manager: Arc<NginxManager>,
    pub database_manager: Arc<DatabaseManager>,
    pub ssh_client: Arc<SshClient>,
    pub ssh_key_manager: Arc<SshKeyManager>,
    pub file_browser: Arc<FileBrowser>,
    pub file_manager: Arc<FileManager>,
    pub cache_manager: Arc<CacheManager>,
    pub sync_engine: Arc<SyncEngine>,
    pub conflict_resolver: Arc<ConflictResolver>,
    pub terminal_manager: Arc<TerminalManager>,
    pub local_terminal_manager: Arc<terminal::LocalTerminalManager>,
    pub credential_store: Arc<CredentialStore>,
    pub active_streams: Arc<Mutex<HashSet<String>>>,
    pub active_local_streams: Arc<Mutex<HashSet<String>>>,
    pub transfer_manager: Arc<TransferManager>,
}

// Event Payloads for Tauri Events

#[derive(Clone, Serialize)]
pub struct TerminalOutputPayload {
    pub session_id: String,
    pub data: Vec<u8>,
}

#[derive(Clone, Serialize)]
pub struct ConnectionStatusPayload {
    pub server_id: String,
    pub status: String, // "online" | "offline" | "connecting"
}

#[derive(Clone, Serialize)]
pub struct CommandOutputPayload {
    pub server_id: String,
    pub command_id: String,
    pub data: String,
    pub is_stderr: bool,
}

// Tauri Commands

#[tauri::command]
async fn list_servers(state: tauri::State<'_, AppState>) -> std::result::Result<Vec<Server>, String> {
    state.server_manager.lock().await
        .list_servers()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_server(
    state: tauri::State<'_, AppState>,
    input: CreateServerInput,
) -> std::result::Result<Server, String> {
    state.server_manager.lock().await
        .create_server(input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_server(
    state: tauri::State<'_, AppState>,
    id: String,
    input: UpdateServerInput,
) -> std::result::Result<Server, String> {
    state.server_manager.lock().await
        .update_server(&id, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_server(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<(), String> {
    state.server_manager.lock().await
        .delete_server(&id)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Server Group Commands (Phase 4 - Task 2)
// ============================================================================

/// Create a new server group
/// Requirements: 1.1
#[tauri::command]
async fn create_group(
    state: tauri::State<'_, AppState>,
    input: CreateGroupInput,
) -> std::result::Result<ServerGroup, String> {
    state.group_manager.lock().await
        .create_group(input)
        .await
        .map_err(|e| e.to_string())
}

/// List all server groups
/// Requirements: 1.2
#[tauri::command]
async fn list_groups(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<ServerGroup>, String> {
    state.group_manager.lock().await
        .list_groups()
        .await
        .map_err(|e| e.to_string())
}

/// Get a server group by ID
/// Requirements: 1.2
#[tauri::command]
async fn get_group(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<ServerGroup, String> {
    state.group_manager.lock().await
        .get_group(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Group not found: {}", id))
}

/// Update a server group
/// Requirements: 1.3
#[tauri::command]
async fn update_group(
    state: tauri::State<'_, AppState>,
    id: String,
    input: UpdateGroupInput,
) -> std::result::Result<ServerGroup, String> {
    state.group_manager.lock().await
        .update_group(&id, input)
        .await
        .map_err(|e| e.to_string())
}

/// Delete a server group
/// Requirements: 1.4
#[tauri::command]
async fn delete_group(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<(), String> {
    state.group_manager.lock().await
        .delete_group(&id)
        .await
        .map_err(|e| e.to_string())
}

/// Add a server to a group
/// Requirements: 1.3
#[tauri::command]
async fn add_server_to_group(
    state: tauri::State<'_, AppState>,
    group_id: String,
    server_id: String,
) -> std::result::Result<(), String> {
    state.group_manager.lock().await
        .add_server_to_group(&group_id, &server_id)
        .await
        .map_err(|e| e.to_string())
}

/// Remove a server from a group
/// Requirements: 1.3
#[tauri::command]
async fn remove_server_from_group(
    state: tauri::State<'_, AppState>,
    group_id: String,
    server_id: String,
) -> std::result::Result<(), String> {
    state.group_manager.lock().await
        .remove_server_from_group(&group_id, &server_id)
        .await
        .map_err(|e| e.to_string())
}

/// Get all servers in a group
/// Requirements: 1.5
#[tauri::command]
async fn get_servers_in_group(
    state: tauri::State<'_, AppState>,
    group_id: String,
) -> std::result::Result<Vec<Server>, String> {
    state.group_manager.lock().await
        .get_servers_in_group(&group_id)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Batch Operation Commands (Phase 4 - Task 3)
// ============================================================================

/// Execute a command on multiple servers
/// Requirements: 2.2, 2.5, 2.6
#[tauri::command]
async fn batch_execute_command(
    state: tauri::State<'_, AppState>,
    server_ids: Vec<String>,
    command: String,
) -> std::result::Result<Vec<BatchResult>, String> {
    state.batch_executor
        .execute_command(&server_ids, &command)
        .await
        .map_err(|e| e.to_string())
}

/// Execute a command on multiple servers with configurable concurrency
/// Requirements: 2.2, 2.5, 2.6
#[tauri::command]
async fn batch_execute_parallel(
    state: tauri::State<'_, AppState>,
    server_ids: Vec<String>,
    command: String,
    max_parallel: usize,
) -> std::result::Result<Vec<BatchResult>, String> {
    state.batch_executor
        .execute_parallel(&server_ids, &command, max_parallel)
        .await
        .map_err(|e| e.to_string())
}

/// Perform health check on multiple servers
/// Requirements: 2.4
#[tauri::command]
async fn batch_health_check(
    state: tauri::State<'_, AppState>,
    server_ids: Vec<String>,
) -> std::result::Result<Vec<HealthCheckResult>, String> {
    state.batch_executor
        .health_check(&server_ids)
        .await
        .map_err(|e| e.to_string())
}

/// Execute command and return summary with aggregated results
/// Requirements: 2.5
#[tauri::command]
async fn batch_execute_with_summary(
    state: tauri::State<'_, AppState>,
    server_ids: Vec<String>,
    command: String,
) -> std::result::Result<BatchSummary, String> {
    let results = state.batch_executor
        .execute_command(&server_ids, &command)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(BatchSummary::from_results(results))
}

/// Health check and return summary with aggregated results
/// Requirements: 2.4, 2.5
#[tauri::command]
async fn batch_health_check_with_summary(
    state: tauri::State<'_, AppState>,
    server_ids: Vec<String>,
) -> std::result::Result<HealthCheckSummary, String> {
    let results = state.batch_executor
        .health_check(&server_ids)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(HealthCheckSummary::from_results(results))
}

#[tauri::command]
async fn test_connection(
    state: tauri::State<'_, AppState>,
    server_id: String,
) -> std::result::Result<ConnectionStatus, String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    state.ssh_client.test_connection(&server)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_server_info(
    state: tauri::State<'_, AppState>,
    server_id: String,
) -> std::result::Result<ServerInfo, String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    state.ssh_client.get_server_info(&server)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_remote_files(
    state: tauri::State<'_, AppState>,
    server_id: String,
    path: String,
) -> std::result::Result<Vec<files::FileEntry>, String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    state.file_browser.list_directory(&server, &path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn search_files(
    state: tauri::State<'_, AppState>,
    server_id: String,
    path: String,
    pattern: String,
) -> std::result::Result<Vec<files::FileEntry>, String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    state.file_browser.search_files(&server, &path, &pattern)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_file_info(
    state: tauri::State<'_, AppState>,
    server_id: String,
    path: String,
) -> std::result::Result<files::FileEntry, String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    state.file_browser.get_file_info(&server, &path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_breadcrumbs(path: String) -> Vec<Breadcrumb> {
    path_to_breadcrumbs(&path)
}

#[tauri::command]
async fn create_terminal_session(
    state: tauri::State<'_, AppState>,
    server_id: String,
) -> std::result::Result<String, String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    state.terminal_manager.create_session(&server, 80, 24)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn close_terminal_session(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> std::result::Result<(), String> {
    state.terminal_manager.close_session(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn resize_terminal(
    state: tauri::State<'_, AppState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> std::result::Result<(), String> {
    state.terminal_manager.resize_session(&session_id, cols, rows)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn write_terminal(
    state: tauri::State<'_, AppState>,
    session_id: String,
    data: Vec<u8>,
) -> std::result::Result<(), String> {
    state.terminal_manager.write_to_session(&session_id, &data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn read_terminal(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> std::result::Result<Vec<u8>, String> {
    state.terminal_manager.read_from_session(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_terminal_stream(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> std::result::Result<(), String> {
    // Check if stream already exists for this session
    {
        let mut active_streams = state.active_streams.lock().await;
        if active_streams.contains(&session_id) {
            // Stream already running, don't create duplicate
            return Ok(());
        }
        active_streams.insert(session_id.clone());
    }

    let terminal_manager = state.terminal_manager.clone();
    let active_streams = state.active_streams.clone();
    let session_id_clone = session_id.clone();
    
    // Spawn a background task to poll terminal output and emit events
    tauri::async_runtime::spawn(async move {
        loop {
            // Check if session still exists
            if !terminal_manager.has_session(&session_id_clone) {
                break;
            }
            
            // Read output from terminal
            match terminal_manager.read_from_session(&session_id_clone) {
                Ok(data) if !data.is_empty() => {
                    let payload = TerminalOutputPayload {
                        session_id: session_id_clone.clone(),
                        data,
                    };
                    let _ = app_handle.emit("terminal-output", payload);
                }
                Ok(_) => {
                    // No data, wait a bit before polling again
                }
                Err(_) => {
                    // Session might be closed, exit loop
                    break;
                }
            }
            
            // Small delay to prevent busy-waiting
            tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
        }
        
        // Remove from active streams when done
        let mut streams = active_streams.lock().await;
        streams.remove(&session_id_clone);
    });
    
    Ok(())
}

#[tauri::command]
async fn emit_connection_status(
    app_handle: tauri::AppHandle,
    server_id: String,
    status: String,
) -> std::result::Result<(), String> {
    let payload = ConnectionStatusPayload {
        server_id,
        status,
    };
    app_handle.emit("connection-status-changed", payload)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_terminal_session_count(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<usize, String> {
    Ok(state.terminal_manager.session_count())
}

#[tauri::command]
async fn list_terminal_sessions(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<String>, String> {
    Ok(state.terminal_manager.active_session_ids())
}

// ============================================================================
// Tmux/Screen Session Detection
// ============================================================================

/// Represents a detected multiplexer session (tmux or screen)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MultiplexerSession {
    /// Session name/ID
    pub name: String,
    /// Type of multiplexer (tmux or screen)
    pub multiplexer_type: String,
    /// Whether the session is attached
    pub attached: bool,
    /// Number of windows (for tmux)
    pub windows: Option<u32>,
    /// Creation time if available
    pub created_at: Option<String>,
}

/// Detect tmux and screen sessions on a remote server
/// Requirements: 6.3
#[tauri::command]
async fn detect_multiplexer_sessions(
    state: tauri::State<'_, AppState>,
    server_id: String,
) -> std::result::Result<Vec<MultiplexerSession>, String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    let mut sessions = Vec::new();

    // Detect tmux sessions
    let tmux_cmd = "tmux list-sessions -F '#{session_name}:#{session_attached}:#{session_windows}:#{session_created}' 2>/dev/null || true";
    if let Ok(output) = state.ssh_client.execute_command(&server, tmux_cmd, Some(10)) {
        if output.exit_code == 0 && !output.stdout.trim().is_empty() {
            for line in output.stdout.lines() {
                let parts: Vec<&str> = line.split(':').collect();
                if parts.len() >= 2 {
                    sessions.push(MultiplexerSession {
                        name: parts[0].to_string(),
                        multiplexer_type: "tmux".to_string(),
                        attached: parts.get(1).map(|s| *s == "1").unwrap_or(false),
                        windows: parts.get(2).and_then(|s| s.parse().ok()),
                        created_at: parts.get(3).map(|s| s.to_string()),
                    });
                }
            }
        }
    }

    // Detect screen sessions
    let screen_cmd = "screen -ls 2>/dev/null | grep -E '^\\s+[0-9]+\\.' || true";
    if let Ok(output) = state.ssh_client.execute_command(&server, screen_cmd, Some(10)) {
        if output.exit_code == 0 && !output.stdout.trim().is_empty() {
            for line in output.stdout.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                // Parse screen output format: "12345.session_name (Attached)" or "(Detached)"
                let parts: Vec<&str> = line.split_whitespace().collect();
                if !parts.is_empty() {
                    let name_part = parts[0];
                    // Extract session name (after the PID)
                    let name = if let Some(dot_pos) = name_part.find('.') {
                        name_part[dot_pos + 1..].to_string()
                    } else {
                        name_part.to_string()
                    };
                    
                    let attached = line.contains("(Attached)");
                    
                    sessions.push(MultiplexerSession {
                        name,
                        multiplexer_type: "screen".to_string(),
                        attached,
                        windows: None,
                        created_at: None,
                    });
                }
            }
        }
    }

    Ok(sessions)
}

/// Attach to a tmux or screen session
/// Requirements: 6.3
#[tauri::command]
async fn attach_multiplexer_session(
    state: tauri::State<'_, AppState>,
    session_id: String,
    multiplexer_type: String,
    session_name: String,
) -> std::result::Result<(), String> {
    // Write the attach command to the terminal session
    let attach_cmd = match multiplexer_type.as_str() {
        "tmux" => format!("tmux attach-session -t {}\n", session_name),
        "screen" => format!("screen -r {}\n", session_name),
        _ => return Err(format!("Unknown multiplexer type: {}", multiplexer_type)),
    };

    let data = attach_cmd.into_bytes();
    state.terminal_manager.write_to_session(&session_id, &data)
        .map_err(|e| e.to_string())
}

// ============================================================================
// Local Terminal Commands
// ============================================================================

#[tauri::command]
async fn create_local_terminal_session(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<String, String> {
    state.local_terminal_manager.create_session(80, 24)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn close_local_terminal_session(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> std::result::Result<(), String> {
    // Remove from active streams
    {
        let mut streams = state.active_local_streams.lock().await;
        streams.remove(&session_id);
    }
    state.local_terminal_manager.close_session(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn resize_local_terminal(
    state: tauri::State<'_, AppState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> std::result::Result<(), String> {
    state.local_terminal_manager.resize_session(&session_id, cols, rows)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn write_local_terminal(
    state: tauri::State<'_, AppState>,
    session_id: String,
    data: Vec<u8>,
) -> std::result::Result<(), String> {
    state.local_terminal_manager.write_to_session(&session_id, &data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_local_terminal_stream(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> std::result::Result<(), String> {
    // Check if stream already exists
    {
        let mut active_streams = state.active_local_streams.lock().await;
        if active_streams.contains(&session_id) {
            return Ok(());
        }
        active_streams.insert(session_id.clone());
    }

    // Get the reader Arc upfront
    let reader = state.local_terminal_manager.get_reader(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    let local_terminal_manager = state.local_terminal_manager.clone();
    let active_streams = state.active_local_streams.clone();
    let session_id_clone = session_id.clone();
    
    // Spawn background task to poll terminal output
    tauri::async_runtime::spawn(async move {
        loop {
            if !local_terminal_manager.has_session(&session_id_clone) {
                break;
            }
            
            let reader_clone = reader.clone();
            
            // Use spawn_blocking for the blocking read operation
            let read_result = tokio::task::spawn_blocking(move || {
                reader_clone.read()
            }).await;
            
            match read_result {
                Ok(Ok(data)) if !data.is_empty() => {
                    let payload = TerminalOutputPayload {
                        session_id: session_id_clone.clone(),
                        data,
                    };
                    let _ = app_handle.emit("local-terminal-output", payload);
                }
                Ok(Ok(_)) => {
                    // No data, small delay before next poll
                    tokio::time::sleep(tokio::time::Duration::from_millis(5)).await;
                }
                Ok(Err(_)) | Err(_) => break,
            }
        }
        
        let mut streams = active_streams.lock().await;
        streams.remove(&session_id_clone);
    });
    
    Ok(())
}

#[tauri::command]
async fn execute_command(
    state: tauri::State<'_, AppState>,
    server_id: String,
    command: String,
) -> std::result::Result<CommandOutput, String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    state.ssh_client.execute_command(&server, &command, None)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn execute_command_stream(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    server_id: String,
    command: String,
    command_id: String,
) -> std::result::Result<CommandOutput, String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    // For streaming, we use the SSH client's execute_command but emit events
    // as we receive output. Since the current implementation reads all output
    // at once, we'll emit the complete output as a single event.
    // A more sophisticated implementation would use a streaming channel.
    
    let result = state.ssh_client.execute_command(&server, &command, None)
        .map_err(|e| e.to_string())?;
    
    // Emit stdout if not empty
    if !result.stdout.is_empty() {
        let payload = CommandOutputPayload {
            server_id: server_id.clone(),
            command_id: command_id.clone(),
            data: result.stdout.clone(),
            is_stderr: false,
        };
        let _ = app_handle.emit("command-output", payload);
    }
    
    // Emit stderr if not empty
    if !result.stderr.is_empty() {
        let payload = CommandOutputPayload {
            server_id: server_id.clone(),
            command_id: command_id.clone(),
            data: result.stderr.clone(),
            is_stderr: true,
        };
        let _ = app_handle.emit("command-output", payload);
    }
    
    Ok(result)
}

#[tauri::command]
async fn store_credential(
    state: tauri::State<'_, AppState>,
    server_id: String,
    credential: String,
    is_password: bool,
) -> std::result::Result<(), String> {
    if is_password {
        state.credential_store.store_password(&server_id, &credential)
    } else {
        state.credential_store.store_key_path(&server_id, &credential)
    }.map_err(|e| e.to_string())
}

#[tauri::command]
async fn store_key_passphrase(
    state: tauri::State<'_, AppState>,
    server_id: String,
    passphrase: String,
) -> std::result::Result<(), String> {
    state.credential_store.store_key_passphrase(&server_id, &passphrase)
        .map_err(|e| e.to_string())
}

/// Set sudo password for a server (stored in memory only, not persisted)
#[tauri::command]
async fn set_sudo_password(
    state: tauri::State<'_, AppState>,
    server_id: String,
    password: String,
) -> std::result::Result<(), String> {
    state.file_manager.set_sudo_password(&server_id, &password).await;
    Ok(())
}

/// Clear sudo password for a server
#[tauri::command]
async fn clear_sudo_password(
    state: tauri::State<'_, AppState>,
    server_id: String,
) -> std::result::Result<(), String> {
    state.file_manager.clear_sudo_password(&server_id).await;
    Ok(())
}

#[tauri::command]
async fn check_duplicate_server(
    state: tauri::State<'_, AppState>,
    host: String,
    port: u16,
    username: String,
    exclude_id: Option<String>,
) -> std::result::Result<bool, String> {
    state.server_manager.lock().await
        .check_duplicate(&host, port, &username, exclude_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// File Operation Commands (Task 6.1)
// ============================================================================

/// Download a file from the remote server
/// Requirements: 2.1, 2.3, 1.6
#[tauri::command]
async fn download_file(
    state: tauri::State<'_, AppState>,
    server_id: String,
    remote_path: String,
) -> std::result::Result<FileContent, String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    state.file_manager.download_file(&server, &remote_path)
        .await
        .map_err(|e| e.to_string())
}

/// Save file content to the remote server
/// Requirements: 3.1, 3.5, 3.7
#[tauri::command]
async fn save_file(
    state: tauri::State<'_, AppState>,
    server_id: String,
    remote_path: String,
    content: String,
) -> std::result::Result<(), String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    state.file_manager.save_file(&server, &remote_path, &content)
        .await
        .map_err(|e| e.to_string())
}

/// Create a new empty file on the remote server
/// Requirements: 4.1
#[tauri::command]
async fn create_file(
    state: tauri::State<'_, AppState>,
    server_id: String,
    remote_path: String,
) -> std::result::Result<(), String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    state.file_manager.create_file(&server, &remote_path)
        .await
        .map_err(|e| e.to_string())
}

/// Create a new directory on the remote server
/// Requirements: 4.2
#[tauri::command]
async fn create_directory(
    state: tauri::State<'_, AppState>,
    server_id: String,
    remote_path: String,
) -> std::result::Result<(), String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    state.file_manager.create_directory(&server, &remote_path)
        .await
        .map_err(|e| e.to_string())
}

/// Delete a file or directory on the remote server
/// Requirements: 4.3, 4.6
#[tauri::command]
async fn delete_remote_file(
    state: tauri::State<'_, AppState>,
    server_id: String,
    remote_path: String,
) -> std::result::Result<(), String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    state.file_manager.delete_file(&server, &remote_path)
        .await
        .map_err(|e| e.to_string())
}

/// Change file/directory permissions on the remote server
#[tauri::command]
async fn change_permissions(
    state: tauri::State<'_, AppState>,
    server_id: String,
    remote_path: String,
    mode: String,
) -> std::result::Result<(), String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    state.file_manager.change_permissions(&server, &remote_path, &mode)
        .await
        .map_err(|e| e.to_string())
}

/// Rename a file or directory on the remote server
/// Requirements: 4.4, 4.5, 4.6
#[tauri::command]
async fn rename_file(
    state: tauri::State<'_, AppState>,
    server_id: String,
    old_path: String,
    new_path: String,
) -> std::result::Result<(), String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    state.file_manager.rename_file(&server, &old_path, &new_path)
        .await
        .map_err(|e| e.to_string())
}

/// Upload multiple files to the remote server
/// Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
#[tauri::command]
async fn upload_files(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    server_id: String,
    remote_dir: String,
    local_paths: Vec<String>,
) -> std::result::Result<(), String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    state.file_manager.upload_files(&server, &remote_dir, local_paths, Some(&app_handle))
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Sync Commands (Task 6.2)
// ============================================================================

/// Check for file conflicts between local cache and remote
/// Requirements: 6.1, 6.2
#[tauri::command]
async fn check_file_conflict(
    state: tauri::State<'_, AppState>,
    server_id: String,
    remote_path: String,
) -> std::result::Result<ConflictStatus, String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    state.sync_engine.check_for_conflicts(&server, &remote_path)
        .await
        .map_err(|e| e.to_string())
}

/// Get diff between local cached content and remote content
/// Requirements: 6.4
#[tauri::command]
async fn get_file_diff(
    state: tauri::State<'_, AppState>,
    server_id: String,
    remote_path: String,
) -> std::result::Result<FileDiff, String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    state.conflict_resolver.get_diff(&server, &remote_path)
        .await
        .map_err(|e| e.to_string())
}

/// Resolve a file conflict using the specified resolution strategy
/// Requirements: 6.3, 6.5
#[tauri::command]
async fn resolve_conflict(
    state: tauri::State<'_, AppState>,
    server_id: String,
    remote_path: String,
    resolution: ConflictResolution,
) -> std::result::Result<(), String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    state.conflict_resolver.resolve_conflict(&server, &remote_path, resolution)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Editor Settings Commands (Task 6.3)
// ============================================================================

/// Editor settings structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorSettings {
    pub tab_size: i32,
    pub font_size: i32,
    pub font_family: String,
    pub word_wrap: bool,
    pub auto_save: bool,
    pub auto_save_interval: i32,
    pub theme: String,
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            tab_size: 4,
            font_size: 14,
            font_family: "Consolas, Monaco, monospace".to_string(),
            word_wrap: false,
            auto_save: false,
            auto_save_interval: 30,
            theme: "vs-dark".to_string(),
        }
    }
}

/// Get editor settings
/// Requirements: 7.1-7.6
#[tauri::command]
async fn get_editor_settings(
    app_handle: tauri::AppHandle,
) -> std::result::Result<EditorSettings, String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    let settings_path = app_data_dir.join("editor_settings.json");
    
    if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings: {}", e))
    } else {
        Ok(EditorSettings::default())
    }
}

/// Update editor settings
/// Requirements: 7.1-7.6
#[tauri::command]
async fn update_editor_settings(
    app_handle: tauri::AppHandle,
    settings: EditorSettings,
) -> std::result::Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    // Ensure directory exists
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create settings directory: {}", e))?;
    
    let settings_path = app_data_dir.join("editor_settings.json");
    
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    
    std::fs::write(&settings_path, content)
        .map_err(|e| format!("Failed to write settings: {}", e))?;
    
    Ok(())
}

// ============================================================================
// Script Management Commands (Task 10.1)
// ============================================================================

/// Create a new deployment script
/// Requirements: 1.1
#[tauri::command]
async fn create_script(
    state: tauri::State<'_, AppState>,
    input: CreateScriptInput,
) -> std::result::Result<DeploymentScript, String> {
    state.script_manager.lock().await
        .create_script(input)
        .await
        .map_err(|e| e.to_string())
}

/// Update an existing deployment script
/// Requirements: 1.3
#[tauri::command]
async fn update_script(
    state: tauri::State<'_, AppState>,
    id: String,
    input: UpdateScriptInput,
) -> std::result::Result<DeploymentScript, String> {
    state.script_manager.lock().await
        .update_script(&id, input)
        .await
        .map_err(|e| e.to_string())
}

/// Delete a deployment script
/// Requirements: 1.4
#[tauri::command]
async fn delete_script(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<(), String> {
    state.script_manager.lock().await
        .delete_script(&id)
        .await
        .map_err(|e| e.to_string())
}

/// List all deployment scripts
/// Requirements: 1.2
#[tauri::command]
async fn list_scripts(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<DeploymentScript>, String> {
    state.script_manager.lock().await
        .list_scripts()
        .await
        .map_err(|e| e.to_string())
}

/// Get a deployment script by ID
/// Requirements: 1.2
#[tauri::command]
async fn get_script(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<DeploymentScript, String> {
    state.script_manager.lock().await
        .get_script(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Script not found: {}", id))
}

/// Duplicate a deployment script
/// Requirements: 1.5
#[tauri::command]
async fn duplicate_script(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<DeploymentScript, String> {
    state.script_manager.lock().await
        .duplicate_script(&id)
        .await
        .map_err(|e| e.to_string())
}

/// Export a script to YAML format
/// Requirements: 1.6
#[tauri::command]
async fn export_script(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<String, String> {
    let script = state.script_manager.lock().await
        .get_script(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Script not found: {}", id))?;
    
    state.script_manager.lock().await
        .export_script(&script)
        .map_err(|e| e.to_string())
}

/// Import a script from YAML format
/// Requirements: 1.7
#[tauri::command]
async fn import_script(
    state: tauri::State<'_, AppState>,
    yaml: String,
) -> std::result::Result<DeploymentScript, String> {
    state.script_manager.lock().await
        .import_script(&yaml)
        .await
        .map_err(|e| e.to_string())
}

/// Validate a deployment script
/// Requirements: 2.5
#[tauri::command]
async fn validate_script(
    state: tauri::State<'_, AppState>,
    script: DeploymentScript,
) -> std::result::Result<ValidationResult, String> {
    Ok(state.script_manager.lock().await.validate_script(&script))
}

// ============================================================================
// Template Library Commands (Task 3.2)
// ============================================================================

/// List all available deployment script templates
/// Requirements: 3.1, 3.2
#[tauri::command]
async fn list_templates(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<TemplateInfo>, String> {
    Ok(state.template_library.list_templates())
}

/// Get a specific template by name
/// Requirements: 3.2
#[tauri::command]
async fn get_template(
    state: tauri::State<'_, AppState>,
    name: String,
) -> std::result::Result<DeploymentScript, String> {
    state.template_library.get_template(&name)
        .cloned()
        .ok_or_else(|| format!("Template not found: {}", name))
}

/// Create a new deployment script from a template
/// Requirements: 3.2, 3.3, 3.4
#[tauri::command]
async fn create_from_template(
    state: tauri::State<'_, AppState>,
    template_name: String,
) -> std::result::Result<DeploymentScript, String> {
    // Create script from template
    let script = state.template_library.create_from_template(&template_name)
        .ok_or_else(|| format!("Template not found: {}", template_name))?;
    
    // Save the new script to database
    let input = CreateScriptInput {
        name: script.name.clone(),
        description: script.description.clone(),
        variables: script.variables.clone(),
        steps: script.steps.clone(),
        rollback_steps: script.rollback_steps.clone(),
        tags: script.tags.clone(),
        is_template: false,
    };
    
    state.script_manager.lock().await
        .create_script(input)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Deployment History Commands (Task 6)
// ============================================================================

/// List deployments with optional filters
/// Requirements: 7.1, 7.2
#[tauri::command]
async fn list_deployments(
    state: tauri::State<'_, AppState>,
    filters: DeploymentFilters,
) -> std::result::Result<Vec<Deployment>, String> {
    state.deployment_logger.list_deployments(filters)
        .await
        .map_err(|e| e.to_string())
}

/// Get a deployment by ID with its logs
/// Requirements: 7.1, 7.3
#[tauri::command]
async fn get_deployment(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<Deployment, String> {
    state.deployment_logger.get_deployment(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Deployment not found: {}", id))
}

/// Get logs for a deployment
/// Requirements: 7.3
#[tauri::command]
async fn get_deployment_logs(
    state: tauri::State<'_, AppState>,
    deployment_id: String,
) -> std::result::Result<Vec<DeploymentLog>, String> {
    state.deployment_logger.get_deployment_logs(&deployment_id)
        .await
        .map_err(|e| e.to_string())
}

/// Export deployment logs to specified format
/// Requirements: 7.4
#[tauri::command]
async fn export_deployment_logs(
    state: tauri::State<'_, AppState>,
    deployment_id: String,
    format: String,
) -> std::result::Result<String, String> {
    let export_format: ExportFormat = format.parse()
        .map_err(|e: String| e)?;
    
    state.deployment_logger.export_deployment_logs(&deployment_id, export_format)
        .await
        .map_err(|e| e.to_string())
}

/// Search within deployment logs
/// Requirements: 7.5
#[tauri::command]
async fn search_deployment_logs(
    state: tauri::State<'_, AppState>,
    deployment_id: String,
    search_term: String,
) -> std::result::Result<Vec<DeploymentLog>, String> {
    state.deployment_logger.search_logs(&deployment_id, &search_term)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Execution Commands (Task 10.3)
// ============================================================================

/// Start a deployment execution
/// Requirements: 5.1, 5.2
#[tauri::command]
async fn start_deployment(
    state: tauri::State<'_, AppState>,
    config: ExecutionConfig,
) -> std::result::Result<Deployment, String> {
    // Get the script
    let script = state.script_manager.lock().await
        .get_script(&config.script_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Script not found: {}", config.script_id))?;
    
    // Execute the deployment
    state.script_engine.execute(&script, config)
        .await
        .map_err(|e| e.to_string())
}

/// Cancel a running deployment
/// Requirements: 6.6
#[tauri::command]
async fn cancel_deployment(
    state: tauri::State<'_, AppState>,
    deployment_id: String,
) -> std::result::Result<(), String> {
    state.script_engine.cancel(&deployment_id)
        .await
        .map_err(|e| e.to_string())
}

/// Execute a dry-run deployment (show commands without executing)
/// Requirements: 5.8
#[tauri::command]
async fn dry_run_deployment(
    state: tauri::State<'_, AppState>,
    config: ExecutionConfig,
) -> std::result::Result<DryRunResult, String> {
    // Get the script
    let script = state.script_manager.lock().await
        .get_script(&config.script_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Script not found: {}", config.script_id))?;
    
    // Execute dry-run
    state.script_engine.execute_dry_run(&script, config)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Rollback Commands (Task 8)
// ============================================================================

/// Execute rollback for a deployment
/// Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
#[tauri::command]
async fn rollback_deployment(
    state: tauri::State<'_, AppState>,
    deployment_id: String,
) -> std::result::Result<Deployment, String> {
    state.rollback_manager.execute_rollback(&deployment_id)
        .await
        .map_err(|e| e.to_string())
}

/// Check if a deployment can be rolled back
/// Requirements: 8.1
#[tauri::command]
async fn can_rollback_deployment(
    state: tauri::State<'_, AppState>,
    deployment_id: String,
) -> std::result::Result<bool, String> {
    state.rollback_manager.can_rollback(&deployment_id)
        .await
        .map_err(|e| e.to_string())
}

/// Get rollback information for a deployment
/// Requirements: 8.1, 8.2
#[tauri::command]
async fn get_rollback_info(
    state: tauri::State<'_, AppState>,
    deployment_id: String,
) -> std::result::Result<RollbackInfo, String> {
    state.rollback_manager.get_rollback_info(&deployment_id)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Transfer Commands (Phase 4 - Task 5)
// ============================================================================

/// Queue multiple files for upload
/// Requirements: 3.1, 3.3
#[tauri::command]
async fn queue_uploads(
    state: tauri::State<'_, AppState>,
    server_id: String,
    transfers: Vec<TransferRequest>,
) -> std::result::Result<Vec<String>, String> {
    state.transfer_manager
        .queue_uploads(&server_id, transfers)
        .await
        .map_err(|e| e.to_string())
}

/// Queue multiple files for download
/// Requirements: 3.2, 3.3
#[tauri::command]
async fn queue_downloads(
    state: tauri::State<'_, AppState>,
    server_id: String,
    transfers: Vec<TransferRequest>,
) -> std::result::Result<Vec<String>, String> {
    state.transfer_manager
        .queue_downloads(&server_id, transfers)
        .await
        .map_err(|e| e.to_string())
}

/// Cancel a transfer
/// Requirements: 3.6
#[tauri::command]
async fn cancel_transfer(
    state: tauri::State<'_, AppState>,
    transfer_id: String,
) -> std::result::Result<(), String> {
    state.transfer_manager
        .cancel_transfer(&transfer_id)
        .await
        .map_err(|e| e.to_string())
}

/// Get status of a specific transfer
/// Requirements: 3.3
#[tauri::command]
async fn get_transfer_status(
    state: tauri::State<'_, AppState>,
    transfer_id: String,
) -> std::result::Result<TransferStatus, String> {
    state.transfer_manager
        .get_transfer_status(&transfer_id)
        .await
        .map_err(|e| e.to_string())
}

/// Get all transfers
/// Requirements: 3.3
#[tauri::command]
async fn get_all_transfers(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<TransferStatus>, String> {
    Ok(state.transfer_manager.get_all_transfers().await)
}

/// Set transfer speed limit
/// Requirements: 3.8
#[tauri::command]
async fn set_transfer_speed_limit(
    state: tauri::State<'_, AppState>,
    bytes_per_second: Option<u64>,
) -> std::result::Result<(), String> {
    state.transfer_manager
        .set_speed_limit(bytes_per_second)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Monitoring Commands (Phase 4 - Task 6)
// ============================================================================

/// Get metrics for a specific server
/// Requirements: 4.2
#[tauri::command]
async fn get_server_metrics(
    state: tauri::State<'_, AppState>,
    server_id: String,
) -> std::result::Result<ServerMetrics, String> {
    let server = state.server_manager.lock().await
        .get_server(&server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    state.monitor_service
        .get_server_metrics(&server)
        .map_err(|e| e.to_string())
}

/// Get status of all servers
/// Requirements: 4.1
#[tauri::command]
async fn get_all_server_status(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<ServerStatus>, String> {
    state.monitor_service
        .get_all_server_status()
        .await
        .map_err(|e| e.to_string())
}

/// Get metrics history for a server
/// Requirements: 4.5
#[tauri::command]
async fn get_metrics_history(
    state: tauri::State<'_, AppState>,
    server_id: String,
    metric: String,
    hours: u32,
) -> std::result::Result<Vec<MetricPoint>, String> {
    let metric_type: MetricType = metric.parse()
        .map_err(|e: String| e)?;
    
    state.monitor_service
        .get_metrics_history(&server_id, metric_type, hours)
        .await
        .map_err(|e| e.to_string())
}

/// Create a new alert
/// Requirements: 4.3, 4.6
#[tauri::command]
async fn create_alert(
    state: tauri::State<'_, AppState>,
    input: CreateAlertInput,
) -> std::result::Result<AlertConfig, String> {
    state.monitor_service
        .create_alert(input)
        .await
        .map_err(|e| e.to_string())
}

/// List all alerts
/// Requirements: 4.3
#[tauri::command]
async fn list_alerts(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<AlertConfig>, String> {
    state.monitor_service
        .list_alerts()
        .await
        .map_err(|e| e.to_string())
}

/// Update an alert
/// Requirements: 4.3
#[tauri::command]
async fn update_alert(
    state: tauri::State<'_, AppState>,
    id: String,
    input: UpdateAlertInput,
) -> std::result::Result<AlertConfig, String> {
    state.monitor_service
        .update_alert(&id, input)
        .await
        .map_err(|e| e.to_string())
}

/// Delete an alert
/// Requirements: 4.3
#[tauri::command]
async fn delete_alert(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<(), String> {
    state.monitor_service
        .delete_alert(&id)
        .await
        .map_err(|e| e.to_string())
}

/// Check alerts and return triggered ones
/// Requirements: 4.6
#[tauri::command]
async fn check_alerts(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<Alert>, String> {
    state.monitor_service
        .check_alerts()
        .await
        .map_err(|e| e.to_string())
}

/// Start monitoring with specified interval
/// Requirements: 4.7
#[tauri::command]
async fn start_monitoring(
    state: tauri::State<'_, AppState>,
    interval_secs: u64,
) -> std::result::Result<(), String> {
    state.monitor_service
        .start_monitoring(interval_secs)
        .await;
    Ok(())
}

/// Stop monitoring
/// Requirements: 4.7
#[tauri::command]
async fn stop_monitoring(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<(), String> {
    state.monitor_service.stop_monitoring();
    Ok(())
}

/// Run a single monitoring cycle manually
#[tauri::command]
async fn run_monitoring_cycle(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<(), String> {
    state.monitor_service
        .run_monitoring_cycle()
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Snippet Library Commands (Phase 4 - Task 7)
// ============================================================================

/// Create a new snippet
/// Requirements: 5.1
#[tauri::command]
async fn create_snippet(
    state: tauri::State<'_, AppState>,
    input: CreateSnippetInput,
) -> std::result::Result<Snippet, String> {
    state.snippet_library.lock().await
        .create_snippet(input)
        .await
        .map_err(|e| e.to_string())
}

/// Get a snippet by ID
/// Requirements: 5.2
#[tauri::command]
async fn get_snippet(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<Snippet, String> {
    state.snippet_library.lock().await
        .get_snippet(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Snippet not found: {}", id))
}

/// List all snippets
/// Requirements: 5.2
#[tauri::command]
async fn list_snippets(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<Snippet>, String> {
    state.snippet_library.lock().await
        .list_snippets()
        .await
        .map_err(|e| e.to_string())
}

/// List snippets by category
/// Requirements: 5.2
#[tauri::command]
async fn list_snippets_by_category(
    state: tauri::State<'_, AppState>,
    category: String,
) -> std::result::Result<Vec<Snippet>, String> {
    state.snippet_library.lock().await
        .list_by_category(&category)
        .await
        .map_err(|e| e.to_string())
}

/// Search snippets by name or command content
/// Requirements: 5.3
#[tauri::command]
async fn search_snippets(
    state: tauri::State<'_, AppState>,
    query: String,
) -> std::result::Result<Vec<Snippet>, String> {
    state.snippet_library.lock().await
        .search_snippets(&query)
        .await
        .map_err(|e| e.to_string())
}

/// Update a snippet
/// Requirements: 5.1
#[tauri::command]
async fn update_snippet(
    state: tauri::State<'_, AppState>,
    id: String,
    input: UpdateSnippetInput,
) -> std::result::Result<Snippet, String> {
    state.snippet_library.lock().await
        .update_snippet(&id, input)
        .await
        .map_err(|e| e.to_string())
}

/// Delete a snippet
/// Requirements: 5.1
#[tauri::command]
async fn delete_snippet(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<(), String> {
    state.snippet_library.lock().await
        .delete_snippet(&id)
        .await
        .map_err(|e| e.to_string())
}

/// Export all snippets to JSON
/// Requirements: 5.6
#[tauri::command]
async fn export_snippets(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<String, String> {
    state.snippet_library.lock().await
        .export_snippets()
        .await
        .map_err(|e| e.to_string())
}

/// Import snippets from JSON
/// Requirements: 5.7
#[tauri::command]
async fn import_snippets(
    state: tauri::State<'_, AppState>,
    json: String,
) -> std::result::Result<SnippetImportResult, String> {
    state.snippet_library.lock().await
        .import_snippets(&json)
        .await
        .map_err(|e| e.to_string())
}

/// List all unique snippet categories
#[tauri::command]
async fn list_snippet_categories(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<String>, String> {
    state.snippet_library.lock().await
        .list_categories()
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Favorites & Activity Commands (Phase 4 - Task 9.6)
// ============================================================================

/// Add an item to favorites
/// Requirements: 7.2
#[tauri::command]
async fn add_favorite(
    state: tauri::State<'_, AppState>,
    item_type: String,
    item_id: String,
) -> std::result::Result<Favorite, String> {
    let fav_type: FavoriteType = item_type.parse()
        .map_err(|e: String| e)?;
    
    state.favorites_manager.lock().await
        .add_favorite(fav_type, &item_id)
        .await
        .map_err(|e| e.to_string())
}

/// Remove an item from favorites
/// Requirements: 7.2
#[tauri::command]
async fn remove_favorite(
    state: tauri::State<'_, AppState>,
    item_type: String,
    item_id: String,
) -> std::result::Result<(), String> {
    let fav_type: FavoriteType = item_type.parse()
        .map_err(|e: String| e)?;
    
    state.favorites_manager.lock().await
        .remove_favorite(fav_type, &item_id)
        .await
        .map_err(|e| e.to_string())
}

/// List all favorites
/// Requirements: 7.2
#[tauri::command]
async fn list_favorites(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<Favorite>, String> {
    state.favorites_manager.lock().await
        .list_favorites()
        .await
        .map_err(|e| e.to_string())
}

/// List favorites by type
#[tauri::command]
async fn list_favorites_by_type(
    state: tauri::State<'_, AppState>,
    item_type: String,
) -> std::result::Result<Vec<Favorite>, String> {
    let fav_type: FavoriteType = item_type.parse()
        .map_err(|e: String| e)?;
    
    state.favorites_manager.lock().await
        .list_favorites_by_type(fav_type)
        .await
        .map_err(|e| e.to_string())
}

/// Check if an item is favorited
#[tauri::command]
async fn is_favorite(
    state: tauri::State<'_, AppState>,
    item_type: String,
    item_id: String,
) -> std::result::Result<bool, String> {
    let fav_type: FavoriteType = item_type.parse()
        .map_err(|e: String| e)?;
    
    state.favorites_manager.lock().await
        .is_favorite(fav_type, &item_id)
        .await
        .map_err(|e| e.to_string())
}

/// Log an activity
#[tauri::command]
async fn log_activity(
    state: tauri::State<'_, AppState>,
    action: String,
    item_type: Option<String>,
    item_id: Option<String>,
    details: Option<String>,
) -> std::result::Result<ActivityLog, String> {
    let input = CreateActivityInput {
        action,
        item_type,
        item_id,
        details,
    };
    
    state.favorites_manager.lock().await
        .log_activity(input)
        .await
        .map_err(|e| e.to_string())
}

/// Get recent activity
/// Requirements: 7.4
#[tauri::command]
async fn get_recent_activity(
    state: tauri::State<'_, AppState>,
    limit: u32,
) -> std::result::Result<Vec<ActivityLog>, String> {
    state.favorites_manager.lock().await
        .get_recent_activity(limit)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Nginx Management Commands
// ============================================================================

/// Get Nginx status on a server
#[tauri::command]
async fn nginx_get_status(
    state: tauri::State<'_, AppState>,
    server_id: String,
) -> std::result::Result<NginxStatus, String> {
    state.nginx_manager
        .get_status(&server_id)
        .await
        .map_err(|e| e.to_string())
}

/// List all domains on a server
#[tauri::command]
async fn nginx_list_domains(
    state: tauri::State<'_, AppState>,
    server_id: String,
) -> std::result::Result<Vec<NginxDomain>, String> {
    state.nginx_manager
        .list_domains(&server_id)
        .await
        .map_err(|e| e.to_string())
}

/// Create a new domain
#[tauri::command]
async fn nginx_create_domain(
    state: tauri::State<'_, AppState>,
    input: CreateDomainInput,
) -> std::result::Result<NginxDomain, String> {
    state.nginx_manager
        .create_domain(input)
        .await
        .map_err(|e| e.to_string())
}

/// Update a domain
#[tauri::command]
async fn nginx_update_domain(
    state: tauri::State<'_, AppState>,
    server_id: String,
    domain_name: String,
    input: UpdateDomainInput,
) -> std::result::Result<NginxDomain, String> {
    state.nginx_manager
        .update_domain(&server_id, &domain_name, input)
        .await
        .map_err(|e| e.to_string())
}

/// Delete a domain
#[tauri::command]
async fn nginx_delete_domain(
    state: tauri::State<'_, AppState>,
    server_id: String,
    domain_name: String,
) -> std::result::Result<(), String> {
    state.nginx_manager
        .delete_domain(&server_id, &domain_name)
        .await
        .map_err(|e| e.to_string())
}

/// Enable or disable a domain
#[tauri::command]
async fn nginx_toggle_domain(
    state: tauri::State<'_, AppState>,
    server_id: String,
    domain_name: String,
    enable: bool,
) -> std::result::Result<(), String> {
    state.nginx_manager
        .toggle_domain(&server_id, &domain_name, enable)
        .await
        .map_err(|e| e.to_string())
}

/// Get domain config content
#[tauri::command]
async fn nginx_get_domain_config(
    state: tauri::State<'_, AppState>,
    server_id: String,
    domain_name: String,
) -> std::result::Result<String, String> {
    state.nginx_manager
        .get_domain_config(&server_id, &domain_name)
        .await
        .map_err(|e| e.to_string())
}

/// Save domain config content
#[tauri::command]
async fn nginx_save_domain_config(
    state: tauri::State<'_, AppState>,
    server_id: String,
    domain_name: String,
    content: String,
) -> std::result::Result<(), String> {
    state.nginx_manager
        .save_domain_config(&server_id, &domain_name, &content)
        .await
        .map_err(|e| e.to_string())
}

/// Issue SSL certificate using Certbot
#[tauri::command]
async fn nginx_issue_ssl(
    state: tauri::State<'_, AppState>,
    server_id: String,
    domain_name: String,
    email: String,
) -> std::result::Result<SslResult, String> {
    state.nginx_manager
        .issue_ssl(&server_id, &domain_name, &email)
        .await
        .map_err(|e| e.to_string())
}

/// Renew SSL certificates
#[tauri::command]
async fn nginx_renew_ssl(
    state: tauri::State<'_, AppState>,
    server_id: String,
) -> std::result::Result<String, String> {
    state.nginx_manager
        .renew_ssl(&server_id)
        .await
        .map_err(|e| e.to_string())
}

/// List SSL certificates
#[tauri::command]
async fn nginx_list_ssl_certificates(
    state: tauri::State<'_, AppState>,
    server_id: String,
) -> std::result::Result<Vec<SslCertificate>, String> {
    state.nginx_manager
        .list_ssl_certificates(&server_id)
        .await
        .map_err(|e| e.to_string())
}

/// Get available config snippets
#[tauri::command]
async fn nginx_get_snippets(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<ConfigSnippet>, String> {
    Ok(state.nginx_manager.get_snippets())
}

/// Restart Nginx
#[tauri::command]
async fn nginx_restart(
    state: tauri::State<'_, AppState>,
    server_id: String,
) -> std::result::Result<(), String> {
    state.nginx_manager
        .restart_nginx(&server_id)
        .await
        .map_err(|e| e.to_string())
}

/// Start Nginx
#[tauri::command]
async fn nginx_start(
    state: tauri::State<'_, AppState>,
    server_id: String,
) -> std::result::Result<(), String> {
    state.nginx_manager
        .start_nginx(&server_id)
        .await
        .map_err(|e| e.to_string())
}

/// Stop Nginx
#[tauri::command]
async fn nginx_stop(
    state: tauri::State<'_, AppState>,
    server_id: String,
) -> std::result::Result<(), String> {
    state.nginx_manager
        .stop_nginx(&server_id)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// SSH Key Management Commands
// ============================================================================

/// Generate a new SSH key pair
#[tauri::command]
async fn generate_ssh_key(
    state: tauri::State<'_, AppState>,
    input: CreateSshKeyInput,
) -> std::result::Result<GeneratedKey, String> {
    state.ssh_key_manager
        .generate_key(input)
        .await
        .map_err(|e| e.to_string())
}

/// List all SSH keys (without private key data)
#[tauri::command]
async fn list_ssh_keys(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<SshKey>, String> {
    state.ssh_key_manager
        .list_keys()
        .await
        .map_err(|e| e.to_string())
}

/// Get a specific SSH key by ID
#[tauri::command]
async fn get_ssh_key(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<SshKey, String> {
    state.ssh_key_manager
        .get_key(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("SSH key not found: {}", id))
}

/// Delete an SSH key
#[tauri::command]
async fn delete_ssh_key(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<(), String> {
    state.ssh_key_manager
        .delete_key(&id)
        .await
        .map_err(|e| e.to_string())
}

/// Update SSH key name/comment
#[tauri::command]
async fn update_ssh_key(
    state: tauri::State<'_, AppState>,
    id: String,
    name: Option<String>,
    comment: Option<String>,
) -> std::result::Result<SshKey, String> {
    state.ssh_key_manager
        .update_key(&id, name, comment)
        .await
        .map_err(|e| e.to_string())
}

/// Export public key in OpenSSH format
#[tauri::command]
async fn export_ssh_public_key(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<String, String> {
    state.ssh_key_manager
        .export_public_key(&id)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Database Management Commands
// ============================================================================

/// Add a database connection
#[tauri::command]
async fn db_add_connection(
    state: tauri::State<'_, AppState>,
    input: CreateConnectionInput,
) -> std::result::Result<DatabaseConnection, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let conn = DatabaseConnection {
        id: uuid::Uuid::new_v4().to_string(),
        server_id: input.server_id,
        name: input.name,
        db_type: input.db_type,
        host: input.host,
        port: input.port,
        username: input.username,
        password: input.password,
        database: input.database,
        created_at: now.clone(),
        updated_at: now,
    };
    
    state.database_manager.add_connection(conn.clone()).await
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

/// List all database connections
#[tauri::command]
async fn db_list_connections(
    state: tauri::State<'_, AppState>,
) -> std::result::Result<Vec<DatabaseConnection>, String> {
    Ok(state.database_manager.list_connections().await)
}

/// Get a database connection by ID
#[tauri::command]
async fn db_get_connection(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<DatabaseConnection, String> {
    state.database_manager
        .get_connection(&id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", id))
}

/// Remove a database connection
#[tauri::command]
async fn db_remove_connection(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<(), String> {
    state.database_manager.remove_connection(&id).await
        .map_err(|e| e.to_string())
}

/// Test database connection
#[tauri::command]
async fn db_test_connection(
    state: tauri::State<'_, AppState>,
    connection_id: String,
) -> std::result::Result<ConnectionTestResult, String> {
    let conn = state.database_manager
        .get_connection(&connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .test_connection(&server, &conn)
        .map_err(|e| e.to_string())
}

/// Test database connection using input (before saving)
#[tauri::command]
async fn db_test_connection_input(
    state: tauri::State<'_, AppState>,
    input: CreateConnectionInput,
) -> std::result::Result<ConnectionTestResult, String> {
    let server = state.server_manager.lock().await
        .get_server(&input.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", input.server_id))?;
    
    // Create a temporary connection object for testing
    let conn = DatabaseConnection {
        id: String::new(),
        server_id: input.server_id,
        name: input.name,
        db_type: input.db_type,
        host: input.host,
        port: input.port,
        username: input.username,
        password: input.password,
        database: input.database,
        created_at: String::new(),
        updated_at: String::new(),
    };
    
    state.database_manager
        .test_connection(&server, &conn)
        .map_err(|e| e.to_string())
}

/// List databases
#[tauri::command]
async fn db_list_databases(
    state: tauri::State<'_, AppState>,
    connection_id: String,
) -> std::result::Result<Vec<DatabaseInfo>, String> {
    let conn = state.database_manager
        .get_connection(&connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .list_databases(&server, &conn)
        .map_err(|e| e.to_string())
}

/// List tables in a database
#[tauri::command]
async fn db_list_tables(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    database: String,
) -> std::result::Result<Vec<TableInfo>, String> {
    let conn = state.database_manager
        .get_connection(&connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .list_tables(&server, &conn, &database)
        .map_err(|e| e.to_string())
}

/// Get table columns
#[tauri::command]
async fn db_get_columns(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    database: String,
    table: String,
) -> std::result::Result<Vec<ColumnInfo>, String> {
    let conn = state.database_manager
        .get_connection(&connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .get_table_columns(&server, &conn, &database, &table)
        .map_err(|e| e.to_string())
}

/// Get table indexes
#[tauri::command]
async fn db_get_indexes(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    database: String,
    table: String,
) -> std::result::Result<Vec<IndexInfo>, String> {
    let conn = state.database_manager
        .get_connection(&connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .get_table_indexes(&server, &conn, &database, &table)
        .map_err(|e| e.to_string())
}

/// Execute a SQL query
#[tauri::command]
async fn db_execute_query(
    state: tauri::State<'_, AppState>,
    input: ExecuteQueryInput,
) -> std::result::Result<QueryResult, String> {
    let conn = state.database_manager
        .get_connection(&input.connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", input.connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .execute_query(&server, &conn, &input.database, &input.query)
        .map_err(|e| e.to_string())
}

/// Get table data with pagination
#[tauri::command]
async fn db_get_table_data(
    state: tauri::State<'_, AppState>,
    input: FetchTableDataInput,
) -> std::result::Result<TableData, String> {
    let conn = state.database_manager
        .get_connection(&input.connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", input.connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .get_table_data(&server, &conn, &input)
        .map_err(|e| e.to_string())
}

/// Update a row
#[tauri::command]
async fn db_update_row(
    state: tauri::State<'_, AppState>,
    input: UpdateRowInput,
) -> std::result::Result<i64, String> {
    let conn = state.database_manager
        .get_connection(&input.connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", input.connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .update_row(&server, &conn, &input)
        .map_err(|e| e.to_string())
}

/// Insert a row
#[tauri::command]
async fn db_insert_row(
    state: tauri::State<'_, AppState>,
    input: InsertRowInput,
) -> std::result::Result<i64, String> {
    let conn = state.database_manager
        .get_connection(&input.connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", input.connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .insert_row(&server, &conn, &input)
        .map_err(|e| e.to_string())
}

/// Delete rows
#[tauri::command]
async fn db_delete_rows(
    state: tauri::State<'_, AppState>,
    input: DeleteRowsInput,
) -> std::result::Result<i64, String> {
    let conn = state.database_manager
        .get_connection(&input.connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", input.connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .delete_rows(&server, &conn, &input)
        .map_err(|e| e.to_string())
}

/// List database users
#[tauri::command]
async fn db_list_users(
    state: tauri::State<'_, AppState>,
    connection_id: String,
) -> std::result::Result<Vec<DatabaseUser>, String> {
    let conn = state.database_manager
        .get_connection(&connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .list_users(&server, &conn)
        .map_err(|e| e.to_string())
}

/// Create a database user
#[tauri::command]
async fn db_create_user(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    input: CreateUserInput,
) -> std::result::Result<(), String> {
    let conn = state.database_manager
        .get_connection(&connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .create_user(&server, &conn, &input)
        .map_err(|e| e.to_string())
}

/// Drop a database user
#[tauri::command]
async fn db_drop_user(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    username: String,
    host: String,
) -> std::result::Result<(), String> {
    let conn = state.database_manager
        .get_connection(&connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .drop_user(&server, &conn, &username, &host)
        .map_err(|e| e.to_string())
}

/// Create a database
#[tauri::command]
async fn db_create_database(
    state: tauri::State<'_, AppState>,
    input: CreateDatabaseInput,
) -> std::result::Result<(), String> {
    let conn = state.database_manager
        .get_connection(&input.connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", input.connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .create_database(&server, &conn, &input)
        .map_err(|e| e.to_string())
}

/// Drop a database
#[tauri::command]
async fn db_drop_database(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    database: String,
) -> std::result::Result<(), String> {
    let conn = state.database_manager
        .get_connection(&connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .drop_database(&server, &conn, &database)
        .map_err(|e| e.to_string())
}

/// Get user privileges
#[tauri::command]
async fn db_get_user_privileges(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    username: String,
    host: String,
) -> std::result::Result<Vec<String>, String> {
    let conn = state.database_manager
        .get_connection(&connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .get_user_privileges(&server, &conn, &username, &host)
        .map_err(|e| e.to_string())
}

/// Grant privileges to a user
#[tauri::command]
async fn db_grant_privileges(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    username: String,
    host: String,
    privileges: Vec<String>,
    database: Option<String>,
) -> std::result::Result<(), String> {
    let conn = state.database_manager
        .get_connection(&connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .grant_privileges(&server, &conn, &username, &host, &privileges, database.as_deref())
        .map_err(|e| e.to_string())
}

/// Revoke privileges from a user
#[tauri::command]
async fn db_revoke_privileges(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    username: String,
    host: String,
    privileges: Vec<String>,
    database: Option<String>,
) -> std::result::Result<(), String> {
    let conn = state.database_manager
        .get_connection(&connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .revoke_privileges(&server, &conn, &username, &host, &privileges, database.as_deref())
        .map_err(|e| e.to_string())
}

/// Change user password
#[tauri::command]
async fn db_change_user_password(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    username: String,
    host: String,
    new_password: String,
) -> std::result::Result<(), String> {
    let conn = state.database_manager
        .get_connection(&connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .change_user_password(&server, &conn, &username, &host, &new_password)
        .map_err(|e| e.to_string())
}

/// Get query history
#[tauri::command]
async fn db_get_query_history(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    limit: i32,
) -> std::result::Result<Vec<QueryHistoryEntry>, String> {
    state.database_manager
        .get_query_history(&connection_id, limit)
        .await
        .map_err(|e| e.to_string())
}

/// Clear query history
#[tauri::command]
async fn db_clear_query_history(
    state: tauri::State<'_, AppState>,
    connection_id: String,
) -> std::result::Result<(), String> {
    state.database_manager
        .clear_query_history(&connection_id)
        .await
        .map_err(|e| e.to_string())
}

/// Save a query
#[tauri::command]
async fn db_save_query(
    state: tauri::State<'_, AppState>,
    input: SaveQueryInput,
) -> std::result::Result<SavedQuery, String> {
    state.database_manager
        .save_query(input)
        .await
        .map_err(|e| e.to_string())
}

/// Get saved queries
#[tauri::command]
async fn db_get_saved_queries(
    state: tauri::State<'_, AppState>,
    connection_id: Option<String>,
) -> std::result::Result<Vec<SavedQuery>, String> {
    state.database_manager
        .get_saved_queries(connection_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Delete a saved query
#[tauri::command]
async fn db_delete_saved_query(
    state: tauri::State<'_, AppState>,
    id: String,
) -> std::result::Result<(), String> {
    state.database_manager
        .delete_saved_query(&id)
        .await
        .map_err(|e| e.to_string())
}

/// Update a database connection
#[tauri::command]
async fn db_update_connection(
    state: tauri::State<'_, AppState>,
    id: String,
    input: UpdateConnectionInput,
) -> std::result::Result<(), String> {
    state.database_manager
        .update_connection(&id, input)
        .await
        .map_err(|e| e.to_string())
}

/// Create a table
#[tauri::command]
async fn db_create_table(
    state: tauri::State<'_, AppState>,
    input: CreateTableInput,
) -> std::result::Result<(), String> {
    let conn = state.database_manager
        .get_connection(&input.connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", input.connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .create_table(&server, &conn, &input)
        .map_err(|e| e.to_string())
}

/// Drop a table
#[tauri::command]
async fn db_drop_table(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    database: String,
    table: String,
) -> std::result::Result<(), String> {
    let conn = state.database_manager
        .get_connection(&connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .drop_table(&server, &conn, &database, &table)
        .map_err(|e| e.to_string())
}

/// Truncate a table
#[tauri::command]
async fn db_truncate_table(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    database: String,
    table: String,
) -> std::result::Result<(), String> {
    let conn = state.database_manager
        .get_connection(&connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .truncate_table(&server, &conn, &database, &table)
        .map_err(|e| e.to_string())
}

/// Search data in table
#[tauri::command]
async fn db_search_table_data(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    database: String,
    table: String,
    search_term: String,
    columns: Vec<String>,
    page: Option<i32>,
    page_size: Option<i32>,
) -> std::result::Result<TableData, String> {
    let conn = state.database_manager
        .get_connection(&connection_id)
        .await
        .ok_or_else(|| format!("Connection not found: {}", connection_id))?;
    
    let server = state.server_manager.lock().await
        .get_server(&conn.server_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Server not found: {}", conn.server_id))?;
    
    state.database_manager
        .search_table_data(
            &server,
            &conn,
            &database,
            &table,
            &search_term,
            &columns,
            page.unwrap_or(1),
            page_size.unwrap_or(50),
        )
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            tauri::async_runtime::block_on(async move {
                // Get app data directory
                let app_data_dir = app_handle.path().app_data_dir()
                    .expect("Failed to get app data directory");

                // Initialize database
                let db_pool = init_database(&app_data_dir)
                    .await
                    .expect("Failed to initialize database");

                // Initialize components
                let credential_store = Arc::new(CredentialStore::new());
                let connection_pool = Arc::new(ConnectionPool::new(10));
                let server_manager = Arc::new(Mutex::new(
                    ServerManager::new(db_pool.clone(), credential_store.clone())
                ));
                let group_manager = Arc::new(Mutex::new(
                    GroupManager::new(db_pool.clone())
                ));
                let script_manager = Arc::new(Mutex::new(
                    ScriptManager::new(db_pool.clone())
                ));
                let template_library = Arc::new(TemplateLibrary::new());
                let ssh_client = Arc::new(SshClient::new(connection_pool, credential_store.clone()));
                let file_browser = Arc::new(FileBrowser::new(credential_store.clone()));
                let terminal_manager = Arc::new(TerminalManager::new(credential_store.clone()));

                // Initialize cache manager
                let cache_dir = app_data_dir.join("file_cache");
                let cache_manager = Arc::new(CacheManager::new(cache_dir, db_pool.clone()));
                cache_manager.init().await.expect("Failed to initialize cache manager");

                // Initialize deployment logger
                let deployment_logger = Arc::new(DeploymentLogger::with_app_handle(
                    db_pool.clone(),
                    app_handle.clone(),
                ));

                // Initialize rollback manager
                let rollback_manager = Arc::new(RollbackManager::new(
                    script_manager.clone(),
                    deployment_logger.clone(),
                    ssh_client.clone(),
                    server_manager.clone(),
                    credential_store.clone(),
                ));

                // Initialize script engine
                let script_engine = Arc::new(ScriptEngine::new(
                    ssh_client.clone(),
                    credential_store.clone(),
                    deployment_logger.clone(),
                    server_manager.clone(),
                ));

                // Initialize file manager
                let file_manager = Arc::new(FileManager::new(
                    credential_store.clone(),
                    cache_manager.clone(),
                ));

                // Initialize sync engine
                let sync_engine = Arc::new(SyncEngine::new(
                    file_manager.clone(),
                    cache_manager.clone(),
                ));

                // Initialize conflict resolver
                let conflict_resolver = Arc::new(ConflictResolver::new(sync_engine.clone()));
                
                // Initialize local terminal manager
                let local_terminal_manager = Arc::new(terminal::LocalTerminalManager::new());

                // Initialize batch executor (Phase 4 - Task 3)
                let batch_executor = Arc::new(BatchExecutor::new(
                    ssh_client.clone(),
                    server_manager.clone(),
                ));
                batch_executor.set_app_handle(app_handle.clone()).await;

                // Initialize transfer manager (Phase 4 - Task 5)
                let transfer_manager = Arc::new(TransferManager::new(
                    credential_store.clone(),
                    server_manager.clone(),
                ));
                transfer_manager.set_app_handle(app_handle.clone()).await;

                // Initialize monitor service (Phase 4 - Task 6)
                let monitor_service = Arc::new(MonitorService::new(
                    ssh_client.clone(),
                    server_manager.clone(),
                    db_pool.clone(),
                ));
                monitor_service.set_app_handle(app_handle.clone()).await;

                // Initialize snippet library (Phase 4 - Task 7)
                let snippet_library = Arc::new(Mutex::new(
                    SnippetLibrary::new(db_pool.clone())
                ));

                // Seed default snippets if none exist
                {
                    let lib = snippet_library.lock().await;
                    if let Err(e) = lib.seed_default_snippets().await {
                        eprintln!("Failed to seed default snippets: {}", e);
                    }
                }

                // Initialize favorites manager (Phase 4 - Task 9.6)
                let favorites_manager = Arc::new(Mutex::new(
                    FavoritesManager::new(db_pool.clone())
                ));

                // Initialize SSH key manager
                let ssh_key_manager = Arc::new(SshKeyManager::new(db_pool.clone()));

                // Initialize Nginx manager
                let nginx_manager = Arc::new(NginxManager::new(
                    ssh_client.clone(),
                    server_manager.clone(),
                ));

                // Initialize Database manager
                let database_manager = Arc::new(DatabaseManager::new(
                    ssh_client.clone(),
                    db_pool.clone(),
                ));

                // Create app state
                let state = AppState {
                    server_manager,
                    group_manager,
                    script_manager,
                    template_library,
                    deployment_logger,
                    rollback_manager,
                    script_engine,
                    batch_executor,
                    monitor_service,
                    snippet_library,
                    favorites_manager,
                    nginx_manager,
                    database_manager,
                    ssh_client,
                    ssh_key_manager,
                    file_browser,
                    file_manager,
                    cache_manager,
                    sync_engine,
                    conflict_resolver,
                    terminal_manager,
                    local_terminal_manager,
                    credential_store,
                    active_streams: Arc::new(Mutex::new(HashSet::new())),
                    active_local_streams: Arc::new(Mutex::new(HashSet::new())),
                    transfer_manager,
                };

                app_handle.manage(state);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Server commands
            list_servers,
            add_server,
            update_server,
            delete_server,
            test_connection,
            get_server_info,
            check_duplicate_server,
            // Server group commands (Phase 4 - Task 2)
            create_group,
            list_groups,
            get_group,
            update_group,
            delete_group,
            add_server_to_group,
            remove_server_from_group,
            get_servers_in_group,
            // Batch operation commands (Phase 4 - Task 3)
            batch_execute_command,
            batch_execute_parallel,
            batch_health_check,
            batch_execute_with_summary,
            batch_health_check_with_summary,
            // File browser commands
            list_remote_files,
            search_files,
            get_file_info,
            get_breadcrumbs,
            // Terminal commands
            create_terminal_session,
            close_terminal_session,
            resize_terminal,
            write_terminal,
            read_terminal,
            start_terminal_stream,
            get_terminal_session_count,
            list_terminal_sessions,
            detect_multiplexer_sessions,
            attach_multiplexer_session,
            // Local terminal commands
            create_local_terminal_session,
            close_local_terminal_session,
            resize_local_terminal,
            write_local_terminal,
            start_local_terminal_stream,
            // Command execution
            execute_command,
            execute_command_stream,
            emit_connection_status,
            // Credential commands
            store_credential,
            store_key_passphrase,
            set_sudo_password,
            clear_sudo_password,
            // File operation commands (Task 6.1)
            download_file,
            save_file,
            create_file,
            create_directory,
            delete_remote_file,
            rename_file,
            upload_files,
            change_permissions,
            // Sync commands (Task 6.2)
            check_file_conflict,
            get_file_diff,
            resolve_conflict,
            // Editor settings commands (Task 6.3)
            get_editor_settings,
            update_editor_settings,
            // Script management commands (Task 10.1)
            create_script,
            update_script,
            delete_script,
            list_scripts,
            get_script,
            duplicate_script,
            export_script,
            import_script,
            validate_script,
            // Template library commands (Task 3.2)
            list_templates,
            get_template,
            create_from_template,
            // Execution commands (Task 10.3)
            start_deployment,
            cancel_deployment,
            dry_run_deployment,
            // Deployment history commands (Task 6)
            list_deployments,
            get_deployment,
            get_deployment_logs,
            export_deployment_logs,
            search_deployment_logs,
            // Rollback commands (Task 8)
            rollback_deployment,
            can_rollback_deployment,
            get_rollback_info,
            // Transfer commands (Phase 4 - Task 5)
            queue_uploads,
            queue_downloads,
            cancel_transfer,
            get_transfer_status,
            get_all_transfers,
            set_transfer_speed_limit,
            // Monitoring commands (Phase 4 - Task 6)
            get_server_metrics,
            get_all_server_status,
            get_metrics_history,
            create_alert,
            list_alerts,
            update_alert,
            delete_alert,
            check_alerts,
            start_monitoring,
            stop_monitoring,
            run_monitoring_cycle,
            // Snippet library commands (Phase 4 - Task 7)
            create_snippet,
            get_snippet,
            list_snippets,
            list_snippets_by_category,
            search_snippets,
            update_snippet,
            delete_snippet,
            export_snippets,
            import_snippets,
            list_snippet_categories,
            // Favorites & Activity commands (Phase 4 - Task 9.6)
            add_favorite,
            remove_favorite,
            list_favorites,
            list_favorites_by_type,
            is_favorite,
            log_activity,
            get_recent_activity,
            // Nginx Management commands
            nginx_get_status,
            nginx_list_domains,
            nginx_create_domain,
            nginx_update_domain,
            nginx_delete_domain,
            nginx_toggle_domain,
            nginx_get_domain_config,
            nginx_save_domain_config,
            nginx_issue_ssl,
            nginx_renew_ssl,
            nginx_list_ssl_certificates,
            nginx_get_snippets,
            nginx_restart,
            nginx_start,
            nginx_stop,
            // SSH Key Management commands
            generate_ssh_key,
            list_ssh_keys,
            get_ssh_key,
            delete_ssh_key,
            update_ssh_key,
            export_ssh_public_key,
            // Database Management commands
            db_add_connection,
            db_list_connections,
            db_get_connection,
            db_remove_connection,
            db_test_connection,
            db_test_connection_input,
            db_list_databases,
            db_list_tables,
            db_get_columns,
            db_get_indexes,
            db_execute_query,
            db_get_table_data,
            db_update_row,
            db_insert_row,
            db_delete_rows,
            db_list_users,
            db_create_user,
            db_drop_user,
            db_create_database,
            db_drop_database,
            db_get_user_privileges,
            db_grant_privileges,
            db_revoke_privileges,
            db_change_user_password,
            db_get_query_history,
            db_clear_query_history,
            db_save_query,
            db_get_saved_queries,
            db_delete_saved_query,
            db_update_connection,
            db_create_table,
            db_drop_table,
            db_truncate_table,
            db_search_table_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
