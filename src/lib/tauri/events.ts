import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

// ============================================================================
// Event Payload Types
// ============================================================================

export interface TerminalOutputPayload {
  session_id: string;
  data: number[];
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

// ============================================================================
// Event Listeners
// ============================================================================

export const eventApi = {
  onTerminalOutput: (callback: (payload: TerminalOutputPayload) => void): Promise<UnlistenFn> =>
    listen<TerminalOutputPayload>("terminal-output", (event) => callback(event.payload)),
  
  onLocalTerminalOutput: (callback: (payload: TerminalOutputPayload) => void): Promise<UnlistenFn> =>
    listen<TerminalOutputPayload>("local-terminal-output", (event) => callback(event.payload)),
  
  onConnectionStatusChanged: (callback: (payload: ConnectionStatusPayload) => void): Promise<UnlistenFn> =>
    listen<ConnectionStatusPayload>("connection-status-changed", (event) => callback(event.payload)),
  
  onCommandOutput: (callback: (payload: CommandOutputPayload) => void): Promise<UnlistenFn> =>
    listen<CommandOutputPayload>("command-output", (event) => callback(event.payload)),
  
  onUploadProgress: (callback: (payload: UploadProgress) => void): Promise<UnlistenFn> =>
    listen<UploadProgress>("upload-progress", (event) => callback(event.payload)),
  
  emitConnectionStatus: (serverId: string, status: "online" | "offline" | "connecting") =>
    invoke<void>("emit_connection_status", { serverId, status }),
};

// ============================================================================
// Global Event Listener Setup
// ============================================================================

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
