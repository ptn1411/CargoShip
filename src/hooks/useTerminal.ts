import { useEffect, useCallback, useRef } from "react";
import {
  useAppStore,
  useTerminalSessions,
  useActiveTerminal,
  useIsCreatingTerminal,
  useTerminalError,
  TerminalSession,
} from "../store";
import { eventApi, terminalApi, TerminalOutputPayload } from "../lib/tauri";

export interface UseTerminalReturn {
  sessions: TerminalSession[];
  activeSession: TerminalSession | null;
  activeSessionId: string | null;
  isCreating: boolean;
  error: string | null;
  openTerminal: (serverId: string) => Promise<string>;
  closeTerminal: (sessionId: string) => Promise<void>;
  setActiveTerminal: (sessionId: string | null) => void;
  resizeTerminal: (sessionId: string, cols: number, rows: number) => Promise<void>;
  writeToTerminal: (sessionId: string, data: string | Uint8Array) => Promise<void>;
}

export function useTerminal(): UseTerminalReturn {
  const sessions = useTerminalSessions();
  const activeSession = useActiveTerminal();
  const isCreating = useIsCreatingTerminal();
  const error = useTerminalError();

  const activeSessionId = useAppStore((state) => state.activeTerminalId);
  const openTerminal = useAppStore((state) => state.openTerminal);
  const closeTerminal = useAppStore((state) => state.closeTerminal);
  const setActiveTerminal = useAppStore((state) => state.setActiveTerminal);
  const resizeTerminal = useAppStore((state) => state.resizeTerminal);

  // Write data to terminal
  const writeToTerminal = useCallback(
    async (sessionId: string, data: string | Uint8Array) => {
      const bytes =
        typeof data === "string"
          ? Array.from(new TextEncoder().encode(data))
          : Array.from(data);
      await terminalApi.write(sessionId, bytes);
    },
    []
  );

  return {
    sessions,
    activeSession,
    activeSessionId,
    isCreating,
    error,
    openTerminal,
    closeTerminal,
    setActiveTerminal,
    resizeTerminal,
    writeToTerminal,
  };
}

// Hook for terminal output subscription
export function useTerminalOutput(
  sessionId: string | null,
  onOutput: (data: Uint8Array) => void
) {
  const callbackRef = useRef(onOutput);
  callbackRef.current = onOutput;

  useEffect(() => {
    if (!sessionId) return;

    let unsubscribe: (() => void) | null = null;

    const setup = async () => {
      // Start streaming for this session
      try {
        await terminalApi.startStream(sessionId);
      } catch (error) {
        console.error("Failed to start terminal stream:", error);
      }

      // Subscribe to terminal output events
      const unlisten = await eventApi.onTerminalOutput(
        (payload: TerminalOutputPayload) => {
          if (payload.session_id === sessionId) {
            callbackRef.current(new Uint8Array(payload.data));
          }
        }
      );
      unsubscribe = unlisten;
    };

    setup();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [sessionId]);
}
