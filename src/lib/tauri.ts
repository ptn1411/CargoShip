import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

// Types matching Rust backend
export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_method: "password" | "ssh_key";
  tags: string[];
  environment: "dev" | "staging" | "prod";
  use_sudo: boolean;
  created_at: string;
  updated_at: string;
  last_connected: string | null;
}

export interface CreateServerInput {
  name: string;
  host: string;
  port: number;
  username: string;
  auth_method: "password" | "ssh_key";
  tags?: string[];
  environment: "dev" | "staging" | "prod";
  use_sudo?: boolean;
}

export interface UpdateServerInput {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  auth_method?: "password" | "ssh_key";
  tags?: string[];
  environment?: "dev" | "staging" | "prod";
  use_sudo?: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  file_type: "file" | "directory" | "symlink";
  size: number;
  permissions: string;
  modified_at: string;
}

export interface Breadcrumb {
  name: string;
  path: string;
}

export interface CommandOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

export interface ConnectionStatus {
  connected: boolean;
  server_info: ServerInfo | null;
  error: string | null;
  latency_ms: number | null;
}

export interface ServerInfo {
  os: string;
  hostname: string;
  kernel: string;
}

// Event Payload Types
export interface TerminalOutputPayload {
  session_id: string;
  data: number[]; // Vec<u8> in Rust becomes number[] in TS
}

export interface ConnectionStatusPayload {
  server_id: string;
  status: "online" | "offline" | "connecting";
}

export interface CommandOutputPayload {
  server_id: string;
  command_id: string;
  data: string;
  is_stderr: boolean;
}

// File Editor Types (Phase 2)
export interface FileContent {
  path: string;
  content: string;
  size: number;
  modified_at: number;
  permissions: string;
  encoding: string;
}

export interface UploadProgress {
  file_name: string;
  bytes_uploaded: number;
  total_bytes: number;
  status: UploadStatus;
}

export type UploadStatus = 
  | "pending"
  | "uploading"
  | "completed"
  | { failed: string };

export interface ConflictStatus {
  type: "no_conflict" | "remote_modified" | "local_only" | "remote_only";
  remote_time?: number;
  local_time?: number;
}

export interface FileDiff {
  local_content: string;
  remote_content: string;
  changes: DiffChange[];
}

export interface DiffChange {
  change_type: "added" | "removed" | "unchanged";
  old_line: number | null;
  new_line: number | null;
  content: string;
}

export type ConflictResolution = 
  | "keep_local"
  | "use_remote"
  | { merge_content: string };

export interface EditorSettings {
  tab_size: number;
  font_size: number;
  font_family: string;
  word_wrap: boolean;
  auto_save: boolean;
  auto_save_interval: number;
  theme: "vs" | "vs-dark" | "hc-black";
}

// Server Management API
export const serverApi = {
  list: () => invoke<Server[]>("list_servers"),
  add: (input: CreateServerInput) => invoke<Server>("add_server", { input }),
  update: (id: string, input: UpdateServerInput) => invoke<Server>("update_server", { id, input }),
  delete: (id: string) => invoke<void>("delete_server", { id }),
  testConnection: (serverId: string) => invoke<ConnectionStatus>("test_connection", { serverId }),
  getServerInfo: (serverId: string) => invoke<ServerInfo>("get_server_info", { serverId }),
  checkDuplicate: (host: string, port: number, username: string, excludeId?: string) =>
    invoke<boolean>("check_duplicate_server", { host, port, username, excludeId }),
};

// File Operations API
export const fileApi = {
  listDirectory: (serverId: string, path: string) => 
    invoke<FileEntry[]>("list_remote_files", { serverId, path }),
  search: (serverId: string, path: string, pattern: string) =>
    invoke<FileEntry[]>("search_files", { serverId, path, pattern }),
  getFileInfo: (serverId: string, path: string) =>
    invoke<FileEntry>("get_file_info", { serverId, path }),
  getBreadcrumbs: (path: string) =>
    invoke<Breadcrumb[]>("get_breadcrumbs", { path }),
  // File Editor Operations (Phase 2)
  downloadFile: (serverId: string, remotePath: string) =>
    invoke<FileContent>("download_file", { serverId, remotePath }),
  saveFile: (serverId: string, remotePath: string, content: string) =>
    invoke<void>("save_file", { serverId, remotePath, content }),
  createFile: (serverId: string, remotePath: string) =>
    invoke<void>("create_file", { serverId, remotePath }),
  createDirectory: (serverId: string, remotePath: string) =>
    invoke<void>("create_directory", { serverId, remotePath }),
  deleteFile: (serverId: string, remotePath: string) =>
    invoke<void>("delete_remote_file", { serverId, remotePath }),
  renameFile: (serverId: string, oldPath: string, newPath: string) =>
    invoke<void>("rename_file", { serverId, oldPath, newPath }),
  uploadFiles: (serverId: string, remoteDir: string, localPaths: string[]) =>
    invoke<void>("upload_files", { serverId, remoteDir, localPaths }),
  changePermissions: (serverId: string, remotePath: string, mode: string) =>
    invoke<void>("change_permissions", { serverId, remotePath, mode }),
};

