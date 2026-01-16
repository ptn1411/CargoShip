import { invoke } from "@tauri-apps/api/core";
import type { Server, CreateServerInput, UpdateServerInput, ConnectionStatus, ServerInfo, CommandOutput } from './types';

// ============================================================================
// Server Management API
// ============================================================================

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

// ============================================================================
// Command Execution API
// ============================================================================

export const commandApi = {
  execute: (serverId: string, command: string) =>
    invoke<CommandOutput>("execute_command", { serverId, command }),
  executeStream: (serverId: string, command: string, commandId: string) =>
    invoke<CommandOutput>("execute_command_stream", { serverId, command, commandId }),
};
