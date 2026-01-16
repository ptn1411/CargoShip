import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import { localTerminalApi, eventApi } from "../../lib/tauri";
import { useAppStore } from "../../store";
import { TerminalSearch, SearchOptions } from "./TerminalSearch";
import { TerminalSettingsData, getTerminalThemeColors, DEFAULT_TERMINAL_SETTINGS } from "./TerminalSettings";

interface LocalTerminalViewProps {
  sessionId: string;
  isActive: boolean;
  alwaysVisible?: boolean;
  onResize?: (cols: number, rows: number) => void;
  terminalSettings?: TerminalSettingsData;
}

export function LocalTerminalView({ sessionId, isActive, alwaysVisible = false, onResize, terminalSettings }: LocalTerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const isInitializedRef = useRef(false);
  
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  
  const theme = useAppStore((state) => state.theme);

  // Use terminal settings or fall back to defaults
  const settings = terminalSettings || DEFAULT_TERMINAL_SETTINGS;

  const getThemeColors = useCallback(() => {
    if (terminalSettings) {
      return getTerminalThemeColors(terminalSettings.theme);
    }
    
    // Fall back to system theme
    const isDark = theme === "dark" || 
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    
    return getTerminalThemeColors(isDark ? "dark" : "light");
  }, [theme, terminalSettings]);

  // Search handlers
  const handleSearch = useCallback((term: string, options: SearchOptions) => {
    if (!searchAddonRef.current || !term) {
      setMatchCount(0);
      setCurrentMatch(0);
      return;
    }

    // Clear previous decorations
    searchAddonRef.current.clearDecorations();

    if (term.length === 0) {
      setMatchCount(0);
      setCurrentMatch(0);
      return;
    }

    // Find all matches and highlight
    const found = searchAddonRef.current.findNext(term, {
      caseSensitive: options.caseSensitive,
      regex: options.regex,
      wholeWord: options.wholeWord,
      decorations: {
        matchBackground: "#facc15",
        matchBorder: "#eab308",
        matchOverviewRuler: "#facc15",
        activeMatchBackground: "#22c55e",
        activeMatchBorder: "#16a34a",
        activeMatchColorOverviewRuler: "#22c55e",
      },
    });

    if (found) {
      // Count matches by searching through buffer
      let count = 0;
      const buffer = terminalRef.current?.buffer.active;
      if (buffer) {
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i)?.translateToString() || "";
          const searchRegex = options.regex
            ? new RegExp(term, options.caseSensitive ? "g" : "gi")
            : new RegExp(
                term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                options.caseSensitive ? "g" : "gi"
              );
          const matches = line.match(searchRegex);
          if (matches) {
            count += matches.length;
          }
        }
      }
      setMatchCount(count);
      setCurrentMatch(count > 0 ? 1 : 0);
    } else {
      setMatchCount(0);
      setCurrentMatch(0);
    }
  }, []);

  const handleFindNext = useCallback(() => {
    if (searchAddonRef.current) {
      searchAddonRef.current.findNext("");
      setCurrentMatch((prev) => (prev < matchCount ? prev + 1 : 1));
    }
  }, [matchCount]);

  const handleFindPrevious = useCallback(() => {
    if (searchAddonRef.current) {
      searchAddonRef.current.findPrevious("");
      setCurrentMatch((prev) => (prev > 1 ? prev - 1 : matchCount));
    }
  }, [matchCount]);

  const handleCloseSearch = useCallback(() => {
    setIsSearchOpen(false);
    if (searchAddonRef.current) {
      searchAddonRef.current.clearDecorations();
    }
    setMatchCount(0);
    setCurrentMatch(0);
    // Focus terminal after closing search
    terminalRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!containerRef.current || isInitializedRef.current) return;
    isInitializedRef.current = true;

    const terminal = new Terminal({
      cursorBlink: settings.cursorBlink,
      cursorStyle: settings.cursorStyle,
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      theme: getThemeColors(),
      allowProposedApi: true,
      rightClickSelectsWord: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(searchAddon);

    terminal.open(containerRef.current);
    
    // Small delay to ensure container is properly sized
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

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

      // Ctrl+F = open search
      if (event.ctrlKey && !event.shiftKey && event.key === 'f') {
        event.preventDefault();
        setIsSearchOpen(true);
        return false;
      }

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
      searchAddonRef.current = null;
    };
  }, [sessionId, getThemeColors, onResize, settings]);

  // Update theme and settings when they change
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getThemeColors();
      terminalRef.current.options.fontSize = settings.fontSize;
      terminalRef.current.options.fontFamily = settings.fontFamily;
      terminalRef.current.options.cursorStyle = settings.cursorStyle;
      terminalRef.current.options.cursorBlink = settings.cursorBlink;
      // Refit after font changes
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    }
  }, [theme, getThemeColors, settings]);

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
    if (isActive && terminalRef.current && !isSearchOpen) {
      terminalRef.current.focus();
    }
  }, [isActive, isSearchOpen]);

  return (
    <div
      className="relative w-full h-full"
      style={{ display: (alwaysVisible || isActive) ? "block" : "none" }}
    >
      <div ref={containerRef} className="w-full h-full" />
      <TerminalSearch
        isOpen={isSearchOpen}
        onClose={handleCloseSearch}
        onSearch={handleSearch}
        onFindNext={handleFindNext}
        onFindPrevious={handleFindPrevious}
        matchCount={matchCount}
        currentMatch={currentMatch}
      />
    </div>
  );
}