// Sync API (Phase 2)
export const syncApi = {
  checkConflict: (serverId: string, remotePath: string) =>
    invoke<ConflictStatus>("check_file_conflict", { serverId, remotePath }),
  getDiff: (serverId: string, remotePath: string) =>
    invoke<FileDiff>("get_file_diff", { serverId, remotePath }),
  resolveConflict: (serverId: string, remotePath: string, resolution: ConflictResolution) =>
    invoke<void>("resolve_conflict", { serverId, remotePath, resolution }),
};

// Editor Settings API (Phase 2)
export const editorSettingsApi = {
  get: () => invoke<EditorSettings>("get_editor_settings"),
  update: (settings: EditorSettings) => invoke<void>("update_editor_settings", { settings }),
};

// Terminal API
export const terminalApi = {
  createSession: (serverId: string) => invoke<string>("create_terminal_session", { serverId }),
  closeSession: (sessionId: string) => invoke<void>("close_terminal_session", { sessionId }),
  resize: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("resize_terminal", { sessionId, cols, rows }),
  write: (sessionId: string, data: number[]) =>
    invoke<void>("write_terminal", { sessionId, data }),
  read: (sessionId: string) =>
    invoke<number[]>("read_terminal", { sessionId }),
  startStream: (sessionId: string) =>
    invoke<void>("start_terminal_stream", { sessionId }),
  getSessionCount: () =>
    invoke<number>("get_terminal_session_count"),
  listSessions: () =>
    invoke<string[]>("list_terminal_sessions"),
};

// Command Execution API
export const commandApi = {
  execute: (serverId: string, command: string) =>
    invoke<CommandOutput>("execute_command", { serverId, command }),
  executeStream: (serverId: string, command: string, commandId: string) =>
    invoke<CommandOutput>("execute_command_stream", { serverId, command, commandId }),
};

// Credentials API
export const credentialApi = {
  store: (serverId: string, credential: string, isPassword: boolean = true) =>
    invoke<void>("store_credential", { serverId, credential, isPassword }),
  storeKeyPassphrase: (serverId: string, passphrase: string) =>
    invoke<void>("store_key_passphrase", { serverId, passphrase }),
  setSudoPassword: (serverId: string, password: string) =>
    invoke<void>("set_sudo_password", { serverId, password }),
  clearSudoPassword: (serverId: string) =>
    invoke<void>("clear_sudo_password", { serverId }),
};

// Event Listeners
export const eventApi = {
  onTerminalOutput: (callback: (payload: TerminalOutputPayload) => void): Promise<UnlistenFn> =>
    listen<TerminalOutputPayload>("terminal-output", (event) => callback(event.payload)),
  
  onConnectionStatusChanged: (callback: (payload: ConnectionStatusPayload) => void): Promise<UnlistenFn> =>
    listen<ConnectionStatusPayload>("connection-status-changed", (event) => callback(event.payload)),
  
  onCommandOutput: (callback: (payload: CommandOutputPayload) => void): Promise<UnlistenFn> =>
    listen<CommandOutputPayload>("command-output", (event) => callback(event.payload)),
  
  // File Editor Events (Phase 2)
  onUploadProgress: (callback: (payload: UploadProgress) => void): Promise<UnlistenFn> =>
    listen<UploadProgress>("upload-progress", (event) => callback(event.payload)),
  
  emitConnectionStatus: (serverId: string, status: "online" | "offline" | "connecting") =>
    invoke<void>("emit_connection_status", { serverId, status }),
};

