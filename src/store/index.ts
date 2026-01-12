import { create } from "zustand";
import {
  Server,
  CreateServerInput,
  UpdateServerInput,
  FileEntry,
  Breadcrumb,
  ConnectionStatus,
  ConnectionStatusPayload,
  TerminalOutputPayload,
  serverApi,
  fileApi,
  terminalApi,
  credentialApi,
  setupGlobalEventListeners,
  EventListenerCleanup,
} from "../lib/tauri";

// Terminal Session type for frontend state
export interface TerminalSession {
  id: string;
  serverId: string;
  serverName: string;
  isConnected: boolean;
  createdAt: Date;
}

// Connection status type
export type ServerConnectionStatus = "online" | "offline" | "connecting";

// Toast types
export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  action?: ToastAction;
  duration?: number;
}

// App State Interface
export interface AppState {
  // Servers
  servers: Server[];
  selectedServerId: string | null;
  serverStatus: Record<string, ServerConnectionStatus>;
  isLoadingServers: boolean;
  serverError: string | null;

  // File Browser
  currentServerId: string | null;
  currentPath: string;
  fileEntries: FileEntry[];
  breadcrumbs: Breadcrumb[];
  isLoadingFiles: boolean;
  fileError: string | null;
  searchPattern: string;

  // Terminal
  terminalSessions: TerminalSession[];
  activeTerminalId: string | null;
  isCreatingTerminal: boolean;
  terminalError: string | null;

  // UI
  sidebarItem: "servers" | "files" | "terminal";
  theme: "light" | "dark" | "system";

  // Toasts
  toasts: ToastData[];

  // Server Actions
  loadServers: () => Promise<void>;
  addServer: (input: CreateServerInput, credential?: string) => Promise<Server>;
  updateServer: (id: string, input: UpdateServerInput) => Promise<Server>;
  deleteServer: (id: string) => Promise<void>;
  selectServer: (id: string | null) => void;
  testConnection: (id: string) => Promise<ConnectionStatus>;
  setServerStatus: (serverId: string, status: ServerConnectionStatus) => void;

  // File Browser Actions
  navigateToPath: (serverId: string, path: string) => Promise<void>;
  refreshDirectory: () => Promise<void>;
  searchFiles: (pattern: string) => Promise<void>;
  clearSearch: () => void;
  setFileBrowserServer: (serverId: string | null) => void;

  // Terminal Actions
  openTerminal: (serverId: string) => Promise<string>;
  closeTerminal: (sessionId: string) => Promise<void>;
  setActiveTerminal: (sessionId: string | null) => void;
  resizeTerminal: (sessionId: string, cols: number, rows: number) => Promise<void>;

  // UI Actions
  setSidebarItem: (item: "servers" | "files" | "terminal") => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  clearErrors: () => void;

  // Toast Actions
  addToast: (toast: Omit<ToastData, "id">) => string;
  removeToast: (id: string) => void;
  showError: (title: string, message?: string, action?: ToastAction) => string;
  showSuccess: (title: string, message?: string) => string;
  showWarning: (title: string, message?: string, action?: ToastAction) => string;
  showInfo: (title: string, message?: string) => string;
}


