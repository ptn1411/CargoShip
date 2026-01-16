import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Terminal Types
// ============================================================================

export interface MultiplexerSession {
  name: string;
  multiplexer_type: string;
  attached: boolean;
  windows: number | null;
  created_at: string | null;
}

// ============================================================================
// Terminal API
// ============================================================================

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

// ============================================================================
// Local Terminal API
// ============================================================================

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