// Event listener management for app initialization
export interface EventListenerCleanup {
  unsubscribeAll: () => void;
}

export async function setupGlobalEventListeners(handlers: {
  onTerminalOutput?: (payload: TerminalOutputPayload) => void;
  onConnectionStatusChanged?: (payload: ConnectionStatusPayload) => void;
  onCommandOutput?: (payload: CommandOutputPayload) => void;
}): Promise<EventListenerCleanup> {
  const unsubscribers: UnlistenFn[] = [];

  if (handlers.onTerminalOutput) {
    const unlisten = await eventApi.onTerminalOutput(handlers.onTerminalOutput);
    unsubscribers.push(unlisten);
  }

  if (handlers.onConnectionStatusChanged) {
    const unlisten = await eventApi.onConnectionStatusChanged(handlers.onConnectionStatusChanged);
    unsubscribers.push(unlisten);
  }

  if (handlers.onCommandOutput) {
    const unlisten = await eventApi.onCommandOutput(handlers.onCommandOutput);
    unsubscribers.push(unlisten);
  }

  return {
    unsubscribeAll: () => {
      unsubscribers.forEach((unsub) => unsub());
    },
  };
}

// ============================================================================
// Deployment Scripts Types (Phase 3)
// ============================================================================

export type VariableType = "string" | "number" | "boolean" | "secret";

export interface Variable {
  name: string;
  description: string;
  default_value: string | null;
  required: boolean;
  var_type: VariableType;
}

export type OnError = "abort" | "continue" | "rollback";

export interface Step {
  id: string;
  name: string;
  commands: string[];
  working_dir: string | null;
  env: Record<string, string>;
  condition: string | null;
  on_error: OnError;
  timeout: number | null;
}

