import { useEffect } from "react";
import { Sidebar, MainContent, StatusBar } from "./components/layout";
import { ServerList } from "./components/servers";
import { FileBrowser } from "./components/files";
import { TerminalContainer } from "./components/terminal";
import { ToastContainer } from "./components/ui";
import { useAppStore, setupEventListeners } from "./store";

function App() {
  const sidebarItem = useAppStore((state) => state.sidebarItem);
  const setSidebarItem = useAppStore((state) => state.setSidebarItem);
  const theme = useAppStore((state) => state.theme);
  const terminalSessions = useAppStore((state) => state.terminalSessions);
  const serverStatus = useAppStore((state) => state.serverStatus);
  const toasts = useAppStore((state) => state.toasts);
  const removeToast = useAppStore((state) => state.removeToast);

  // Count online connections
  const connectionCount = Object.values(serverStatus).filter(
    (status) => status === "online"
  ).length;

  // Setup event listeners on mount
  useEffect(() => {
    let cleanup: (() => void) | null = null;

    setupEventListeners().then((cleanupFn) => {
      cleanup = cleanupFn;
    });

    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, []);

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
      case "servers":
        return <ServerList />;
      case "files":
        return <FileBrowser />;
      case "terminal":
        return <TerminalContainer />;
      default:
        return <ServerList />;
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
    </div>
  );
}

export default App;
