import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Search,
  Server,
  FileCode,
  Terminal,
  FolderOpen,
  Rocket,
  LayoutDashboard,
  Code2,
  Star,
  X,
  ChevronRight,
} from "lucide-react";
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
  const setFileBrowserServer = useAppStore((state) => state.setFileBrowserServer);

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
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
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
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />

      {/* Palette */}
      <div
        className="relative w-full max-w-lg bg-popover border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-5 h-5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, servers, scripts..."
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border">
              ↑↓
            </kbd>
            <span>navigate</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-secondary text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[300px] overflow-auto py-2">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground">
              <p className="text-sm">No results found</p>
              <p className="text-xs mt-1">Try a different search term</p>
            </div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                onClick={cmd.action}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                  index === selectedIndex
                    ? "bg-accent"
                    : "hover:bg-accent/50"
                )}
              >
                <div
                  className={cn(
                    "p-1.5 rounded",
                    cmd.type === "navigation" && "bg-primary/10 text-primary",
                    cmd.type === "server" && "bg-blue-500/10 text-blue-500",
                    cmd.type === "script" && "bg-green-500/10 text-green-500",
                    cmd.type === "snippet" && "bg-purple-500/10 text-purple-500",
                    cmd.type === "action" && "bg-secondary text-muted-foreground"
                  )}
                >
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
                  <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border text-xs text-muted-foreground">
                    {cmd.shortcut}
                  </kbd>
                )}
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border bg-secondary/50 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 rounded bg-background border border-border">
              Enter
            </kbd>
            <span>to select</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 rounded bg-background border border-border">
              Esc
            </kbd>
            <span>to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
