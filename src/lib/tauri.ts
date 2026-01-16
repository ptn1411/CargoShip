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
  ssh_key_id: string | null;
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
  ssh_key_id?: string;
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
  ssh_key_id?: string;
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
  detectMultiplexerSessions: (serverId: string) =>
    invoke<MultiplexerSession[]>("detect_multiplexer_sessions", { serverId }),
  attachMultiplexerSession: (sessionId: string, multiplexerType: string, sessionName: string) =>
    invoke<void>("attach_multiplexer_session", { sessionId, multiplexerType, sessionName }),
};

// Multiplexer Session Types (tmux/screen)
export interface MultiplexerSession {
  name: string;
  multiplexer_type: string;
  attached: boolean;
  windows: number | null;
  created_at: string | null;
}

// Local Terminal API
export const localTerminalApi = {
  createSession: () => invoke<string>("create_local_terminal_session"),
  closeSession: (sessionId: string) => invoke<void>("close_local_terminal_session", { sessionId }),
  resize: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("resize_local_terminal", { sessionId, cols, rows }),
  write: (sessionId: string, data: number[]) =>
    invoke<void>("write_local_terminal", { sessionId, data }),
  startStream: (sessionId: string) =>
    invoke<void>("start_local_terminal_stream", { sessionId }),
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
  
  onLocalTerminalOutput: (callback: (payload: TerminalOutputPayload) => void): Promise<UnlistenFn> =>
    listen<TerminalOutputPayload>("local-terminal-output", (event) => callback(event.payload)),
  
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
  /** Enable deep validation in dry-run (SSH connectivity, command availability) */
  validate_prerequisites?: boolean;
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
  /** Warnings for this step (command not found, directory missing, etc.) */
  warnings: string[];
}

export interface DryRunServer {
  server_id: string;
  server_name: string;
  steps: DryRunStep[];
  /** Server-level warnings (SSH issues, etc.) */
  warnings: string[];
  /** SSH connectivity status (null if not validated) */
  ssh_reachable: boolean | null;
}

