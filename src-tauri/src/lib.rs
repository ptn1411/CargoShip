pub mod credentials;
pub mod db;
pub mod error;
pub mod files;
pub mod server;
pub mod ssh;
pub mod terminal;

use credentials::CredentialStore;
use db::init_database;
use files::{Breadcrumb, FileBrowser, path_to_breadcrumbs};
use server::{CreateServerInput, Server, ServerManager, UpdateServerInput};
use ssh::{CommandOutput, ConnectionStatus, ServerInfo, SshClient};
use ssh::ConnectionPool;
use terminal::TerminalManager;

use serde::Serialize;
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

pub struct AppState {
    pub server_manager: Arc<Mutex<ServerManager>>,
    pub ssh_client: Arc<SshClient>,
    pub file_browser: Arc<FileBrowser>,
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
                    ServerManager::new(db_pool, credential_store.clone())
                ));
                let ssh_client = Arc::new(SshClient::new(connection_pool, credential_store.clone()));
                let file_browser = Arc::new(FileBrowser::new(credential_store.clone()));
                let terminal_manager = Arc::new(TerminalManager::new(credential_store.clone()));

                // Create app state
                let state = AppState {
                    server_manager,
                    ssh_client,
                    file_browser,
                    terminal_manager,
                    credential_store,
                    active_streams: Arc::new(Mutex::new(HashSet::new())),
                };

                app_handle.manage(state);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_servers,
            add_server,
            update_server,
            delete_server,
            test_connection,
            get_server_info,
            list_remote_files,
            search_files,
            get_file_info,
            get_breadcrumbs,
            create_terminal_session,
            close_terminal_session,
            resize_terminal,
            write_terminal,
            read_terminal,
            start_terminal_stream,
            emit_connection_status,
            get_terminal_session_count,
            list_terminal_sessions,
            execute_command,
            execute_command_stream,
            store_credential,
            store_key_passphrase,
            check_duplicate_server,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
