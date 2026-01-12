import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { terminalApi, eventApi } from "../../lib/tauri";
import { useAppStore } from "../../store";

interface TerminalViewProps {
  sessionId: string;
  isActive: boolean;
}

// Global map to track which sessions have active listeners
const activeListeners = new Map<string, { unlisten: () => void; terminal: Terminal }>();

export function TerminalView({ sessionId, isActive }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const mountedRef = useRef(false);
  
  const theme = useAppStore((state) => state.theme);
  const resizeTerminal = useAppStore((state) => state.resizeTerminal);

  // Get theme colors
  const getThemeColors = useCallback(() => {
    const isDark = theme === "dark" || 
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    
    return {
      background: isDark ? "#0a0a0f" : "#ffffff",
      foreground: isDark ? "#e4e4e7" : "#18181b",
      cursor: isDark ? "#e4e4e7" : "#18181b",
      cursorAccent: isDark ? "#0a0a0f" : "#ffffff",
      selectionBackground: isDark ? "#3f3f46" : "#d4d4d8",
      black: isDark ? "#18181b" : "#fafafa",
      red: "#ef4444",
      green: "#22c55e",
      yellow: "#eab308",
      blue: "#3b82f6",
      magenta: "#a855f7",
      cyan: "#06b6d4",
      white: isDark ? "#fafafa" : "#18181b",
      brightBlack: isDark ? "#52525b" : "#a1a1aa",
      brightRed: "#f87171",
      brightGreen: "#4ade80",
      brightYellow: "#facc15",
      brightBlue: "#60a5fa",
      brightMagenta: "#c084fc",
      brightCyan: "#22d3ee",
      brightWhite: isDark ? "#ffffff" : "#09090b",
    };
  }, [theme]);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Prevent double initialization in StrictMode
    if (mountedRef.current) return;
    mountedRef.current = true;

    // Clean up any existing listener for this session
    const existing = activeListeners.get(sessionId);
    if (existing) {
      existing.unlisten();
      existing.terminal.dispose();
      activeListeners.delete(sessionId);
    }

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: getThemeColors(),
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Handle terminal input
    terminal.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      terminalApi.write(sessionId, bytes).catch(console.error);
    });

    // Handle terminal resize
    terminal.onResize(({ cols, rows }) => {
      resizeTerminal(sessionId, cols, rows);
    });

    // Start streaming terminal output
    terminalApi.startStream(sessionId).catch(console.error);

    // Listen for terminal output events
    eventApi.onTerminalOutput((payload) => {
      if (payload.session_id === sessionId && terminalRef.current) {
        const text = new TextDecoder().decode(new Uint8Array(payload.data));
        terminalRef.current.write(text);
      }
    }).then((unlisten) => {
      // Store the listener so we can clean it up
      activeListeners.set(sessionId, { unlisten, terminal });
    });

    // Initial resize notification
    const { cols, rows } = terminal;
    resizeTerminal(sessionId, cols, rows);

    return () => {
      mountedRef.current = false;
      const listener = activeListeners.get(sessionId);
      if (listener) {
        listener.unlisten();
        activeListeners.delete(sessionId);
      }
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, getThemeColors, resizeTerminal]);

  // Update theme when it changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getThemeColors();
    }
  }, [theme, getThemeColors]);

  // Handle resize when active state changes or window resizes
  useEffect(() => {
    if (!isActive || !fitAddonRef.current) return;

    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    // Fit on activation
    handleResize();

    // Listen for window resize
    window.addEventListener("resize", handleResize);
    
    // Use ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
    };
  }, [isActive]);

  // Focus terminal when active
  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus();
    }
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ display: isActive ? "block" : "none" }}
    />
  );
}
