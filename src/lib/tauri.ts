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
}

export interface UpdateServerInput {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  auth_method?: "password" | "ssh_key";
  tags?: string[];
  environment?: "dev" | "staging" | "prod";
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
};

// Event Listeners
export const eventApi = {
  onTerminalOutput: (callback: (payload: TerminalOutputPayload) => void): Promise<UnlistenFn> =>
    listen<TerminalOutputPayload>("terminal-output", (event) => callback(event.payload)),
  
  onConnectionStatusChanged: (callback: (payload: ConnectionStatusPayload) => void): Promise<UnlistenFn> =>
    listen<ConnectionStatusPayload>("connection-status-changed", (event) => callback(event.payload)),
  
  onCommandOutput: (callback: (payload: CommandOutputPayload) => void): Promise<UnlistenFn> =>
    listen<CommandOutputPayload>("command-output", (event) => callback(event.payload)),
  
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

// Re-export types for convenience
// Types are already exported as interfaces above
