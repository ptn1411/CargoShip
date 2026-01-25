import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { eventApi, Snippet, terminalApi } from "../../lib/tauri";
import { useAppStore } from "../../store";
import { SearchOptions, TerminalSearch } from "./TerminalSearch";
import {
  DEFAULT_TERMINAL_SETTINGS,
  getTerminalThemeColors,
  TerminalSettingsData,
} from "./TerminalSettings";
import { TerminalSuggestions } from "./TerminalSuggestions";

interface TerminalViewProps {
  sessionId: string;
  isActive: boolean;
  alwaysVisible?: boolean;
  terminalSettings?: TerminalSettingsData;
}

const activeListeners = new Map<
  string,
  { unlisten: () => void; terminal: Terminal }
>();

export function TerminalView({
  sessionId,
  isActive,
  alwaysVisible = false,
  terminalSettings,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const mountedRef = useRef(false);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);

  // Suggestions state
  const snippets = useAppStore((state) => state.snippets);
  const [suggestions, setSuggestions] = useState<Snippet[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [suggestionPosition, setSuggestionPosition] = useState({
    top: 0,
    left: 0,
  });
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [currentInput, setCurrentInput] = useState("");

  const theme = useAppStore((state) => state.theme);
  const resizeTerminal = useAppStore((state) => state.resizeTerminal);

  const isSuggestionsOpenRef = useRef(isSuggestionsOpen);
  const selectedIndexRef = useRef(selectedSuggestionIndex);
  const suggestionsRef = useRef(suggestions);
  const snippetsRef = useRef(snippets);
  const currentInputRef = useRef(currentInput);

  useEffect(() => {
    isSuggestionsOpenRef.current = isSuggestionsOpen;
    selectedIndexRef.current = selectedSuggestionIndex;
    suggestionsRef.current = suggestions;
    currentInputRef.current = currentInput;
  }, [isSuggestionsOpen, selectedSuggestionIndex, suggestions, currentInput]);

  useEffect(() => {
    snippetsRef.current = snippets;
  }, [snippets]);

  const settings = terminalSettings || DEFAULT_TERMINAL_SETTINGS;

  const getThemeColors = useCallback(() => {
    if (terminalSettings) {
      return getTerminalThemeColors(terminalSettings.theme);
    }
    const isDark =
      theme === "dark" ||
      (theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    return getTerminalThemeColors(isDark ? "dark" : "light");
  }, [theme, terminalSettings]);

  // Function to check and update suggestions
  const checkAndUpdateSuggestions = useCallback(() => {
    if (!terminalRef.current || !containerRef.current) return;

    const terminal = terminalRef.current;
    const buffer = terminal.buffer.active;
    const cursorY = buffer.cursorY;
    const cursorX = buffer.cursorX;

    // Get current line up to cursor
    const line =
      buffer.getLine(cursorY + buffer.baseY)?.translateToString(true) || "";
    const lineUpToCursor = line.substring(0, cursorX);

    // Extract the last word (current command being typed)
    const match = lineUpToCursor.match(/(\S+)$/);
    const lastWord = match ? match[1] : "";

    setCurrentInput(lastWord);

    if (lastWord.length < 2) {
      setIsSuggestionsOpen(false);
      return;
    }

    // Find matching snippets
    const matches = snippetsRef.current
      .filter((s) => {
        const searchLower = lastWord.toLowerCase();
        return (
          s.name.toLowerCase().includes(searchLower) ||
          s.command.toLowerCase().startsWith(searchLower)
        );
      })
      .slice(0, 10);

    if (matches.length > 0) {
      setSuggestions(matches);
      setSelectedSuggestionIndex(0);

      // Calculate position with a simpler, more reliable method
      try {
        const rect = containerRef.current.getBoundingClientRect();
        const cols = terminal.cols;
        const rows = terminal.rows;

        // Calculate cell size from container dimensions
        const cellWidth = rect.width / cols;
        const cellHeight = rect.height / rows;

        // Position below cursor with some offset
        const top = rect.top + (cursorY + 1) * cellHeight + 5;
        const left = rect.left + cursorX * cellWidth;

        console.log("Position calculated:", {
          top,
          left,
          cursorX,
          cursorY,
          cellWidth: cellWidth.toFixed(2),
          cellHeight: cellHeight.toFixed(2),
          cols,
          rows,
          containerWidth: rect.width,
          containerHeight: rect.height,
        });

        setSuggestionPosition({ top, left });
      } catch (e) {
        console.error("Error calculating suggestion position:", e);
        // Fallback: show near top-left of terminal
        const rect = containerRef.current.getBoundingClientRect();
        setSuggestionPosition({ top: rect.top + 50, left: rect.left + 50 });
      }

      setIsSuggestionsOpen(true);
    } else {
      setIsSuggestionsOpen(false);
    }
  }, []);

  // Search handlers
  const handleSearch = useCallback((term: string, options: SearchOptions) => {
    if (!searchAddonRef.current || !term) {
      setMatchCount(0);
      setCurrentMatch(0);
      return;
    }

    searchAddonRef.current.clearDecorations();

    if (term.length === 0) {
      setMatchCount(0);
      setCurrentMatch(0);
      return;
    }

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
      let count = 0;
      const buffer = terminalRef.current?.buffer.active;
      if (buffer) {
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i)?.translateToString() || "";
          const searchRegex = options.regex
            ? new RegExp(term, options.caseSensitive ? "g" : "gi")
            : new RegExp(
                term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                options.caseSensitive ? "g" : "gi",
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
    terminalRef.current?.focus();
  }, []);

  // Handle snippet selection
  const handleSelectSnippet = useCallback(
    (snippet: Snippet) => {
      if (!terminalRef.current) return;

      const terminal = terminalRef.current;
      const buffer = terminal.buffer.active;
      const cursorX = buffer.cursorX;

      // Calculate how many backspaces we need
      const inputLength = currentInputRef.current.length;

      // Send backspaces to clear current input
      const backspaces = "\x7F".repeat(inputLength);
      const commandToSend = backspaces + snippet.command;

      const bytes = Array.from(new TextEncoder().encode(commandToSend));
      terminalApi.write(sessionId, bytes).catch(console.error);

      setIsSuggestionsOpen(false);
      setCurrentInput("");
      terminal.focus();
    },
    [sessionId],
  );

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return;
    if (mountedRef.current) return;
    mountedRef.current = true;

    const existing = activeListeners.get(sessionId);
    if (existing) {
      existing.unlisten();
      existing.terminal.dispose();
      activeListeners.delete(sessionId);
    }

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
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData("text");
      if (text) {
        const bytes = Array.from(new TextEncoder().encode(text));
        terminalApi.write(sessionId, bytes).catch(console.error);
      }
    };
    containerRef.current.addEventListener("paste", handlePaste);

    terminal.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      terminalApi.write(sessionId, bytes).catch(console.error);
    });

    terminal.onResize(({ cols, rows }) => {
      resizeTerminal(sessionId, cols, rows);
    });

    terminalApi.startStream(sessionId).catch(console.error);

    eventApi
      .onTerminalOutput((payload) => {
        if (payload.session_id === sessionId && terminalRef.current) {
          const text = new TextDecoder().decode(new Uint8Array(payload.data));
          terminalRef.current.write(text);
        }
      })
      .then((unlisten) => {
        activeListeners.set(sessionId, { unlisten, terminal });
      });

    const { cols, rows } = terminal;
    resizeTerminal(sessionId, cols, rows);

    const container = containerRef.current;

    return () => {
      mountedRef.current = false;
      container?.removeEventListener("paste", handlePaste);
      const listener = activeListeners.get(sessionId);
      if (listener) {
        listener.unlisten();
        activeListeners.delete(sessionId);
      }
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [sessionId, getThemeColors, resizeTerminal, settings]);

  // Attach key handler with access to fresh state via refs
  useEffect(() => {
    if (!terminalRef.current) return;

    const terminal = terminalRef.current;

    const handleKey = (event: KeyboardEvent) => {
      if (event.type !== "keydown") return true;

      // Suggestions navigation
      if (isSuggestionsOpenRef.current) {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedSuggestionIndex((prev) => Math.max(0, prev - 1));
          return false;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedSuggestionIndex((prev) =>
            Math.min(suggestionsRef.current.length - 1, prev + 1),
          );
          return false;
        }
        if (event.key === "Tab" || event.key === "Enter") {
          event.preventDefault();
          const selected = suggestionsRef.current[selectedIndexRef.current];
          if (selected) {
            handleSelectSnippet(selected);
          }
          return false;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setIsSuggestionsOpen(false);
          setCurrentInput("");
          return false;
        }
      }

      // Ctrl+F = open search
      if (event.ctrlKey && !event.shiftKey && event.key === "f") {
        event.preventDefault();
        setIsSearchOpen(true);
        return false;
      }

      // Ctrl+C copy
      if (
        event.ctrlKey &&
        !event.shiftKey &&
        event.key === "c" &&
        terminal.hasSelection()
      ) {
        event.preventDefault();
        const selection = terminal.getSelection();
        navigator.clipboard.writeText(selection);
        return false;
      }

      return true;
    };

    terminal.attachCustomKeyEventHandler(handleKey);

    // Listen to terminal writes to update suggestions
    const dataDisposable = terminal.onData(() => {
      // Use a slight delay to allow terminal to update
      setTimeout(() => {
        checkAndUpdateSuggestions();
      }, 10);
    });

    return () => {
      dataDisposable.dispose();
    };
  }, [sessionId, handleSelectSnippet, checkAndUpdateSuggestions]);

  // Update theme and settings when they change
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getThemeColors();
      terminalRef.current.options.fontSize = settings.fontSize;
      terminalRef.current.options.fontFamily = settings.fontFamily;
      terminalRef.current.options.cursorStyle = settings.cursorStyle;
      terminalRef.current.options.cursorBlink = settings.cursorBlink;
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    }
  }, [theme, getThemeColors, settings]);

  // Handle resize when active state changes or window resizes
  useEffect(() => {
    if (!fitAddonRef.current) return;
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

  // Focus terminal when active
  useEffect(() => {
    if (
      isActive &&
      terminalRef.current &&
      !isSearchOpen &&
      !isSuggestionsOpen
    ) {
      terminalRef.current.focus();
    }
  }, [isActive, isSearchOpen, isSuggestionsOpen]);

  return (
    <div
      className="relative w-full h-full overflow-visible"
      style={{ display: alwaysVisible || isActive ? "block" : "none" }}>
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
      {isSuggestionsOpen && (
        <TerminalSuggestions
          isOpen={isSuggestionsOpen}
          suggestions={suggestions}
          selectedIndex={selectedSuggestionIndex}
          onSelect={handleSelectSnippet}
          position={suggestionPosition}
          containerRef={containerRef}
        />
      )}
    </div>
  );
}