export interface DryRunResult {
  script_name: string;
  servers: DryRunServer[];
  total_steps: number;
  /** Whether deep validation was performed */
  validated: boolean;
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


// ============================================================================
// Phase 4 - Advanced Features Types
// ============================================================================

// Server Groups Types
export interface ServerGroup {
  id: string;
  name: string;
  description: string | null;
  server_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateGroupInput {
  name: string;
  description?: string;
  server_ids?: string[];
}

export interface UpdateGroupInput {
  name?: string;
  description?: string;
  server_ids?: string[];
}

// Batch Operations Types
export interface BatchResult {
  server_id: string;
  server_name: string;
  success: boolean;
  output: string | null;
  error: string | null;
  duration_ms: number;
}

export interface HealthCheckResult {
  server_id: string;
  server_name: string;
  connected: boolean;
  latency_ms: number | null;
  error: string | null;
}

export interface BatchSummary {
  total: number;
  success_count: number;
  failure_count: number;
  results: BatchResult[];
}

export interface HealthCheckSummary {
  total: number;
  online_count: number;
  offline_count: number;
  results: HealthCheckResult[];
}

export interface BatchProgressPayload {
  completed: number;
  total: number;
  current_server: string;
  current_server_id: string;
}

// Transfer Types
export interface TransferRequest {
  local_path: string;
  remote_path: string;
}

export type TransferDirection = "upload" | "download";

export type TransferState =
  | "queued"
  | "in_progress"
  | "completed"
  | { failed: string }
  | "cancelled";

export interface TransferStatus {
  id: string;
  file_name: string;
  direction: TransferDirection;
  bytes_transferred: number;
  total_bytes: number;
  speed_bps: number;
  eta_seconds: number | null;
  state: TransferState;
  server_id: string;
  local_path: string;
  remote_path: string;
  created_at: string;
  updated_at: string;
}

export interface TransferProgressPayload {
  transfer_id: string;
  bytes_transferred: number;
  total_bytes: number;
  speed_bps: number;
  eta_seconds: number | null;
}

export interface TransferCompletedPayload {
  transfer_id: string;
  success: boolean;
  error: string | null;
}

// Monitoring Types
export interface ServerMetrics {
  cpu_percent: number;
  memory_used: number;
  memory_total: number;
  disk_used: number;
  disk_total: number;
  load_average: [number, number, number];
  uptime_seconds: number;
  collected_at: string;
}

export interface ServerStatusInfo {
  server_id: string;
  server_name: string;
  online: boolean;
  metrics: ServerMetrics | null;
  last_checked: string;
}

export type MetricType = "cpu_usage" | "memory_usage" | "disk_usage";

export type AlertCondition = "greater_than" | "less_than" | "equals";

export interface AlertConfig {
  id: string;
  server_id: string | null;
  metric: MetricType;
  condition: AlertCondition;
  threshold: number;
  enabled: boolean;
  created_at: string;
}

export interface Alert {
  alert_config_id: string;
  server_id: string;
  server_name: string;
  metric: MetricType;
  condition: AlertCondition;
  threshold: number;
  actual_value: number;
  triggered_at: string;
}

export interface MetricPoint {
  timestamp: string;
  value: number;
}

export interface CreateAlertInput {
  server_id?: string;
  metric: MetricType;
  condition: AlertCondition;
  threshold: number;
  enabled: boolean;
}

export interface UpdateAlertInput {
  server_id?: string;
  metric?: MetricType;
  condition?: AlertCondition;
  threshold?: number;
  enabled?: boolean;
}

export interface MetricsUpdatedPayload {
  server_id: string;
  metrics: ServerMetrics;
}

export interface AlertTriggeredPayload {
  alert_id: string;
  server_id: string;
  metric: string;
  value: number;
  threshold: number;
}

// Snippets Types
export interface Snippet {
  id: string;
  name: string;
  description: string | null;
  command: string;
  category: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateSnippetInput {
  name: string;
  description?: string;
  command: string;
  category: string;
  tags?: string[];
}

export interface UpdateSnippetInput {
  name?: string;
  description?: string;
  command?: string;
  category?: string;
  tags?: string[];
}

export interface SnippetImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

// Favorites Types
export type FavoriteType = "server" | "script" | "snippet";

export interface Favorite {
  id: string;
  item_type: FavoriteType;
  item_id: string;
  created_at: string;
}

// Activity Log Types
export interface ActivityLog {
  id: string;
  action: string;
  item_type: string | null;
  item_id: string | null;
  details: string | null;
  created_at: string;
}

// ============================================================================
// Phase 4 - Server Groups API
// ============================================================================

export const groupApi = {
  create: (input: CreateGroupInput) => invoke<ServerGroup>("create_group", { input }),
  list: () => invoke<ServerGroup[]>("list_groups"),
  get: (id: string) => invoke<ServerGroup>("get_group", { id }),
  update: (id: string, input: UpdateGroupInput) => invoke<ServerGroup>("update_group", { id, input }),
  delete: (id: string) => invoke<void>("delete_group", { id }),
  addServer: (groupId: string, serverId: string) => invoke<void>("add_server_to_group", { groupId, serverId }),
  removeServer: (groupId: string, serverId: string) => invoke<void>("remove_server_from_group", { groupId, serverId }),
  getServers: (groupId: string) => invoke<Server[]>("get_servers_in_group", { groupId }),
};

// ============================================================================
// Phase 4 - Batch Operations API
// ============================================================================

export const batchApi = {
  executeCommand: (serverIds: string[], command: string) =>
    invoke<BatchResult[]>("batch_execute_command", { serverIds, command }),
  executeParallel: (serverIds: string[], command: string, maxParallel: number) =>
    invoke<BatchResult[]>("batch_execute_parallel", { serverIds, command, maxParallel }),
  healthCheck: (serverIds: string[]) =>
    invoke<HealthCheckResult[]>("batch_health_check", { serverIds }),
  executeWithSummary: (serverIds: string[], command: string) =>
    invoke<BatchSummary>("batch_execute_with_summary", { serverIds, command }),
  healthCheckWithSummary: (serverIds: string[]) =>
    invoke<HealthCheckSummary>("batch_health_check_with_summary", { serverIds }),
};

// ============================================================================
// Phase 4 - Transfer API
// ============================================================================

export const transferApi = {
  queueUploads: (serverId: string, transfers: TransferRequest[]) =>
    invoke<string[]>("queue_uploads", { serverId, transfers }),
  queueDownloads: (serverId: string, transfers: TransferRequest[]) =>
    invoke<string[]>("queue_downloads", { serverId, transfers }),
  cancel: (transferId: string) =>
    invoke<void>("cancel_transfer", { transferId }),
  getStatus: (transferId: string) =>
    invoke<TransferStatus>("get_transfer_status", { transferId }),
  setSpeedLimit: (bytesPerSecond: number | null) =>
    invoke<void>("set_transfer_speed_limit", { bytesPerSecond }),
  listActive: () =>
    invoke<TransferStatus[]>("list_active_transfers"),
};

// ============================================================================
// Phase 4 - Monitoring API
// ============================================================================

export const monitorApi = {
  getServerMetrics: (serverId: string) =>
    invoke<ServerMetrics>("get_server_metrics", { serverId }),
  getAllServerStatus: () =>
    invoke<ServerStatusInfo[]>("get_all_server_status"),
  getMetricsHistory: (serverId: string, metric: string, hours: number) =>
    invoke<MetricPoint[]>("get_metrics_history", { serverId, metric, hours }),
  setAlert: (alert: CreateAlertInput) =>
    invoke<AlertConfig>("set_alert", { alert }),
  updateAlert: (id: string, input: UpdateAlertInput) =>
    invoke<AlertConfig>("update_alert", { id, input }),
  deleteAlert: (id: string) =>
    invoke<void>("delete_alert", { id }),
  listAlerts: () =>
    invoke<AlertConfig[]>("list_alerts"),
  checkAlerts: () =>
    invoke<Alert[]>("check_alerts"),
  startMonitoring: (intervalSeconds: number) =>
    invoke<void>("start_monitoring", { intervalSeconds }),
  stopMonitoring: () =>
    invoke<void>("stop_monitoring"),
};

// ============================================================================
// Phase 4 - Snippets API
// ============================================================================

export const snippetApi = {
  create: (input: CreateSnippetInput) => invoke<Snippet>("create_snippet", { input }),
  list: () => invoke<Snippet[]>("list_snippets"),
  get: (id: string) => invoke<Snippet>("get_snippet", { id }),
  listByCategory: (category: string) => invoke<Snippet[]>("list_snippets_by_category", { category }),
  search: (query: string) => invoke<Snippet[]>("search_snippets", { query }),
  update: (id: string, input: UpdateSnippetInput) => invoke<Snippet>("update_snippet", { id, input }),
  delete: (id: string) => invoke<void>("delete_snippet", { id }),
  export: () => invoke<string>("export_snippets"),
  import: (json: string) => invoke<SnippetImportResult>("import_snippets", { json }),
};

// ============================================================================
// Phase 4 - Favorites API
// ============================================================================

export const favoritesApi = {
  add: (itemType: FavoriteType, itemId: string) =>
    invoke<void>("add_favorite", { itemType, itemId }),
  remove: (itemType: FavoriteType, itemId: string) =>
    invoke<void>("remove_favorite", { itemType, itemId }),
  list: () =>
    invoke<Favorite[]>("list_favorites"),
  isFavorite: (itemType: FavoriteType, itemId: string) =>
    invoke<boolean>("is_favorite", { itemType, itemId }),
};

// ============================================================================
// Phase 4 - Activity Log API
// ============================================================================

export const activityApi = {
  getRecent: (limit: number) =>
    invoke<ActivityLog[]>("get_recent_activity", { limit }),
  log: (action: string, itemType?: string, itemId?: string, details?: string) =>
    invoke<void>("log_activity", { action, itemType, itemId, details }),
};

// ============================================================================
// Phase 4 - Event Listeners
// ============================================================================

export const phase4EventApi = {
  onTransferProgress: (callback: (payload: TransferProgressPayload) => void): Promise<UnlistenFn> =>
    listen<TransferProgressPayload>("transfer-progress", (event) => callback(event.payload)),
  
  onTransferCompleted: (callback: (payload: TransferCompletedPayload) => void): Promise<UnlistenFn> =>
    listen<TransferCompletedPayload>("transfer-completed", (event) => callback(event.payload)),
  
  onMetricsUpdated: (callback: (payload: MetricsUpdatedPayload) => void): Promise<UnlistenFn> =>
    listen<MetricsUpdatedPayload>("metrics-updated", (event) => callback(event.payload)),
  
  onAlertTriggered: (callback: (payload: AlertTriggeredPayload) => void): Promise<UnlistenFn> =>
    listen<AlertTriggeredPayload>("alert-triggered", (event) => callback(event.payload)),
  
  onBatchProgress: (callback: (payload: BatchProgressPayload) => void): Promise<UnlistenFn> =>
    listen<BatchProgressPayload>("batch-progress", (event) => callback(event.payload)),
};

// ============================================================================
// SSH Key Management Types
// ============================================================================

export type SshKeyType = "ed25519" | "rsa";

export interface SshKey {
  id: string;
  name: string;
  key_type: string;
  public_key: string;
  fingerprint: string;
  comment: string | null;
  created_at: string;
}

export interface CreateSshKeyInput {
  name: string;
  key_type: SshKeyType;
  passphrase?: string;
  comment?: string;
  bits?: number; // For RSA keys (2048, 4096)
}

export interface GeneratedKey {
  id: string;
  name: string;
  key_type: string;
  public_key: string;
  fingerprint: string;
}

// ============================================================================
// SSH Key Management API
// ============================================================================

export const sshKeyApi = {
  generate: (input: CreateSshKeyInput) => invoke<GeneratedKey>("generate_ssh_key", { input }),
  list: () => invoke<SshKey[]>("list_ssh_keys"),
  get: (id: string) => invoke<SshKey>("get_ssh_key", { id }),
  delete: (id: string) => invoke<void>("delete_ssh_key", { id }),
  update: (id: string, name?: string, comment?: string) => 
    invoke<SshKey>("update_ssh_key", { id, name, comment }),
  exportPublicKey: (id: string) => invoke<string>("export_ssh_public_key", { id }),
};

// ============================================================================
// Nginx Management Types
// ============================================================================

export type TemplateType = 
  | "static"
  | "php"
  | "php_laravel"
  | "php_wordpress"
  | "node_js"
  | "node_next_js"
  | "python"
  | "python_django"
  | "python_flask"
  | "ruby_rails"
  | "java"
  | "go_lang"
  | "reverse_proxy"
  | "load_balancer"
  | "custom";

export interface NginxDomain {
  id: string;
  server_id: string;
  domain: string;
  aliases: string[];
  root_path: string;
  config_path: string;
  enabled: boolean;
  ssl_enabled: boolean;
  ssl_certificate: string | null;
  ssl_certificate_key: string | null;
  proxy_pass: string | null;
  template_type: TemplateType;
  custom_config: string | null;
  created_at: number;
  updated_at: number;
}

export interface NginxStatus {
  running: boolean;
  version: string;
  config_test: boolean;
  config_error: string | null;
  sites_enabled: number;
  sites_available: number;
}

export interface SslCertificate {
  domain: string;
  issuer: string;
  valid_from: string;
  valid_until: string;
  days_remaining: number;
  auto_renew: boolean;
}

export interface SslResult {
  success: boolean;
  domain: string;
  message: string;
  certificate_path: string | null;
  key_path: string | null;
}

export interface ConfigSnippet {
  id: string;
  name: string;
  description: string;
  category: string;
  content: string;
}

export interface CreateDomainInput {
  server_id: string;
  domain: string;
  aliases?: string[];
  root_path?: string;
  template_type: TemplateType;
  proxy_pass?: string;
  enable_ssl: boolean;
  custom_config?: string;
}

export interface UpdateDomainInput {
  domain?: string;
  aliases?: string[];
  root_path?: string;
  template_type?: TemplateType;
  proxy_pass?: string;
  custom_config?: string;
}

// ============================================================================
// Nginx Management API
// ============================================================================

export const nginxApi = {
  // Status & Control
  getStatus: (serverId: string) => 
    invoke<NginxStatus>("nginx_get_status", { serverId }),
  restart: (serverId: string) => 
    invoke<void>("nginx_restart", { serverId }),
  start: (serverId: string) => 
    invoke<void>("nginx_start", { serverId }),
  stop: (serverId: string) => 
    invoke<void>("nginx_stop", { serverId }),

  // Domain Management
  listDomains: (serverId: string) => 
    invoke<NginxDomain[]>("nginx_list_domains", { serverId }),
  createDomain: (input: CreateDomainInput) => 
    invoke<NginxDomain>("nginx_create_domain", { input }),
  updateDomain: (serverId: string, domainName: string, input: UpdateDomainInput) => 
    invoke<NginxDomain>("nginx_update_domain", { serverId, domainName, input }),
  deleteDomain: (serverId: string, domainName: string) => 
    invoke<void>("nginx_delete_domain", { serverId, domainName }),
  toggleDomain: (serverId: string, domainName: string, enable: boolean) => 
    invoke<void>("nginx_toggle_domain", { serverId, domainName, enable }),

  // Config Management
  getDomainConfig: (serverId: string, domainName: string) => 
    invoke<string>("nginx_get_domain_config", { serverId, domainName }),
  saveDomainConfig: (serverId: string, domainName: string, content: string) => 
    invoke<void>("nginx_save_domain_config", { serverId, domainName, content }),
  getSnippets: () => 
    invoke<ConfigSnippet[]>("nginx_get_snippets"),

  // SSL Management
  issueSsl: (serverId: string, domainName: string, email: string) => 
    invoke<SslResult>("nginx_issue_ssl", { serverId, domainName, email }),
  renewSsl: (serverId: string) => 
    invoke<string>("nginx_renew_ssl", { serverId }),
  listSslCertificates: (serverId: string) => 
    invoke<SslCertificate[]>("nginx_list_ssl_certificates", { serverId }),
};

// ============================================================================
// Database Management Types
// ============================================================================

export type DatabaseType = "mysql" | "postgresql";

export interface DatabaseConnection {
  id: string;
  server_id: string;
  name: string;
  db_type: DatabaseType;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateConnectionInput {
  server_id: string;
  name: string;
  db_type: DatabaseType;
  host: string;
  port: number;
  username: string;
  password: string;
  database?: string;
}

export interface UpdateConnectionInput {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
}

export interface DatabaseInfo {
  name: string;
  size: string | null;
  tables_count: number | null;
  charset: string | null;
  collation: string | null;
}

export interface TableInfo {
  name: string;
  rows: number | null;
  size: string | null;
  engine: string | null;
  collation: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ColumnInfo {
  name: string;
  data_type: string;
  is_nullable: boolean;
  column_default: string | null;
  is_primary_key: boolean;
  is_unique: boolean;
  is_auto_increment: boolean;
  max_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  comment: string | null;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  is_unique: boolean;
  is_primary: boolean;
  index_type: string | null;
}

export interface DatabaseUser {
  username: string;
  host: string;
  privileges: string[];
}

export interface CreateUserInput {
  username: string;
  password: string;
  host: string;
  privileges: string[];
  database?: string;
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  affected_rows: number;
  execution_time_ms: number;
  is_select: boolean;
  error: string | null;
}

export interface ExecuteQueryInput {
  connection_id: string;
  database: string;
  query: string;
}

export interface TableData {
  columns: ColumnInfo[];
  rows: unknown[][];
  total_rows: number;
  page: number;
  page_size: number;
  primary_key_columns: string[];
}

export interface FetchTableDataInput {
  connection_id: string;
  database: string;
  table: string;
  page?: number;
  page_size?: number;
  order_by?: string;
  order_dir?: string;
  filter?: string;
}

export interface UpdateRowInput {
  connection_id: string;
  database: string;
  table: string;
  primary_key_values: Record<string, unknown>;
  updates: Record<string, unknown>;
}

export interface InsertRowInput {
  connection_id: string;
  database: string;
  table: string;
  values: Record<string, unknown>;
}

export interface DeleteRowsInput {
  connection_id: string;
  database: string;
  table: string;
  primary_key_values: Record<string, unknown>[];
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  version: string | null;
}

export interface CreateDatabaseInput {
  connection_id: string;
  name: string;
  charset?: string;
  collation?: string;
}

export interface CreateTableInput {
  connection_id: string;
  database: string;
  name: string;
  columns: CreateColumnInput[];
  primary_key?: string[];
  engine?: string;
}

export interface CreateColumnInput {
  name: string;
  data_type: string;
  length?: number;
  is_nullable: boolean;
  default_value?: string;
  is_auto_increment: boolean;
  comment?: string;
}

// ============================================================================
// Database Management API
// ============================================================================

export const databaseApi = {
  // Connection Management
  addConnection: (input: CreateConnectionInput) =>
    invoke<DatabaseConnection>("db_add_connection", { input }),
  listConnections: () =>
    invoke<DatabaseConnection[]>("db_list_connections"),
  getConnection: (id: string) =>
    invoke<DatabaseConnection>("db_get_connection", { id }),
  removeConnection: (id: string) =>
    invoke<void>("db_remove_connection", { id }),
  testConnection: (connectionId: string) =>
    invoke<ConnectionTestResult>("db_test_connection", { connectionId }),

  // Database Operations
  listDatabases: (connectionId: string) =>
    invoke<DatabaseInfo[]>("db_list_databases", { connectionId }),
  createDatabase: (input: CreateDatabaseInput) =>
    invoke<void>("db_create_database", { input }),
  dropDatabase: (connectionId: string, database: string) =>
    invoke<void>("db_drop_database", { connectionId, database }),

  // Table Operations
  listTables: (connectionId: string, database: string) =>
    invoke<TableInfo[]>("db_list_tables", { connectionId, database }),
  getColumns: (connectionId: string, database: string, table: string) =>
    invoke<ColumnInfo[]>("db_get_columns", { connectionId, database, table }),
  getIndexes: (connectionId: string, database: string, table: string) =>
    invoke<IndexInfo[]>("db_get_indexes", { connectionId, database, table }),
  getTableData: (input: FetchTableDataInput) =>
    invoke<TableData>("db_get_table_data", { input }),
  createTable: (input: CreateTableInput) =>
    invoke<void>("db_create_table", { input }),
  dropTable: (connectionId: string, database: string, table: string) =>
    invoke<void>("db_drop_table", { connectionId, database, table }),
  truncateTable: (connectionId: string, database: string, table: string) =>
    invoke<void>("db_truncate_table", { connectionId, database, table }),
  searchTableData: (connectionId: string, database: string, table: string, searchTerm: string, columns?: string[], page?: number, pageSize?: number) =>
    invoke<TableData>("db_search_table_data", { connectionId, database, table, searchTerm, columns: columns || [], page, pageSize }),

  // Query Execution
  executeQuery: (input: ExecuteQueryInput) =>
    invoke<QueryResult>("db_execute_query", { input }),

  // Row Operations
  updateRow: (input: UpdateRowInput) =>
    invoke<number>("db_update_row", { input }),
  insertRow: (input: InsertRowInput) =>
    invoke<number>("db_insert_row", { input }),
  deleteRows: (input: DeleteRowsInput) =>
    invoke<number>("db_delete_rows", { input }),

  // User Management
  listUsers: (connectionId: string) =>
    invoke<DatabaseUser[]>("db_list_users", { connectionId }),
  createUser: (connectionId: string, input: CreateUserInput) =>
    invoke<void>("db_create_user", { connectionId, input }),
  dropUser: (connectionId: string, username: string, host: string) =>
    invoke<void>("db_drop_user", { connectionId, username, host }),
  getUserPrivileges: (connectionId: string, username: string, host: string) =>
    invoke<string[]>("db_get_user_privileges", { connectionId, username, host }),
  grantPrivileges: (connectionId: string, username: string, host: string, privileges: string[], database?: string) =>
    invoke<void>("db_grant_privileges", { connectionId, username, host, privileges, database }),
  revokePrivileges: (connectionId: string, username: string, host: string, privileges: string[], database?: string) =>
    invoke<void>("db_revoke_privileges", { connectionId, username, host, privileges, database }),
  changeUserPassword: (connectionId: string, username: string, host: string, newPassword: string) =>
    invoke<void>("db_change_user_password", { connectionId, username, host, newPassword }),
};