export interface DeploymentScript {
  id: string;
  name: string;
  description: string;
  variables: Variable[];
  steps: Step[];
  rollback_steps: Step[];
  tags: string[];
  is_template: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateScriptInput {
  name: string;
  description?: string;
  variables?: Variable[];
  steps?: Step[];
  rollback_steps?: Step[];
  tags?: string[];
  is_template?: boolean;
}

export interface UpdateScriptInput {
  name?: string;
  description?: string;
  variables?: Variable[];
  steps?: Step[];
  rollback_steps?: Step[];
  tags?: string[];
  is_template?: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export interface TemplateInfo {
  name: string;
  description: string;
  category: string;
  variables: Variable[];
}

// Deployment Types
export type DeploymentStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "partial"
  | "cancelled"
  | "rolled_back"
  | "rollback_failed";

export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface DeploymentLog {
  id: string;
  deployment_id: string;
  step_id: string;
  step_name: string;
  server_id: string;
  server_name: string;
  /** Standard output from the command */
  output: string;
  /** Standard error output from the command */
  stderr: string;
  exit_code: number | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  status: StepStatus;
}

export interface Deployment {
  id: string;
  script_id: string;
  script_name: string;
  server_ids: string[];
  variables: Record<string, string>;
  status: DeploymentStatus;
  logs: DeploymentLog[];
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  triggered_by: string;
  rollback_of: string | null;
}

export interface DeploymentFilters {
  server_id?: string;
  script_id?: string;
  status?: DeploymentStatus;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

export interface ExecutionConfig {
  script_id: string;
  server_ids: string[];
  variables: Record<string, string>;
  parallel?: boolean;
  dry_run?: boolean;
  /** Optional sudo password for commands requiring elevated privileges */
  sudo_password?: string;
}

export interface DryRunStep {
  step_id: string;
  step_name: string;
  commands: string[];
  working_dir: string | null;
  condition: string | null;
  condition_result: boolean | null;
  will_execute: boolean;
  skip_reason: string | null;
}

export interface DryRunServer {
  server_id: string;
  server_name: string;
  steps: DryRunStep[];
}

export interface DryRunResult {
  script_name: string;
  servers: DryRunServer[];
  total_steps: number;
}

export interface RollbackInfo {
  deployment_id: string;
  can_rollback: boolean;
  has_rollback_steps: boolean;
  rollback_step_count: number;
  rollback_step_names: string[];
  reason_cannot_rollback: string | null;
}

// Deployment Event Payloads
export interface DeploymentStartedPayload {
  deployment_id: string;
  script_name: string;
  server_count: number;
}

export interface StepStartedPayload {
  deployment_id: string;
  step_id: string;
  step_name: string;
  server_id: string;
}

export interface StepOutputPayload {
  deployment_id: string;
  step_id: string;
  server_id: string;
  output: string;
}

export interface StepCompletedPayload {
  deployment_id: string;
  step_id: string;
  server_id: string;
  status: string;
  exit_code: number | null;
}

export interface DeploymentCompletedPayload {
  deployment_id: string;
  status: string;
  duration_ms: number;
}

// ============================================================================
// Script Management API (Phase 3)
// ============================================================================

export const scriptApi = {
  list: () => invoke<DeploymentScript[]>("list_scripts"),
  get: (id: string) => invoke<DeploymentScript>("get_script", { id }),
  create: (input: CreateScriptInput) => invoke<DeploymentScript>("create_script", { input }),
  update: (id: string, input: UpdateScriptInput) => invoke<DeploymentScript>("update_script", { id, input }),
  delete: (id: string) => invoke<void>("delete_script", { id }),
  duplicate: (id: string) => invoke<DeploymentScript>("duplicate_script", { id }),
  export: (id: string) => invoke<string>("export_script", { id }),
  import: (yaml: string) => invoke<DeploymentScript>("import_script", { yaml }),
  validate: (script: DeploymentScript) => invoke<ValidationResult>("validate_script", { script }),
};

// ============================================================================
// Template Library API (Phase 3)
// ============================================================================

export const templateApi = {
  list: () => invoke<TemplateInfo[]>("list_templates"),
  get: (name: string) => invoke<DeploymentScript>("get_template", { name }),
  createFromTemplate: (templateName: string) => invoke<DeploymentScript>("create_from_template", { templateName }),
};

// ============================================================================
// Deployment Execution API (Phase 3)
// ============================================================================

export const deploymentApi = {
  start: (config: ExecutionConfig) => invoke<Deployment>("start_deployment", { config }),
  cancel: (deploymentId: string) => invoke<void>("cancel_deployment", { deploymentId }),
  dryRun: (config: ExecutionConfig) => invoke<DryRunResult>("dry_run_deployment", { config }),
  list: (filters: DeploymentFilters) => invoke<Deployment[]>("list_deployments", { filters }),
  get: (id: string) => invoke<Deployment>("get_deployment", { id }),
  getLogs: (deploymentId: string) => invoke<DeploymentLog[]>("get_deployment_logs", { deploymentId }),
  exportLogs: (deploymentId: string, format: string) => invoke<string>("export_deployment_logs", { deploymentId, format }),
  searchLogs: (deploymentId: string, searchTerm: string) => invoke<DeploymentLog[]>("search_deployment_logs", { deploymentId, searchTerm }),
};

// ============================================================================
// Rollback API (Phase 3)
// ============================================================================

export const rollbackApi = {
  execute: (deploymentId: string) => invoke<Deployment>("rollback_deployment", { deploymentId }),
  canRollback: (deploymentId: string) => invoke<boolean>("can_rollback_deployment", { deploymentId }),
  getInfo: (deploymentId: string) => invoke<RollbackInfo>("get_rollback_info", { deploymentId }),
};

// ============================================================================
// Deployment Event Listeners (Phase 3)
// ============================================================================

export const deploymentEventApi = {
  onDeploymentStarted: (callback: (payload: DeploymentStartedPayload) => void): Promise<UnlistenFn> =>
    listen<DeploymentStartedPayload>("deployment-started", (event) => callback(event.payload)),
  
  onStepStarted: (callback: (payload: StepStartedPayload) => void): Promise<UnlistenFn> =>
    listen<StepStartedPayload>("step-started", (event) => callback(event.payload)),
  
  onStepOutput: (callback: (payload: StepOutputPayload) => void): Promise<UnlistenFn> =>
    listen<StepOutputPayload>("step-output", (event) => callback(event.payload)),
  
  onStepCompleted: (callback: (payload: StepCompletedPayload) => void): Promise<UnlistenFn> =>
    listen<StepCompletedPayload>("step-completed", (event) => callback(event.payload)),
  
  onDeploymentCompleted: (callback: (payload: DeploymentCompletedPayload) => void): Promise<UnlistenFn> =>
    listen<DeploymentCompletedPayload>("deployment-completed", (event) => callback(event.payload)),
};

// Re-export types for convenience
// Types are already exported as interfaces above