// Create the store
export const useAppStore = create<AppState>((set, get) => ({
  // Initial State - Servers
  servers: [],
  selectedServerId: null,
  serverStatus: {},
  isLoadingServers: false,
  serverError: null,

  // Initial State - File Browser
  currentServerId: null,
  currentPath: "/",
  fileEntries: [],
  breadcrumbs: [{ name: "/", path: "/" }],
  isLoadingFiles: false,
  fileError: null,
  searchPattern: "",

  // Initial State - Terminal
  terminalSessions: [],
  activeTerminalId: null,
  isCreatingTerminal: false,
  terminalError: null,

  // Initial State - UI
  sidebarItem: "servers",
  theme: "system",

  // Initial State - Toasts
  toasts: [],

  // Server Actions
  loadServers: async () => {
    set({ isLoadingServers: true, serverError: null });
    try {
      const servers = await serverApi.list();
      set({ servers, isLoadingServers: false });
    } catch (error) {
      set({
        serverError: error instanceof Error ? error.message : String(error),
        isLoadingServers: false,
      });
    }
  },

  addServer: async (input: CreateServerInput, credential?: string) => {
    set({ serverError: null });
    try {
      const server = await serverApi.add(input);
      // Store credential if provided
      if (credential) {
        await credentialApi.store(server.id, credential, input.auth_method === "password");
      }
      set((state) => ({
        servers: [...state.servers, server],
      }));
      return server;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ serverError: errorMsg });
      throw new Error(errorMsg);
    }
  },

  updateServer: async (id: string, input: UpdateServerInput) => {
    set({ serverError: null });
    try {
      const server = await serverApi.update(id, input);
      set((state) => ({
        servers: state.servers.map((s) => (s.id === id ? server : s)),
      }));
      return server;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ serverError: errorMsg });
      throw new Error(errorMsg);
    }
  },

  deleteServer: async (id: string) => {
    set({ serverError: null });
    try {
      await serverApi.delete(id);
      set((state) => ({
        servers: state.servers.filter((s) => s.id !== id),
        selectedServerId: state.selectedServerId === id ? null : state.selectedServerId,
        // Clear file browser if viewing deleted server
        currentServerId: state.currentServerId === id ? null : state.currentServerId,
        fileEntries: state.currentServerId === id ? [] : state.fileEntries,
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ serverError: errorMsg });
      throw new Error(errorMsg);
    }
  },

  selectServer: (id: string | null) => {
    set({ selectedServerId: id });
  },

  testConnection: async (id: string) => {
    const { setServerStatus } = get();
    setServerStatus(id, "connecting");
    try {
      const status = await serverApi.testConnection(id);
      setServerStatus(id, status.connected ? "online" : "offline");
      return status;
    } catch (error) {
      setServerStatus(id, "offline");
      throw error;
    }
  },

  setServerStatus: (serverId: string, status: ServerConnectionStatus) => {
    set((state) => ({
      serverStatus: { ...state.serverStatus, [serverId]: status },
    }));
  },


  // File Browser Actions
  navigateToPath: async (serverId: string, path: string) => {
    set({ isLoadingFiles: true, fileError: null, searchPattern: "" });
    try {
      const [entries, breadcrumbs] = await Promise.all([
        fileApi.listDirectory(serverId, path),
        fileApi.getBreadcrumbs(path),
      ]);
      set({
        currentServerId: serverId,
        currentPath: path,
        fileEntries: entries,
        breadcrumbs,
        isLoadingFiles: false,
      });
    } catch (error) {
      set({
        fileError: error instanceof Error ? error.message : String(error),
        isLoadingFiles: false,
      });
    }
  },

  refreshDirectory: async () => {
    const { currentServerId, currentPath } = get();
    if (!currentServerId) return;
    
    set({ isLoadingFiles: true, fileError: null });
    try {
      const entries = await fileApi.listDirectory(currentServerId, currentPath);
      set({ fileEntries: entries, isLoadingFiles: false });
    } catch (error) {
      set({
        fileError: error instanceof Error ? error.message : String(error),
        isLoadingFiles: false,
      });
    }
  },

  searchFiles: async (pattern: string) => {
    const { currentServerId, currentPath } = get();
    if (!currentServerId) return;

    set({ isLoadingFiles: true, fileError: null, searchPattern: pattern });
    try {
      const entries = await fileApi.search(currentServerId, currentPath, pattern);
      set({ fileEntries: entries, isLoadingFiles: false });
    } catch (error) {
      set({
        fileError: error instanceof Error ? error.message : String(error),
        isLoadingFiles: false,
      });
    }
  },

  clearSearch: () => {
    const { currentServerId, currentPath, navigateToPath } = get();
    if (currentServerId) {
      navigateToPath(currentServerId, currentPath);
    }
    set({ searchPattern: "" });
  },

  setFileBrowserServer: (serverId: string | null) => {
    if (serverId) {
      get().navigateToPath(serverId, "/");
    } else {
      set({
        currentServerId: null,
        currentPath: "/",
        fileEntries: [],
        breadcrumbs: [{ name: "/", path: "/" }],
      });
    }
  },

  // Terminal Actions
  openTerminal: async (serverId: string) => {
    const { servers } = get();
    const server = servers.find((s) => s.id === serverId);
    if (!server) {
      throw new Error("Server not found");
    }

    set({ isCreatingTerminal: true, terminalError: null });
    try {
      const sessionId = await terminalApi.createSession(serverId);
      const session: TerminalSession = {
        id: sessionId,
        serverId,
        serverName: server.name,
        isConnected: true,
        createdAt: new Date(),
      };
      set((state) => ({
        terminalSessions: [...state.terminalSessions, session],
        activeTerminalId: sessionId,
        isCreatingTerminal: false,
      }));
      return sessionId;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ terminalError: errorMsg, isCreatingTerminal: false });
      throw new Error(errorMsg);
    }
  },

  closeTerminal: async (sessionId: string) => {
    try {
      await terminalApi.closeSession(sessionId);
    } catch (error) {
      // Session might already be closed, continue cleanup
      console.warn("Error closing terminal session:", error);
    }
    set((state) => {
      const sessions = state.terminalSessions.filter((s) => s.id !== sessionId);
      return {
        terminalSessions: sessions,
        activeTerminalId:
          state.activeTerminalId === sessionId
            ? sessions[sessions.length - 1]?.id ?? null
            : state.activeTerminalId,
      };
    });
  },

  setActiveTerminal: (sessionId: string | null) => {
    set({ activeTerminalId: sessionId });
  },

  resizeTerminal: async (sessionId: string, cols: number, rows: number) => {
    try {
      await terminalApi.resize(sessionId, cols, rows);
    } catch (error) {
      console.error("Error resizing terminal:", error);
    }
  },

  // UI Actions
  setSidebarItem: (item: "servers" | "files" | "terminal") => {
    set({ sidebarItem: item });
  },

  setTheme: (theme: "light" | "dark" | "system") => {
    set({ theme });
  },

  clearErrors: () => {
    set({
      serverError: null,
      fileError: null,
      terminalError: null,
    });
  },

  // Toast Actions
  addToast: (toast: Omit<ToastData, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: ToastData = { ...toast, id };
    set((state) => ({
      toasts: [...state.toasts, newToast],
    }));
    return id;
  },

  removeToast: (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  showError: (title: string, message?: string, action?: ToastAction) => {
    return get().addToast({
      type: "error",
      title,
      message,
      action,
      duration: 8000,
    });
  },

  showSuccess: (title: string, message?: string) => {
    return get().addToast({
      type: "success",
      title,
      message,
      duration: 4000,
    });
  },

  showWarning: (title: string, message?: string, action?: ToastAction) => {
    return get().addToast({
      type: "warning",
      title,
      message,
      action,
      duration: 6000,
    });
  },

  showInfo: (title: string, message?: string) => {
    return get().addToast({
      type: "info",
      title,
      message,
      duration: 5000,
    });
  },
}));


