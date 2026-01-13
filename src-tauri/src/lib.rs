pub mod cache;
pub mod credentials;
pub mod db;
pub mod deployments;
pub mod error;
pub mod files;
pub mod scripts;
pub mod server;
pub mod ssh;
pub mod sync;
pub mod terminal;

use cache::CacheManager;
use credentials::CredentialStore;
use db::init_database;
use deployments::{DeploymentLogger, Deployment, DeploymentLog, DeploymentFilters, ExportFormat};
use files::{Breadcrumb, FileBrowser, FileContent, FileManager, path_to_breadcrumbs};
use scripts::{ScriptManager, DeploymentScript, CreateScriptInput, UpdateScriptInput, ValidationResult, TemplateLibrary, TemplateInfo, RollbackManager, RollbackInfo, ScriptEngine, ExecutionConfig, DryRunResult};
use server::{CreateServerInput, Server, ServerManager, UpdateServerInput};
use ssh::{CommandOutput, ConnectionStatus, ServerInfo, SshClient};
use ssh::ConnectionPool;
use sync::{ConflictResolver, ConflictResolution, ConflictStatus, FileDiff, SyncEngine};
use terminal::TerminalManager;

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

pub struct AppState {
    pub server_manager: Arc<Mutex<ServerManager>>,
    pub script_manager: Arc<Mutex<ScriptManager>>,
    pub template_library: Arc<TemplateLibrary>,
    pub deployment_logger: Arc<DeploymentLogger>,
    pub rollback_manager: Arc<RollbackManager>,
    pub script_engine: Arc<ScriptEngine>,
    pub ssh_client: Arc<SshClient>,
    pub file_browser: Arc<FileBrowser>,
    pub file_manager: Arc<FileManager>,
    pub cache_manager: Arc<CacheManager>,
    pub sync_engine: Arc<SyncEngine>,
    pub conflict_resolver: Arc<ConflictResolver>,
    pub terminal_manager: Arc<TerminalManager>,
    pub credential_store: Arc<CredentialStore>,
    pub active_streams: Arc<Mutex<HashSet<String>>>,
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

                // Create app state
                let state = AppState {
                    server_manager,
                    script_manager,
                    template_library,
                    deployment_logger,
                    rollback_manager,
                    script_engine,
                    ssh_client,
                    file_browser,
                    file_manager,
                    cache_manager,
                    sync_engine,
                    conflict_resolver,
                    terminal_manager,
                    credential_store,
                    active_streams: Arc::new(Mutex::new(HashSet::new())),
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
