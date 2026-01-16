import {
  ChevronRight,
  Code2,
  FileCode,
  FolderOpen,
  LayoutDashboard,
  Rocket,
  Search,
  Server,
  Star,
  Terminal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";

interface CommandItem {
  id: string;
  type: "action" | "server" | "script" | "snippet" | "navigation";
  icon: React.ReactNode;
  title: string;
  description?: string;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * CommandPalette component provides searchable list of all actions
 * Triggered by Ctrl+P shortcut
 * Requirements: 7.3
 */
export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Store state
  const servers = useAppStore((state) => state.servers);
  const scripts = useAppStore((state) => state.scripts);
  const snippets = useAppStore((state) => state.snippets);
  const favorites = useAppStore((state) => state.favorites);

  // Store actions
  const setSidebarItem = useAppStore((state) => state.setSidebarItem);
  const selectServer = useAppStore((state) => state.selectServer);
  const selectScript = useAppStore((state) => state.selectScript);
  const selectSnippet = useAppStore((state) => state.selectSnippet);
  const openTerminal = useAppStore((state) => state.openTerminal);
  const setFileBrowserServer = useAppStore(
    (state) => state.setFileBrowserServer
  );

  // Build command list
  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];

    // Navigation actions
    items.push({
      id: "nav-dashboard",
      type: "navigation",
      icon: <LayoutDashboard className="w-4 h-4" />,
      title: "Go to Dashboard",
      description: "View server overview and metrics",
      action: () => {
        setSidebarItem("dashboard");
        onClose();
      },
    });

    items.push({
      id: "nav-servers",
      type: "navigation",
      icon: <Server className="w-4 h-4" />,
      title: "Go to Servers",
      description: "Manage server connections",
      action: () => {
        setSidebarItem("servers");
        onClose();
      },
    });

    items.push({
      id: "nav-files",
      type: "navigation",
      icon: <FolderOpen className="w-4 h-4" />,
      title: "Go to Files",
      description: "Browse and edit remote files",
      action: () => {
        setSidebarItem("files");
        onClose();
      },
    });

    items.push({
      id: "nav-terminal",
      type: "navigation",
      icon: <Terminal className="w-4 h-4" />,
      title: "Go to Terminal",
      description: "Open SSH terminals",
      action: () => {
        setSidebarItem("terminal");
        onClose();
      },
    });

    items.push({
      id: "nav-scripts",
      type: "navigation",
      icon: <FileCode className="w-4 h-4" />,
      title: "Go to Scripts",
      description: "Manage deployment scripts",
      action: () => {
        setSidebarItem("scripts");
        onClose();
      },
    });

    // Server actions
    servers.forEach((server) => {
      const isFav = favorites.some(
        (f) => f.item_type === "server" && f.item_id === server.id
      );

      items.push({
        id: `server-terminal-${server.id}`,
        type: "server",
        icon: <Terminal className="w-4 h-4" />,
        title: `Open Terminal: ${server.name}`,
        description: `${server.host}:${server.port}`,
        action: async () => {
          await openTerminal(server.id);
          setSidebarItem("terminal");
          onClose();
        },
      });

      items.push({
        id: `server-files-${server.id}`,
        type: "server",
        icon: <FolderOpen className="w-4 h-4" />,
        title: `Browse Files: ${server.name}`,
        description: `${server.host}:${server.port}`,
        action: () => {
          setFileBrowserServer(server.id);
          setSidebarItem("files");
          onClose();
        },
      });

      if (isFav) {
        items.push({
          id: `server-fav-${server.id}`,
          type: "server",
          icon: <Star className="w-4 h-4 text-yellow-500" />,
          title: `★ ${server.name}`,
          description: "Favorite server",
          action: () => {
            selectServer(server.id);
            setSidebarItem("servers");
            onClose();
          },
        });
      }
    });

    // Script actions
    scripts.forEach((script) => {
      items.push({
        id: `script-${script.id}`,
        type: "script",
        icon: <Rocket className="w-4 h-4" />,
        title: `Deploy: ${script.name}`,
        description: script.description || `${script.steps.length} steps`,
        action: () => {
          selectScript(script.id);
          setSidebarItem("scripts");
          onClose();
        },
      });
    });

    // Snippet actions
    snippets.forEach((snippet) => {
      items.push({
        id: `snippet-${snippet.id}`,
        type: "snippet",
        icon: <Code2 className="w-4 h-4" />,
        title: `Snippet: ${snippet.name}`,
        description: snippet.category,
        action: () => {
          selectSnippet(snippet.id);
          onClose();
        },
      });
    });

    return items;
  }, [
    servers,
    scripts,
    snippets,
    favorites,
    setSidebarItem,
    selectServer,
    selectScript,
    selectSnippet,
    openTerminal,
    setFileBrowserServer,
    onClose,
  ]);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      // Show navigation items first, then favorites
      return commands.slice(0, 10);
    }

    const lowerQuery = query.toLowerCase();
    return commands
      .filter(
        (cmd) =>
          cmd.title.toLowerCase().includes(lowerQuery) ||
          cmd.description?.toLowerCase().includes(lowerQuery)
      )
      .slice(0, 10);
  }, [commands, query]);

  // Reset selection when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.children[
        selectedIndex
      ] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredCommands.length - 1 ? prev + 1 : prev
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredCommands, selectedIndex, onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-fade-in" />

      {/* Palette */}
      <div
        className={cn(
          "relative w-full max-w-xl bg-popover border border-border rounded-xl shadow-2xl overflow-hidden",
          "animate-slide-down"
        )}
        onClick={(e) => e.stopPropagation()}>
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
          <Search className="w-5 h-5 text-primary" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, servers, scripts..."
            className={cn(
              "flex-1 bg-transparent outline-none text-sm",
              "placeholder:text-muted-foreground",
              "focus:ring-0"
            )}
            aria-label="Search commands"
            aria-describedby="command-palette-hint"
          />
          <div
            id="command-palette-hint"
            className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <kbd className="px-1.5 py-0.5 rounded-md bg-muted border border-border font-mono">
              ↑↓
            </kbd>
            <span>navigate</span>
          </div>
          <button
            onClick={onClose}
            className={cn(
              "p-1.5 rounded-lg cursor-pointer",
              "text-muted-foreground hover:text-foreground",
              "hover:bg-accent transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            )}
            aria-label="Close command palette">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="max-h-[360px] overflow-auto py-2"
          role="listbox"
          aria-label="Command results">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Search
                className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4"
                aria-hidden="true"
              />
              <p className="text-sm text-muted-foreground">No results found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Try a different search term
              </p>
            </div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                onClick={cmd.action}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer",
                  "transition-all duration-150",
                  "focus-visible:outline-none",
                  index === selectedIndex
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-accent/50 text-foreground"
                )}
                role="option"
                aria-selected={index === selectedIndex}>
                <div
                  className={cn(
                    "p-2 rounded-lg",
                    cmd.type === "navigation" && "bg-primary/10 text-primary",
                    cmd.type === "server" &&
                      "bg-blue-500/10 text-blue-500 dark:text-blue-400",
                    cmd.type === "script" &&
                      "bg-green-500/10 text-green-500 dark:text-green-400",
                    cmd.type === "snippet" &&
                      "bg-purple-500/10 text-purple-500 dark:text-purple-400",
                    cmd.type === "action" && "bg-muted text-muted-foreground"
                  )}>
                  {cmd.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{cmd.title}</p>
                  {cmd.description && (
                    <p className="text-xs text-muted-foreground truncate">
                      {cmd.description}
                    </p>
                  )}
                </div>
                {cmd.shortcut && (
                  <kbd className="px-2 py-1 rounded-md bg-muted border border-border text-xs text-muted-foreground font-mono">
                    {cmd.shortcut}
                  </kbd>
                )}
                <ChevronRight
                  className={cn(
                    "w-4 h-4 transition-transform duration-150",
                    index === selectedIndex
                      ? "text-primary translate-x-0.5"
                      : "text-muted-foreground"
                  )}
                  aria-hidden="true"
                />
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-muted/30 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 rounded-md bg-background border border-border font-mono">
                Enter
              </kbd>
              <span>select</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 rounded-md bg-background border border-border font-mono">
                Esc
              </kbd>
              <span>close</span>
            </div>
          </div>
          <div className="text-muted-foreground/70">
            {filteredCommands.length} result
            {filteredCommands.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
