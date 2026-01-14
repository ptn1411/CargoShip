import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { localTerminalApi, eventApi } from "../../lib/tauri";
import { useAppStore } from "../../store";

interface LocalTerminalViewProps {
  sessionId: string;
  isActive: boolean;
  alwaysVisible?: boolean;
  onResize?: (cols: number, rows: number) => void;
}

export function LocalTerminalView({ sessionId, isActive, alwaysVisible = false, onResize }: LocalTerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const isInitializedRef = useRef(false);
  
  const theme = useAppStore((state) => state.theme);

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

  useEffect(() => {
    if (!containerRef.current || isInitializedRef.current) return;
    isInitializedRef.current = true;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: getThemeColors(),
      allowProposedApi: true,
      rightClickSelectsWord: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(containerRef.current);
    
    // Small delay to ensure container is properly sized
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Block default paste event on container to prevent duplicate
    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData('text');
      if (text) {
        const bytes = Array.from(new TextEncoder().encode(text));
        localTerminalApi.write(sessionId, bytes).catch(console.error);
      }
    };
    containerRef.current.addEventListener('paste', handlePaste);

    // Handle copy with Ctrl+C when text is selected
    terminal.attachCustomKeyEventHandler((event) => {
      // Only handle keydown events
      if (event.type !== 'keydown') return true;

      // Ctrl+C with selection = copy
      if (event.ctrlKey && !event.shiftKey && event.key === 'c' && terminal.hasSelection()) {
        event.preventDefault();
        const selection = terminal.getSelection();
        navigator.clipboard.writeText(selection);
        return false; // Prevent default (don't send SIGINT)
      }
      // Ctrl+V = paste (handled by paste event listener above)
      if (event.ctrlKey && !event.shiftKey && event.key === 'v') {
        // Don't prevent - let paste event handle it
        return true;
      }
      // Ctrl+Shift+C = copy (alternative)
      if (event.ctrlKey && event.shiftKey && event.key === 'C') {
        event.preventDefault();
        const selection = terminal.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
        }
        return false;
      }
      // Ctrl+Shift+V = paste (alternative - manual handling)
      if (event.ctrlKey && event.shiftKey && event.key === 'V') {
        event.preventDefault();
        navigator.clipboard.readText().then((text) => {
          if (text) {
            const bytes = Array.from(new TextEncoder().encode(text));
            localTerminalApi.write(sessionId, bytes).catch(console.error);
          }
        });
        return false;
      }
      return true; // Let other keys pass through
    });

    // Handle terminal input
    const dataDisposable = terminal.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      localTerminalApi.write(sessionId, bytes).catch(console.error);
    });

    // Handle terminal resize
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      localTerminalApi.resize(sessionId, cols, rows).catch(console.error);
      onResize?.(cols, rows);
    });

    // Setup async initialization
    const initAsync = async () => {
      try {
        // Listen for terminal output events first
        const unlisten = await eventApi.onLocalTerminalOutput((payload) => {
          if (payload.session_id === sessionId && terminalRef.current) {
            const text = new TextDecoder().decode(new Uint8Array(payload.data));
            terminalRef.current.write(text);
          }
        });
        unlistenRef.current = unlisten;

        // Then start streaming terminal output
        await localTerminalApi.startStream(sessionId);

        // Initial resize after stream is ready
        const { cols, rows } = terminal;
        await localTerminalApi.resize(sessionId, cols, rows);
      } catch (error) {
        console.error("Failed to initialize local terminal:", error);
      }
    };

    initAsync();

    // Store container ref for cleanup
    const container = containerRef.current;

    return () => {
      isInitializedRef.current = false;
      
      // Cleanup paste listener
      container?.removeEventListener('paste', handlePaste);
      
      // Cleanup event listener
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      
      // Dispose terminal handlers
      dataDisposable.dispose();
      resizeDisposable.dispose();
      
      // Dispose terminal
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, getThemeColors, onResize]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getThemeColors();
    }
  }, [theme, getThemeColors]);

  useEffect(() => {
    if (!fitAddonRef.current) return;
    // In alwaysVisible mode, always handle resize; otherwise only when active
    if (!alwaysVisible && !isActive) return;

    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    handleResize();

    window.addEventListener("resize", handleResize);
    
    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
    };
  }, [isActive, alwaysVisible]);

  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus();
    }
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ display: (alwaysVisible || isActive) ? "block" : "none" }}
    />
  );
}