// Event listener setup - call this once when app initializes
let eventCleanup: EventListenerCleanup | null = null;

export async function setupEventListeners(): Promise<() => void> {
  // Prevent duplicate setup
  if (eventCleanup) {
    return () => eventCleanup?.unsubscribeAll();
  }

  const store = useAppStore.getState();

  eventCleanup = await setupGlobalEventListeners({
    onConnectionStatusChanged: (payload: ConnectionStatusPayload) => {
      store.setServerStatus(payload.server_id, payload.status);
    },
    onTerminalOutput: (payload: TerminalOutputPayload) => {
      // Terminal output is handled by individual terminal components
      // This is a global listener for logging/debugging if needed
      console.debug("Terminal output received:", payload.session_id, payload.data.length, "bytes");
    },
  });

  // Return cleanup function
  return () => {
    if (eventCleanup) {
      eventCleanup.unsubscribeAll();
      eventCleanup = null;
    }
  };
}

// Selector hooks for optimized re-renders
export const useServers = () => useAppStore((state) => state.servers);
export const useSelectedServer = () => {
  const servers = useAppStore((state) => state.servers);
  const selectedId = useAppStore((state) => state.selectedServerId);
  return selectedId ? servers.find((s) => s.id === selectedId) ?? null : null;
};
export const useServerStatus = (serverId: string) =>
  useAppStore((state) => state.serverStatus[serverId] ?? "offline");
export const useIsLoadingServers = () => useAppStore((state) => state.isLoadingServers);
export const useServerError = () => useAppStore((state) => state.serverError);

export const useFileEntries = () => useAppStore((state) => state.fileEntries);
export const useBreadcrumbs = () => useAppStore((state) => state.breadcrumbs);
export const useCurrentPath = () => useAppStore((state) => state.currentPath);
export const useIsLoadingFiles = () => useAppStore((state) => state.isLoadingFiles);
export const useFileError = () => useAppStore((state) => state.fileError);

export const useTerminalSessions = () => useAppStore((state) => state.terminalSessions);
export const useActiveTerminal = () => {
  const sessions = useAppStore((state) => state.terminalSessions);
  const activeId = useAppStore((state) => state.activeTerminalId);
  return activeId ? sessions.find((s) => s.id === activeId) ?? null : null;
};
export const useIsCreatingTerminal = () => useAppStore((state) => state.isCreatingTerminal);
export const useTerminalError = () => useAppStore((state) => state.terminalError);

export const useSidebarItem = () => useAppStore((state) => state.sidebarItem);
export const useTheme = () => useAppStore((state) => state.theme);

export const useToasts = () => useAppStore((state) => state.toasts);
export const useToastActions = () => ({
  addToast: useAppStore((state) => state.addToast),
  removeToast: useAppStore((state) => state.removeToast),
  showError: useAppStore((state) => state.showError),
  showSuccess: useAppStore((state) => state.showSuccess),
  showWarning: useAppStore((state) => state.showWarning),
  showInfo: useAppStore((state) => state.showInfo),
});
