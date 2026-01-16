import { useEffect, useState, useCallback } from "react";
import { Sidebar, MainContent, StatusBar } from "./components/layout";
import { ServerList } from "./components/servers";
import { GroupList } from "./components/groups";
import { FileBrowser } from "./components/files";
import { TerminalContainer } from "./components/terminal";
import { ScriptManagement } from "./components/scripts";
import { FileEditor, EditorModal } from "./components/editor";
import { Dashboard } from "./components/dashboard";
import { ToastContainer } from "./components/ui";
import { CommandPalette } from "./components/quick-actions";
import { SnippetList } from "./components/snippets";
import { SshKeyList } from "./components/ssh-keys";
import { NginxManager } from "./components/nginx";
import { DatabaseManager } from "./components/database";
import { DockerManager } from "./components/docker";
import { useAppStore, setupEventListeners } from "./store";

function App() {
  const sidebarItem = useAppStore((state) => state.sidebarItem);
  const setSidebarItem = useAppStore((state) => state.setSidebarItem);
  const theme = useAppStore((state) => state.theme);
  const terminalSessions = useAppStore((state) => state.terminalSessions);
  const serverStatus = useAppStore((state) => state.serverStatus);
  const toasts = useAppStore((state) => state.toasts);
  const removeToast = useAppStore((state) => state.removeToast);
  const loadEditorSettings = useAppStore((state) => state.loadEditorSettings);
  const openFiles = useAppStore((state) => state.openFiles);
  
  // Editor modal state
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  
  // Command palette state - Requirements 7.3
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Count online connections
  const connectionCount = Object.values(serverStatus).filter(
    (status) => status === "online"
  ).length;

  // Command palette keyboard shortcut (Ctrl+P) - Requirements 7.3
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "p") {
      e.preventDefault();
      setIsCommandPaletteOpen(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Setup event listeners and load initial data on mount
  useEffect(() => {
    let cleanup: (() => void) | null = null;

    setupEventListeners().then((cleanupFn) => {
      cleanup = cleanupFn;
    });

    // Load editor settings on app start
    loadEditorSettings();

    // Request notification permission for alerts
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, [loadEditorSettings]);

  // Detect system theme preference
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    
    const updateTheme = () => {
      if (theme === "system") {
        document.documentElement.classList.toggle("dark", mediaQuery.matches);
      }
    };

    updateTheme();

    const handler = (e: MediaQueryListEvent) => {
      if (theme === "system") {
        document.documentElement.classList.toggle("dark", e.matches);
      }
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [theme]);

  // Apply theme class to document
  useEffect(() => {
    if (theme === "light") {
      document.documentElement.classList.remove("dark");
    } else if (theme === "dark") {
      document.documentElement.classList.add("dark");
    }
    // "system" is handled by the media query effect above
  }, [theme]);

  const renderContent = () => {
    switch (sidebarItem) {
      case "dashboard":
        return <Dashboard />;
      case "servers":
        return <ServerList />;
      case "groups":
        return <GroupList />;
      case "files":
        // Show FileBrowser - hide side editor when modal is open
        return (
          <div className="h-full flex gap-4">
            <div className={(openFiles.length > 0 && !isEditorModalOpen) ? "w-1/3 min-w-[300px] max-w-[400px]" : "w-full"}>
              <FileBrowser onOpenFileFullscreen={() => setIsEditorModalOpen(true)} />
            </div>
            {openFiles.length > 0 && !isEditorModalOpen && (
              <div className="flex-1 min-w-0">
                <FileEditor />
              </div>
            )}
          </div>
        );
      case "terminal":
        return <TerminalContainer />;
      case "scripts":
        return <ScriptManagement />;
      case "snippets":
        return <SnippetList />;
      case "ssh-keys":
        return <SshKeyList />;
      case "nginx":
        return <NginxManager />;
      case "database":
        return <DatabaseManager />;
      case "docker":
        return <DockerManager />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        <Sidebar activeItem={sidebarItem} onItemSelect={setSidebarItem} />
        <MainContent>{renderContent()}</MainContent>
      </div>
      <StatusBar
        connectionCount={connectionCount}
        activeTerminals={terminalSessions.length}
      />
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
      
      {/* Editor Modal - Fullscreen */}
      <EditorModal 
        isOpen={isEditorModalOpen} 
        onClose={() => setIsEditorModalOpen(false)} 
      />
      
      {/* Command Palette - Requirements 7.3 */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
    </div>
  );
}

export default App;
