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
  ConflictStatus,
  ConflictResolution,
  EditorSettings as TauriEditorSettings,
  serverApi,
  fileApi,
  terminalApi,
  credentialApi,
  syncApi,
  editorSettingsApi,
  setupGlobalEventListeners,
  EventListenerCleanup,
  // Phase 3 - Deployment Scripts
  DeploymentScript,
  CreateScriptInput,
  UpdateScriptInput,
  ValidationResult,
  TemplateInfo,
  Deployment,
  DeploymentLog,
  DeploymentFilters,
  DeploymentStatus,
  ExecutionConfig,
  DryRunResult,
  RollbackInfo,
  scriptApi,
  templateApi,
  deploymentApi,
  rollbackApi,
  // Phase 4 - Advanced Features
  ServerGroup,
  CreateGroupInput,
  UpdateGroupInput,
  BatchResult,
  HealthCheckResult,
  BatchSummary,
  HealthCheckSummary,
  TransferStatus,
  TransferRequest,
  ServerMetrics,
  ServerStatusInfo,
  AlertConfig,
  Alert,
  MetricPoint,
  CreateAlertInput,
  Snippet,
  CreateSnippetInput,
  UpdateSnippetInput,
  SnippetImportResult,
  Favorite,
  FavoriteType,
  ActivityLog,
  groupApi,
  batchApi,
  transferApi,
  monitorApi,
  snippetApi,
  favoritesApi,
  activityApi,
  phase4EventApi,
  AlertTriggeredPayload,
  MetricsUpdatedPayload,
} from "../lib/tauri";
import { getLanguageFromPath } from "../lib/languageMap";

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

// Open File type for editor state
export interface OpenFile {
  id: string;
  serverId: string;
  remotePath: string;
  content: string;
  originalContent: string;
  isModified: boolean;
  language: string;
  lastSynced: number;
}

// Editor Settings type (frontend version)
export interface EditorSettings {
  tabSize: number;
  fontSize: number;
  fontFamily: string;
  wordWrap: boolean;
  autoSave: boolean;
  autoSaveInterval: number;
  theme: "vs" | "vs-dark" | "hc-black";
}

// Conflict Info type
export interface ConflictInfo {
  serverId: string;
  remotePath: string;
  status: ConflictStatus;
  detectedAt: number;
}

// Default editor settings
export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  tabSize: 4,
  fontSize: 14,
  fontFamily: "Consolas, Monaco, monospace",
  wordWrap: false,
  autoSave: false,
  autoSaveInterval: 30,
  theme: "vs-dark",
};

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

  // Editor (Phase 2)
  openFiles: OpenFile[];
  activeFileId: string | null;
  editorSettings: EditorSettings;
  conflicts: Record<string, ConflictInfo>;
  isLoadingFile: boolean;
  isSavingFile: boolean;
  editorError: string | null;

  // Deployment Scripts (Phase 3)
  scripts: DeploymentScript[];
  selectedScriptId: string | null;
  templates: TemplateInfo[];
  deployments: Deployment[];
  activeDeploymentId: string | null;
  executionStatus: DeploymentStatus | null;
  deploymentLogs: Record<string, DeploymentLog[]>;
  isLoadingScripts: boolean;
  isLoadingDeployments: boolean;
  isExecutingDeployment: boolean;
  scriptError: string | null;
  deploymentError: string | null;

  // Server Groups (Phase 4)
  groups: ServerGroup[];
  selectedGroupId: string | null;
  isLoadingGroups: boolean;
  groupError: string | null;

  // Batch Operations (Phase 4)
  batchResults: BatchResult[];
  batchSummary: BatchSummary | null;
  healthCheckResults: HealthCheckResult[];
  healthCheckSummary: HealthCheckSummary | null;
  isExecutingBatch: boolean;
  batchError: string | null;

  // File Transfer (Phase 4)
  transfers: TransferStatus[];
  transferQueue: TransferStatus[];
  activeTransferId: string | null;
  isTransferring: boolean;
  transferError: string | null;

  // Monitoring (Phase 4)
  serverMetrics: Record<string, ServerMetrics>;
  serverStatusList: ServerStatusInfo[];
  metricsHistory: Record<string, MetricPoint[]>;
  alerts: AlertConfig[];
  triggeredAlerts: Alert[];
  isMonitoring: boolean;
  isLoadingMetrics: boolean;
  monitorError: string | null;

  // Snippets (Phase 4)
  snippets: Snippet[];
  selectedSnippetId: string | null;
  snippetCategories: string[];
  isLoadingSnippets: boolean;
  snippetError: string | null;

  // Favorites & Activity (Phase 4)
  favorites: Favorite[];
  recentActivity: ActivityLog[];
  isLoadingFavorites: boolean;
  isLoadingActivity: boolean;

  // UI
  sidebarItem: "dashboard" | "servers" | "groups" | "files" | "terminal" | "scripts" | "snippets" | "ssh-keys" | "nginx" | "database";
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

  // Editor Actions (Phase 2)
  openFile: (serverId: string, remotePath: string) => Promise<void>;
  closeFile: (fileId: string) => void;
  closeAllFiles: () => void;
  saveFile: (fileId: string) => Promise<void>;
  saveAllFiles: () => Promise<void>;
  updateFileContent: (fileId: string, content: string) => void;
  setActiveFile: (fileId: string | null) => void;
  checkFileConflict: (fileId: string) => Promise<ConflictStatus | null>;
  resolveConflict: (fileId: string, resolution: ConflictResolution) => Promise<void>;
  clearConflict: (fileId: string) => void;
  loadEditorSettings: () => Promise<void>;
  updateEditorSettings: (settings: Partial<EditorSettings>) => Promise<void>;

  // Script Actions (Phase 3)
  loadScripts: () => Promise<void>;
  createScript: (input: CreateScriptInput) => Promise<DeploymentScript>;
  updateScript: (id: string, input: UpdateScriptInput) => Promise<DeploymentScript>;
  deleteScript: (id: string) => Promise<void>;
  duplicateScript: (id: string) => Promise<DeploymentScript>;
  exportScript: (id: string) => Promise<string>;
  importScript: (yaml: string) => Promise<DeploymentScript>;
  validateScript: (script: DeploymentScript) => Promise<ValidationResult>;
  selectScript: (id: string | null) => void;
  loadTemplates: () => Promise<void>;
  createFromTemplate: (templateName: string) => Promise<DeploymentScript>;

  // Deployment Actions (Phase 3)
  startDeployment: (config: ExecutionConfig) => Promise<Deployment>;
  cancelDeployment: (deploymentId: string) => Promise<void>;
  dryRunDeployment: (config: ExecutionConfig) => Promise<DryRunResult>;
  loadDeployments: (filters?: DeploymentFilters) => Promise<void>;
  loadDeploymentLogs: (deploymentId: string) => Promise<void>;
  rollbackDeployment: (deploymentId: string) => Promise<Deployment>;
  getRollbackInfo: (deploymentId: string) => Promise<RollbackInfo>;
  setActiveDeployment: (id: string | null) => void;
  clearDeploymentLogs: (deploymentId: string) => void;

  // Group Actions (Phase 4)
  loadGroups: () => Promise<void>;
  createGroup: (input: CreateGroupInput) => Promise<ServerGroup>;
  updateGroup: (id: string, input: UpdateGroupInput) => Promise<ServerGroup>;
  deleteGroup: (id: string) => Promise<void>;
  addServerToGroup: (groupId: string, serverId: string) => Promise<void>;
  removeServerFromGroup: (groupId: string, serverId: string) => Promise<void>;
  selectGroup: (id: string | null) => void;

  // Batch Actions (Phase 4)
  executeBatchCommand: (serverIds: string[], command: string) => Promise<BatchResult[]>;
  executeBatchHealthCheck: (serverIds: string[]) => Promise<HealthCheckResult[]>;
  clearBatchResults: () => void;

  // Transfer Actions (Phase 4)
  queueUploads: (serverId: string, transfers: TransferRequest[]) => Promise<string[]>;
  queueDownloads: (serverId: string, transfers: TransferRequest[]) => Promise<string[]>;
  cancelTransfer: (transferId: string) => Promise<void>;
  setTransferSpeedLimit: (bytesPerSecond: number | null) => Promise<void>;
  updateTransferStatus: (status: TransferStatus) => void;
  removeTransfer: (transferId: string) => void;

  // Monitor Actions (Phase 4)
  loadServerMetrics: (serverId: string) => Promise<void>;
  loadAllServerStatus: () => Promise<void>;
  loadMetricsHistory: (serverId: string, metric: string, hours: number) => Promise<void>;
  createAlert: (input: CreateAlertInput) => Promise<AlertConfig>;
  deleteAlert: (id: string) => Promise<void>;
  loadAlerts: () => Promise<void>;
  startMonitoring: (intervalSeconds: number) => Promise<void>;
  stopMonitoring: () => Promise<void>;
  updateServerMetrics: (serverId: string, metrics: ServerMetrics) => void;
  addTriggeredAlert: (alert: Alert) => void;

  // Snippet Actions (Phase 4)
  loadSnippets: () => Promise<void>;
  createSnippet: (input: CreateSnippetInput) => Promise<Snippet>;
  updateSnippet: (id: string, input: UpdateSnippetInput) => Promise<Snippet>;
  deleteSnippet: (id: string) => Promise<void>;
  searchSnippets: (query: string) => Promise<Snippet[]>;
  exportSnippets: () => Promise<string>;
  importSnippets: (json: string) => Promise<SnippetImportResult>;
  selectSnippet: (id: string | null) => void;

  // Favorites Actions (Phase 4)
  loadFavorites: () => Promise<void>;
  addFavorite: (itemType: FavoriteType, itemId: string) => Promise<void>;
  removeFavorite: (itemType: FavoriteType, itemId: string) => Promise<void>;
  isFavorite: (itemType: FavoriteType, itemId: string) => boolean;

  // Activity Actions (Phase 4)
  loadRecentActivity: (limit?: number) => Promise<void>;

  // UI Actions
  setSidebarItem: (item: "dashboard" | "servers" | "groups" | "files" | "terminal" | "scripts" | "snippets" | "ssh-keys" | "nginx" | "database") => void;
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

  // Initial State - Editor (Phase 2)
  openFiles: [],
  activeFileId: null,
  editorSettings: { ...DEFAULT_EDITOR_SETTINGS },
  conflicts: {},
  isLoadingFile: false,
  isSavingFile: false,
  editorError: null,

  // Initial State - Deployment Scripts (Phase 3)
  scripts: [],
  selectedScriptId: null,
  templates: [],
  deployments: [],
  activeDeploymentId: null,
  executionStatus: null,
  deploymentLogs: {},
  isLoadingScripts: false,
  isLoadingDeployments: false,
  isExecutingDeployment: false,
  scriptError: null,
  deploymentError: null,

  // Initial State - Server Groups (Phase 4)
  groups: [],
  selectedGroupId: null,
  isLoadingGroups: false,
  groupError: null,

  // Initial State - Batch Operations (Phase 4)
  batchResults: [],
  batchSummary: null,
  healthCheckResults: [],
  healthCheckSummary: null,
  isExecutingBatch: false,
  batchError: null,

  // Initial State - File Transfer (Phase 4)
  transfers: [],
  transferQueue: [],
  activeTransferId: null,
  isTransferring: false,
  transferError: null,

  // Initial State - Monitoring (Phase 4)
  serverMetrics: {},
  serverStatusList: [],
  metricsHistory: {},
  alerts: [],
  triggeredAlerts: [],
  isMonitoring: false,
  isLoadingMetrics: false,
  monitorError: null,

  // Initial State - Snippets (Phase 4)
  snippets: [],
  selectedSnippetId: null,
  snippetCategories: [],
  isLoadingSnippets: false,
  snippetError: null,

  // Initial State - Favorites & Activity (Phase 4)
  favorites: [],
  recentActivity: [],
  isLoadingFavorites: false,
  isLoadingActivity: false,

  // Initial State - UI
  sidebarItem: "dashboard",
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

  // Editor Actions (Phase 2)
  openFile: async (serverId: string, remotePath: string) => {
    const { openFiles, showError } = get();
    
    // Generate unique file ID
    const fileId = `${serverId}:${remotePath}`;
    
    // Check if file is already open
    const existingFile = openFiles.find((f) => f.id === fileId);
    if (existingFile) {
      set({ activeFileId: fileId });
      return;
    }

    set({ isLoadingFile: true, editorError: null });
    try {
      const fileContent = await fileApi.downloadFile(serverId, remotePath);
      const language = getLanguageFromPath(remotePath);
      
      const newFile: OpenFile = {
        id: fileId,
        serverId,
        remotePath,
        content: fileContent.content,
        originalContent: fileContent.content,
        isModified: false,
        language,
        lastSynced: Date.now(),
      };

      set((state) => ({
        openFiles: [...state.openFiles, newFile],
        activeFileId: fileId,
        isLoadingFile: false,
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ editorError: errorMsg, isLoadingFile: false });
      showError("Failed to open file", errorMsg);
      throw new Error(errorMsg);
    }
  },

  closeFile: (fileId: string) => {
    set((state) => {
      const files = state.openFiles.filter((f) => f.id !== fileId);
      const newActiveId = state.activeFileId === fileId
        ? files[files.length - 1]?.id ?? null
        : state.activeFileId;
      
      // Remove conflict info for closed file
      const { [fileId]: _, ...remainingConflicts } = state.conflicts;
      
      return {
        openFiles: files,
        activeFileId: newActiveId,
        conflicts: remainingConflicts,
      };
    });
  },

  closeAllFiles: () => {
    set({
      openFiles: [],
      activeFileId: null,
      conflicts: {},
    });
  },

  saveFile: async (fileId: string) => {
    const { openFiles, showError, showSuccess } = get();
    const file = openFiles.find((f) => f.id === fileId);
    
    if (!file) {
      showError("Save failed", "File not found");
      return;
    }

    if (!file.isModified) {
      return; // Nothing to save
    }

    set({ isSavingFile: true, editorError: null });
    try {
      await fileApi.saveFile(file.serverId, file.remotePath, file.content);
      
      // Update file state: clear modified flag, update originalContent
      set((state) => ({
        openFiles: state.openFiles.map((f) =>
          f.id === fileId
            ? {
                ...f,
                isModified: false,
                originalContent: f.content,
                lastSynced: Date.now(),
              }
            : f
        ),
        isSavingFile: false,
      }));
      
      showSuccess("File saved", file.remotePath);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ editorError: errorMsg, isSavingFile: false });
      showError("Save failed", errorMsg);
      throw new Error(errorMsg);
    }
  },

  saveAllFiles: async () => {
    const { openFiles, saveFile } = get();
    const modifiedFiles = openFiles.filter((f) => f.isModified);
    
    for (const file of modifiedFiles) {
      try {
        await saveFile(file.id);
      } catch {
        // Continue saving other files even if one fails
        console.error(`Failed to save ${file.remotePath}`);
      }
    }
  },

  updateFileContent: (fileId: string, content: string) => {
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.id === fileId
          ? {
              ...f,
              content,
              isModified: content !== f.originalContent,
            }
          : f
      ),
    }));
  },

  setActiveFile: (fileId: string | null) => {
    set({ activeFileId: fileId });
  },

  checkFileConflict: async (fileId: string) => {
    const { openFiles, showWarning } = get();
    const file = openFiles.find((f) => f.id === fileId);
    
    if (!file) {
      return null;
    }

    try {
      const conflictStatus = await syncApi.checkConflict(file.serverId, file.remotePath);
      
      if (conflictStatus.type === "remote_modified") {
        const conflictInfo: ConflictInfo = {
          serverId: file.serverId,
          remotePath: file.remotePath,
          status: conflictStatus,
          detectedAt: Date.now(),
        };
        
        set((state) => ({
          conflicts: {
            ...state.conflicts,
            [fileId]: conflictInfo,
          },
        }));
        
        showWarning(
          "File conflict detected",
          `${file.remotePath} has been modified on the server`
        );
      }
      
      return conflictStatus;
    } catch (error) {
      console.error("Error checking file conflict:", error);
      return null;
    }
  },

  resolveConflict: async (fileId: string, resolution: ConflictResolution) => {
    const { openFiles, conflicts, showSuccess, showError } = get();
    const file = openFiles.find((f) => f.id === fileId);
    const conflict = conflicts[fileId];
    
    if (!file || !conflict) {
      showError("Resolve failed", "File or conflict not found");
      return;
    }

    try {
      await syncApi.resolveConflict(file.serverId, file.remotePath, resolution);
      
      // If using remote, reload the file content
      if (resolution === "use_remote") {
        const fileContent = await fileApi.downloadFile(file.serverId, file.remotePath);
        set((state) => ({
          openFiles: state.openFiles.map((f) =>
            f.id === fileId
              ? {
                  ...f,
                  content: fileContent.content,
                  originalContent: fileContent.content,
                  isModified: false,
                  lastSynced: Date.now(),
                }
              : f
          ),
        }));
      } else if (resolution === "keep_local") {
        // Save local content to remote
        await fileApi.saveFile(file.serverId, file.remotePath, file.content);
        set((state) => ({
          openFiles: state.openFiles.map((f) =>
            f.id === fileId
              ? {
                  ...f,
                  originalContent: f.content,
                  isModified: false,
                  lastSynced: Date.now(),
                }
              : f
          ),
        }));
      }
      
      // Clear conflict
      set((state) => {
        const { [fileId]: _, ...remainingConflicts } = state.conflicts;
        return { conflicts: remainingConflicts };
      });
      
      showSuccess("Conflict resolved", file.remotePath);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showError("Resolve failed", errorMsg);
      throw new Error(errorMsg);
    }
  },

  clearConflict: (fileId: string) => {
    set((state) => {
      const { [fileId]: _, ...remainingConflicts } = state.conflicts;
      return { conflicts: remainingConflicts };
    });
  },

  loadEditorSettings: async () => {
    try {
      const settings = await editorSettingsApi.get();
      // Convert from Tauri snake_case to frontend camelCase
      set({
        editorSettings: {
          tabSize: settings.tab_size,
          fontSize: settings.font_size,
          fontFamily: settings.font_family,
          wordWrap: settings.word_wrap,
          autoSave: settings.auto_save,
          autoSaveInterval: settings.auto_save_interval,
          theme: settings.theme,
        },
      });
    } catch (error) {
      console.error("Failed to load editor settings:", error);
      // Use default settings on error
      set({ editorSettings: { ...DEFAULT_EDITOR_SETTINGS } });
    }
  },

  updateEditorSettings: async (settings: Partial<EditorSettings>) => {
    const { editorSettings, showError } = get();
    const newSettings = { ...editorSettings, ...settings };
    
    // Optimistically update local state
    set({ editorSettings: newSettings });
    
    try {
      // Convert to Tauri snake_case format
      const tauriSettings: TauriEditorSettings = {
        tab_size: newSettings.tabSize,
        font_size: newSettings.fontSize,
        font_family: newSettings.fontFamily,
        word_wrap: newSettings.wordWrap,
        auto_save: newSettings.autoSave,
        auto_save_interval: newSettings.autoSaveInterval,
        theme: newSettings.theme,
      };
      await editorSettingsApi.update(tauriSettings);
    } catch (error) {
      // Revert on error
      set({ editorSettings });
      const errorMsg = error instanceof Error ? error.message : String(error);
      showError("Failed to save settings", errorMsg);
      throw new Error(errorMsg);
    }
  },

  // Script Actions (Phase 3)
  loadScripts: async () => {
    set({ isLoadingScripts: true, scriptError: null });
    try {
      const scripts = await scriptApi.list();
      set({ scripts, isLoadingScripts: false });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ scriptError: errorMsg, isLoadingScripts: false });
    }
  },

  createScript: async (input: CreateScriptInput) => {
    const { showError, showSuccess } = get();
    set({ scriptError: null });
    try {
      const script = await scriptApi.create(input);
      set((state) => ({
        scripts: [...state.scripts, script],
      }));
      showSuccess("Script created", script.name);
      return script;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ scriptError: errorMsg });
      showError("Failed to create script", errorMsg);
      throw new Error(errorMsg);
    }
  },

  updateScript: async (id: string, input: UpdateScriptInput) => {
    const { showError, showSuccess } = get();
    set({ scriptError: null });
    try {
      const script = await scriptApi.update(id, input);
      set((state) => ({
        scripts: state.scripts.map((s) => (s.id === id ? script : s)),
      }));
      showSuccess("Script updated", script.name);
      return script;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ scriptError: errorMsg });
      showError("Failed to update script", errorMsg);
      throw new Error(errorMsg);
    }
  },

  deleteScript: async (id: string) => {
    const { showError, showSuccess } = get();
    set({ scriptError: null });
    try {
      await scriptApi.delete(id);
      set((state) => ({
        scripts: state.scripts.filter((s) => s.id !== id),
        selectedScriptId: state.selectedScriptId === id ? null : state.selectedScriptId,
      }));
      showSuccess("Script deleted");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ scriptError: errorMsg });
      showError("Failed to delete script", errorMsg);
      throw new Error(errorMsg);
    }
  },

  duplicateScript: async (id: string) => {
    const { showError, showSuccess } = get();
    set({ scriptError: null });
    try {
      const script = await scriptApi.duplicate(id);
      set((state) => ({
        scripts: [...state.scripts, script],
      }));
      showSuccess("Script duplicated", script.name);
      return script;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ scriptError: errorMsg });
      showError("Failed to duplicate script", errorMsg);
      throw new Error(errorMsg);
    }
  },

  exportScript: async (id: string) => {
    const { showError } = get();
    try {
      const yaml = await scriptApi.export(id);
      return yaml;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showError("Failed to export script", errorMsg);
      throw new Error(errorMsg);
    }
  },

  importScript: async (yaml: string) => {
    const { showError, showSuccess } = get();
    set({ scriptError: null });
    try {
      const script = await scriptApi.import(yaml);
      set((state) => ({
        scripts: [...state.scripts, script],
      }));
      showSuccess("Script imported", script.name);
      return script;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ scriptError: errorMsg });
      showError("Failed to import script", errorMsg);
      throw new Error(errorMsg);
    }
  },

  validateScript: async (script: DeploymentScript) => {
    try {
      const result = await scriptApi.validate(script);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(errorMsg);
    }
  },

  selectScript: (id: string | null) => {
    set({ selectedScriptId: id });
  },

  loadTemplates: async () => {
    try {
      const templates = await templateApi.list();
      set({ templates });
    } catch (error) {
      console.error("Failed to load templates:", error);
    }
  },

  createFromTemplate: async (templateName: string) => {
    const { showError, showSuccess } = get();
    set({ scriptError: null });
    try {
      const script = await templateApi.createFromTemplate(templateName);
      set((state) => ({
        scripts: [...state.scripts, script],
      }));
      showSuccess("Script created from template", script.name);
      return script;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ scriptError: errorMsg });
      showError("Failed to create from template", errorMsg);
      throw new Error(errorMsg);
    }
  },

  // Deployment Actions (Phase 3)
  startDeployment: async (config: ExecutionConfig) => {
    const { showError, showInfo } = get();
    set({ isExecutingDeployment: true, deploymentError: null, executionStatus: "running" });
    try {
      showInfo("Deployment started", "Executing deployment script...");
      const deployment = await deploymentApi.start(config);
      set((state) => ({
        deployments: [deployment, ...state.deployments],
        activeDeploymentId: deployment.id,
        executionStatus: deployment.status,
        isExecutingDeployment: false,
      }));
      return deployment;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ deploymentError: errorMsg, isExecutingDeployment: false, executionStatus: "failed" });
      showError("Deployment failed", errorMsg);
      throw new Error(errorMsg);
    }
  },

  cancelDeployment: async (deploymentId: string) => {
    const { showError, showWarning } = get();
    try {
      await deploymentApi.cancel(deploymentId);
      set((state) => ({
        deployments: state.deployments.map((d) =>
          d.id === deploymentId ? { ...d, status: "cancelled" as DeploymentStatus } : d
        ),
        executionStatus: state.activeDeploymentId === deploymentId ? "cancelled" : state.executionStatus,
      }));
      showWarning("Deployment cancelled");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showError("Failed to cancel deployment", errorMsg);
      throw new Error(errorMsg);
    }
  },

  dryRunDeployment: async (config: ExecutionConfig) => {
    const { showError } = get();
    try {
      const result = await deploymentApi.dryRun(config);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showError("Dry run failed", errorMsg);
      throw new Error(errorMsg);
    }
  },

  loadDeployments: async (filters?: DeploymentFilters) => {
    set({ isLoadingDeployments: true, deploymentError: null });
    try {
      const deployments = await deploymentApi.list(filters || {});
      set({ deployments, isLoadingDeployments: false });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ deploymentError: errorMsg, isLoadingDeployments: false });
    }
  },

  loadDeploymentLogs: async (deploymentId: string) => {
    const { showError } = get();
    try {
      const logs = await deploymentApi.getLogs(deploymentId);
      set((state) => ({
        deploymentLogs: {
          ...state.deploymentLogs,
          [deploymentId]: logs,
        },
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showError("Failed to load deployment logs", errorMsg);
    }
  },

  rollbackDeployment: async (deploymentId: string) => {
    const { showError, showSuccess } = get();
    set({ isExecutingDeployment: true, deploymentError: null });
    try {
      const rollbackDeployment = await rollbackApi.execute(deploymentId);
      set((state) => ({
        deployments: [rollbackDeployment, ...state.deployments.map((d) =>
          d.id === deploymentId ? { ...d, status: "rolled_back" as DeploymentStatus } : d
        )],
        activeDeploymentId: rollbackDeployment.id,
        isExecutingDeployment: false,
      }));
      showSuccess("Rollback completed", `Deployment ${deploymentId} has been rolled back`);
      return rollbackDeployment;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ deploymentError: errorMsg, isExecutingDeployment: false });
      showError("Rollback failed", errorMsg);
      throw new Error(errorMsg);
    }
  },

  getRollbackInfo: async (deploymentId: string) => {
    try {
      const info = await rollbackApi.getInfo(deploymentId);
      return info;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(errorMsg);
    }
  },

  setActiveDeployment: (id: string | null) => {
    set({ activeDeploymentId: id });
  },

  clearDeploymentLogs: (deploymentId: string) => {
    set((state) => {
      const { [deploymentId]: _, ...remainingLogs } = state.deploymentLogs;
      return { deploymentLogs: remainingLogs };
    });
  },

  // ============================================================================
  // Group Actions (Phase 4)
  // ============================================================================

  loadGroups: async () => {
    set({ isLoadingGroups: true, groupError: null });
    try {
      const groups = await groupApi.list();
      set({ groups, isLoadingGroups: false });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ groupError: errorMsg, isLoadingGroups: false });
    }
  },

  createGroup: async (input: CreateGroupInput) => {
    const { showError, showSuccess } = get();
    set({ groupError: null });
    try {
      const group = await groupApi.create(input);
      set((state) => ({
        groups: [...state.groups, group],
      }));
      showSuccess("Group created", group.name);
      return group;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ groupError: errorMsg });
      showError("Failed to create group", errorMsg);
      throw new Error(errorMsg);
    }
  },

  updateGroup: async (id: string, input: UpdateGroupInput) => {
    const { showError, showSuccess } = get();
    set({ groupError: null });
    try {
      const group = await groupApi.update(id, input);
      set((state) => ({
        groups: state.groups.map((g) => (g.id === id ? group : g)),
      }));
      showSuccess("Group updated", group.name);
      return group;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ groupError: errorMsg });
      showError("Failed to update group", errorMsg);
      throw new Error(errorMsg);
    }
  },

  deleteGroup: async (id: string) => {
    const { showError, showSuccess } = get();
    set({ groupError: null });
    try {
      await groupApi.delete(id);
      set((state) => ({
        groups: state.groups.filter((g) => g.id !== id),
        selectedGroupId: state.selectedGroupId === id ? null : state.selectedGroupId,
      }));
      showSuccess("Group deleted");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ groupError: errorMsg });
      showError("Failed to delete group", errorMsg);
      throw new Error(errorMsg);
    }
  },

  addServerToGroup: async (groupId: string, serverId: string) => {
    const { showError } = get();
    try {
      await groupApi.addServer(groupId, serverId);
      set((state) => ({
        groups: state.groups.map((g) =>
          g.id === groupId
            ? { ...g, server_ids: [...g.server_ids, serverId] }
            : g
        ),
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showError("Failed to add server to group", errorMsg);
      throw new Error(errorMsg);
    }
  },

  removeServerFromGroup: async (groupId: string, serverId: string) => {
    const { showError } = get();
    try {
      await groupApi.removeServer(groupId, serverId);
      set((state) => ({
        groups: state.groups.map((g) =>
          g.id === groupId
            ? { ...g, server_ids: g.server_ids.filter((id) => id !== serverId) }
            : g
        ),
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showError("Failed to remove server from group", errorMsg);
      throw new Error(errorMsg);
    }
  },

  selectGroup: (id: string | null) => {
    set({ selectedGroupId: id });
  },

  // ============================================================================
  // Batch Actions (Phase 4)
  // ============================================================================

  executeBatchCommand: async (serverIds: string[], command: string) => {
    const { showError, showInfo } = get();
    set({ isExecutingBatch: true, batchError: null, batchResults: [], batchSummary: null });
    try {
      showInfo("Batch command started", `Executing on ${serverIds.length} servers...`);
      const results = await batchApi.executeCommand(serverIds, command);
      const summary: BatchSummary = {
        total: results.length,
        success_count: results.filter((r) => r.success).length,
        failure_count: results.filter((r) => !r.success).length,
        results,
      };
      set({ batchResults: results, batchSummary: summary, isExecutingBatch: false });
      return results;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ batchError: errorMsg, isExecutingBatch: false });
      showError("Batch command failed", errorMsg);
      throw new Error(errorMsg);
    }
  },

  executeBatchHealthCheck: async (serverIds: string[]) => {
    const { showError, showInfo } = get();
    set({ isExecutingBatch: true, batchError: null, healthCheckResults: [], healthCheckSummary: null });
    try {
      showInfo("Health check started", `Checking ${serverIds.length} servers...`);
      const results = await batchApi.healthCheck(serverIds);
      const summary: HealthCheckSummary = {
        total: results.length,
        online_count: results.filter((r) => r.connected).length,
        offline_count: results.filter((r) => !r.connected).length,
        results,
      };
      set({ healthCheckResults: results, healthCheckSummary: summary, isExecutingBatch: false });
      return results;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ batchError: errorMsg, isExecutingBatch: false });
      showError("Health check failed", errorMsg);
      throw new Error(errorMsg);
    }
  },

  clearBatchResults: () => {
    set({
      batchResults: [],
      batchSummary: null,
      healthCheckResults: [],
      healthCheckSummary: null,
      batchError: null,
    });
  },

  // ============================================================================
  // Transfer Actions (Phase 4)
  // ============================================================================

  queueUploads: async (serverId: string, transfers: TransferRequest[]) => {
    const { showError, showInfo } = get();
    set({ transferError: null });
    try {
      showInfo("Uploads queued", `${transfers.length} file(s) queued for upload`);
      const transferIds = await transferApi.queueUploads(serverId, transfers);
      return transferIds;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ transferError: errorMsg });
      showError("Failed to queue uploads", errorMsg);
      throw new Error(errorMsg);
    }
  },

  queueDownloads: async (serverId: string, transfers: TransferRequest[]) => {
    const { showError, showInfo } = get();
    set({ transferError: null });
    try {
      showInfo("Downloads queued", `${transfers.length} file(s) queued for download`);
      const transferIds = await transferApi.queueDownloads(serverId, transfers);
      return transferIds;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ transferError: errorMsg });
      showError("Failed to queue downloads", errorMsg);
      throw new Error(errorMsg);
    }
  },

  cancelTransfer: async (transferId: string) => {
    const { showError, showWarning } = get();
    try {
      await transferApi.cancel(transferId);
      set((state) => ({
        transfers: state.transfers.filter((t) => t.id !== transferId),
        transferQueue: state.transferQueue.filter((t) => t.id !== transferId),
      }));
      showWarning("Transfer cancelled");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showError("Failed to cancel transfer", errorMsg);
      throw new Error(errorMsg);
    }
  },

  setTransferSpeedLimit: async (bytesPerSecond: number | null) => {
    const { showError, showSuccess } = get();
    try {
      await transferApi.setSpeedLimit(bytesPerSecond);
      showSuccess("Speed limit updated", bytesPerSecond ? `${Math.round(bytesPerSecond / 1024)} KB/s` : "Unlimited");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showError("Failed to set speed limit", errorMsg);
      throw new Error(errorMsg);
    }
  },

  updateTransferStatus: (status: TransferStatus) => {
    set((state) => {
      const existingIndex = state.transfers.findIndex((t) => t.id === status.id);
      if (existingIndex >= 0) {
        const newTransfers = [...state.transfers];
        newTransfers[existingIndex] = status;
        return { transfers: newTransfers };
      } else {
        return { transfers: [...state.transfers, status] };
      }
    });
  },

  removeTransfer: (transferId: string) => {
    set((state) => ({
      transfers: state.transfers.filter((t) => t.id !== transferId),
      transferQueue: state.transferQueue.filter((t) => t.id !== transferId),
    }));
  },

  // ============================================================================
  // Monitor Actions (Phase 4)
  // ============================================================================

  loadServerMetrics: async (serverId: string) => {
    const { showError } = get();
    set({ isLoadingMetrics: true, monitorError: null });
    try {
      const metrics = await monitorApi.getServerMetrics(serverId);
      set((state) => ({
        serverMetrics: { ...state.serverMetrics, [serverId]: metrics },
        isLoadingMetrics: false,
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ monitorError: errorMsg, isLoadingMetrics: false });
      showError("Failed to load metrics", errorMsg);
    }
  },

  loadAllServerStatus: async () => {
    set({ isLoadingMetrics: true, monitorError: null });
    try {
      const statusList = await monitorApi.getAllServerStatus();
      set({ serverStatusList: statusList, isLoadingMetrics: false });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ monitorError: errorMsg, isLoadingMetrics: false });
    }
  },

  loadMetricsHistory: async (serverId: string, metric: string, hours: number) => {
    const { showError } = get();
    try {
      const history = await monitorApi.getMetricsHistory(serverId, metric, hours);
      const key = `${serverId}:${metric}`;
      set((state) => ({
        metricsHistory: { ...state.metricsHistory, [key]: history },
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showError("Failed to load metrics history", errorMsg);
    }
  },

  createAlert: async (input: CreateAlertInput) => {
    const { showError, showSuccess } = get();
    try {
      const alert = await monitorApi.setAlert(input);
      set((state) => ({
        alerts: [...state.alerts, alert],
      }));
      showSuccess("Alert created");
      return alert;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showError("Failed to create alert", errorMsg);
      throw new Error(errorMsg);
    }
  },

  deleteAlert: async (id: string) => {
    const { showError, showSuccess } = get();
    try {
      await monitorApi.deleteAlert(id);
      set((state) => ({
        alerts: state.alerts.filter((a) => a.id !== id),
      }));
      showSuccess("Alert deleted");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showError("Failed to delete alert", errorMsg);
      throw new Error(errorMsg);
    }
  },

  loadAlerts: async () => {
    try {
      const alerts = await monitorApi.listAlerts();
      set({ alerts });
    } catch (error) {
      console.error("Failed to load alerts:", error);
    }
  },

  startMonitoring: async (intervalSeconds: number) => {
    const { showError, showInfo } = get();
    try {
      await monitorApi.startMonitoring(intervalSeconds);
      set({ isMonitoring: true });
      showInfo("Monitoring started", `Refresh interval: ${intervalSeconds}s`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showError("Failed to start monitoring", errorMsg);
      throw new Error(errorMsg);
    }
  },

  stopMonitoring: async () => {
    const { showInfo } = get();
    try {
      await monitorApi.stopMonitoring();
      set({ isMonitoring: false });
      showInfo("Monitoring stopped");
    } catch (error) {
      console.error("Failed to stop monitoring:", error);
    }
  },

  updateServerMetrics: (serverId: string, metrics: ServerMetrics) => {
    set((state) => ({
      serverMetrics: { ...state.serverMetrics, [serverId]: metrics },
    }));
  },

  addTriggeredAlert: (alert: Alert) => {
    set((state) => ({
      triggeredAlerts: [alert, ...state.triggeredAlerts].slice(0, 100), // Keep last 100 alerts
    }));
  },

  // ============================================================================
  // Snippet Actions (Phase 4)
  // ============================================================================

  loadSnippets: async () => {
    set({ isLoadingSnippets: true, snippetError: null });
    try {
      const snippets = await snippetApi.list();
      const categories = [...new Set(snippets.map((s) => s.category))];
      set({ snippets, snippetCategories: categories, isLoadingSnippets: false });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ snippetError: errorMsg, isLoadingSnippets: false });
    }
  },

  createSnippet: async (input: CreateSnippetInput) => {
    const { showError, showSuccess } = get();
    set({ snippetError: null });
    try {
      const snippet = await snippetApi.create(input);
      set((state) => {
        const categories = state.snippetCategories.includes(snippet.category)
          ? state.snippetCategories
          : [...state.snippetCategories, snippet.category];
        return {
          snippets: [...state.snippets, snippet],
          snippetCategories: categories,
        };
      });
      showSuccess("Snippet created", snippet.name);
      return snippet;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ snippetError: errorMsg });
      showError("Failed to create snippet", errorMsg);
      throw new Error(errorMsg);
    }
  },

  updateSnippet: async (id: string, input: UpdateSnippetInput) => {
    const { showError, showSuccess } = get();
    set({ snippetError: null });
    try {
      const snippet = await snippetApi.update(id, input);
      set((state) => ({
        snippets: state.snippets.map((s) => (s.id === id ? snippet : s)),
      }));
      showSuccess("Snippet updated", snippet.name);
      return snippet;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ snippetError: errorMsg });
      showError("Failed to update snippet", errorMsg);
      throw new Error(errorMsg);
    }
  },

  deleteSnippet: async (id: string) => {
    const { showError, showSuccess } = get();
    set({ snippetError: null });
    try {
      await snippetApi.delete(id);
      set((state) => ({
        snippets: state.snippets.filter((s) => s.id !== id),
        selectedSnippetId: state.selectedSnippetId === id ? null : state.selectedSnippetId,
      }));
      showSuccess("Snippet deleted");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      set({ snippetError: errorMsg });
      showError("Failed to delete snippet", errorMsg);
      throw new Error(errorMsg);
    }
  },

  searchSnippets: async (query: string) => {
    const { showError } = get();
    try {
      const snippets = await snippetApi.search(query);
      return snippets;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showError("Search failed", errorMsg);
      throw new Error(errorMsg);
    }
  },

  exportSnippets: async () => {
    const { showError, showSuccess } = get();
    try {
      const json = await snippetApi.export();
      showSuccess("Snippets exported");
      return json;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showError("Export failed", errorMsg);
      throw new Error(errorMsg);
    }
  },

  importSnippets: async (json: string) => {
    const { showError, showSuccess, loadSnippets } = get();
    try {
      const result = await snippetApi.import(json);
      await loadSnippets(); // Reload to get updated list
      showSuccess("Snippets imported", `${result.imported} imported, ${result.skipped} skipped`);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showError("Import failed", errorMsg);
      throw new Error(errorMsg);
    }
  },

  selectSnippet: (id: string | null) => {
    set({ selectedSnippetId: id });
  },

  // ============================================================================
  // Favorites Actions (Phase 4)
  // ============================================================================

  loadFavorites: async () => {
    set({ isLoadingFavorites: true });
    try {
      const favorites = await favoritesApi.list();
      set({ favorites, isLoadingFavorites: false });
    } catch (error) {
      console.error("Failed to load favorites:", error);
      set({ isLoadingFavorites: false });
    }
  },

  addFavorite: async (itemType: FavoriteType, itemId: string) => {
    const { showError, showSuccess } = get();
    try {
      await favoritesApi.add(itemType, itemId);
      // Reload favorites to get the new item with its ID
      const favorites = await favoritesApi.list();
      set({ favorites });
      showSuccess("Added to favorites");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showError("Failed to add favorite", errorMsg);
      throw new Error(errorMsg);
    }
  },

  removeFavorite: async (itemType: FavoriteType, itemId: string) => {
    const { showError, showSuccess } = get();
    try {
      await favoritesApi.remove(itemType, itemId);
      set((state) => ({
        favorites: state.favorites.filter(
          (f) => !(f.item_type === itemType && f.item_id === itemId)
        ),
      }));
      showSuccess("Removed from favorites");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showError("Failed to remove favorite", errorMsg);
      throw new Error(errorMsg);
    }
  },

  isFavorite: (itemType: FavoriteType, itemId: string) => {
    const { favorites } = get();
    return favorites.some((f) => f.item_type === itemType && f.item_id === itemId);
  },

  // ============================================================================
  // Activity Actions (Phase 4)
  // ============================================================================

  loadRecentActivity: async (limit: number = 50) => {
    set({ isLoadingActivity: true });
    try {
      const recentActivity = await activityApi.getRecent(limit);
      set({ recentActivity, isLoadingActivity: false });
    } catch (error) {
      console.error("Failed to load recent activity:", error);
      set({ isLoadingActivity: false });
    }
  },

  // UI Actions
  setSidebarItem: (item: "dashboard" | "servers" | "groups" | "files" | "terminal" | "scripts" | "snippets" | "ssh-keys" | "nginx" | "database") => {
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
      editorError: null,
      scriptError: null,
      deploymentError: null,
      groupError: null,
      batchError: null,
      transferError: null,
      monitorError: null,
      snippetError: null,
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
let phase4Cleanup: (() => void)[] = [];

// Desktop notification helper
async function showDesktopNotification(title: string, body: string, icon?: string) {
  // Check if notifications are supported and permission is granted
  if (!("Notification" in window)) {
    console.warn("Desktop notifications not supported");
    return;
  }

  if (Notification.permission === "granted") {
    new Notification(title, { body, icon });
  } else if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      new Notification(title, { body, icon });
    }
  }
}

export async function setupEventListeners(): Promise<() => void> {
  // Prevent duplicate setup
  if (eventCleanup) {
    return () => {
      eventCleanup?.unsubscribeAll();
      phase4Cleanup.forEach((cleanup) => cleanup());
    };
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

  // Phase 4 event listeners
  const alertUnlisten = await phase4EventApi.onAlertTriggered((payload: AlertTriggeredPayload) => {
    // Find server name
    const servers = useAppStore.getState().servers;
    const server = servers.find((s) => s.id === payload.server_id);
    const serverName = server?.name || payload.server_id;

    // Create alert object and add to triggered alerts
    const alert: Alert = {
      alert_config_id: payload.alert_id,
      server_id: payload.server_id,
      server_name: serverName,
      metric: payload.metric as Alert["metric"],
      condition: "greater_than", // Default, actual condition from backend
      threshold: payload.threshold,
      actual_value: payload.value,
      triggered_at: new Date().toISOString(),
    };
    store.addTriggeredAlert(alert);

    // Show desktop notification
    const metricLabel = payload.metric.replace("_", " ");
    showDesktopNotification(
      `Alert: ${serverName}`,
      `${metricLabel} is ${payload.value.toFixed(1)}% (threshold: ${payload.threshold}%)`,
    );

    // Also show in-app toast
    store.showWarning(
      `Alert: ${serverName}`,
      `${metricLabel} is ${payload.value.toFixed(1)}% (threshold: ${payload.threshold}%)`
    );
  });
  phase4Cleanup.push(alertUnlisten);

  const metricsUnlisten = await phase4EventApi.onMetricsUpdated((payload: MetricsUpdatedPayload) => {
    store.updateServerMetrics(payload.server_id, payload.metrics);
  });
  phase4Cleanup.push(metricsUnlisten);

  // Return cleanup function
  return () => {
    if (eventCleanup) {
      eventCleanup.unsubscribeAll();
      eventCleanup = null;
    }
    phase4Cleanup.forEach((cleanup) => cleanup());
    phase4Cleanup = [];
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

// Editor selector hooks (Phase 2)
export const useOpenFiles = () => useAppStore((state) => state.openFiles);
export const useActiveFile = () => {
  const openFiles = useAppStore((state) => state.openFiles);
  const activeId = useAppStore((state) => state.activeFileId);
  return activeId ? openFiles.find((f) => f.id === activeId) ?? null : null;
};
export const useActiveFileId = () => useAppStore((state) => state.activeFileId);
export const useEditorSettings = () => useAppStore((state) => state.editorSettings);
export const useConflicts = () => useAppStore((state) => state.conflicts);
export const useFileConflict = (fileId: string) =>
  useAppStore((state) => state.conflicts[fileId] ?? null);
export const useIsLoadingFile = () => useAppStore((state) => state.isLoadingFile);
export const useIsSavingFile = () => useAppStore((state) => state.isSavingFile);
export const useEditorError = () => useAppStore((state) => state.editorError);
export const useHasUnsavedFiles = () =>
  useAppStore((state) => state.openFiles.some((f) => f.isModified));
export const useEditorActions = () => ({
  openFile: useAppStore((state) => state.openFile),
  closeFile: useAppStore((state) => state.closeFile),
  closeAllFiles: useAppStore((state) => state.closeAllFiles),
  saveFile: useAppStore((state) => state.saveFile),
  saveAllFiles: useAppStore((state) => state.saveAllFiles),
  updateFileContent: useAppStore((state) => state.updateFileContent),
  setActiveFile: useAppStore((state) => state.setActiveFile),
  checkFileConflict: useAppStore((state) => state.checkFileConflict),
  resolveConflict: useAppStore((state) => state.resolveConflict),
  clearConflict: useAppStore((state) => state.clearConflict),
  loadEditorSettings: useAppStore((state) => state.loadEditorSettings),
  updateEditorSettings: useAppStore((state) => state.updateEditorSettings),
});

// Deployment Scripts selector hooks (Phase 3)
export const useScripts = () => useAppStore((state) => state.scripts);
export const useSelectedScript = () => {
  const scripts = useAppStore((state) => state.scripts);
  const selectedId = useAppStore((state) => state.selectedScriptId);
  return selectedId ? scripts.find((s) => s.id === selectedId) ?? null : null;
};
export const useSelectedScriptId = () => useAppStore((state) => state.selectedScriptId);
export const useTemplates = () => useAppStore((state) => state.templates);
export const useIsLoadingScripts = () => useAppStore((state) => state.isLoadingScripts);
export const useScriptError = () => useAppStore((state) => state.scriptError);

export const useDeployments = () => useAppStore((state) => state.deployments);
export const useActiveDeployment = () => {
  const deployments = useAppStore((state) => state.deployments);
  const activeId = useAppStore((state) => state.activeDeploymentId);
  return activeId ? deployments.find((d) => d.id === activeId) ?? null : null;
};
export const useActiveDeploymentId = () => useAppStore((state) => state.activeDeploymentId);
export const useExecutionStatus = () => useAppStore((state) => state.executionStatus);
export const useDeploymentLogs = (deploymentId: string) =>
  useAppStore((state) => state.deploymentLogs[deploymentId] ?? []);
export const useIsLoadingDeployments = () => useAppStore((state) => state.isLoadingDeployments);
export const useIsExecutingDeployment = () => useAppStore((state) => state.isExecutingDeployment);
export const useDeploymentError = () => useAppStore((state) => state.deploymentError);

export const useScriptActions = () => ({
  loadScripts: useAppStore((state) => state.loadScripts),
  createScript: useAppStore((state) => state.createScript),
  updateScript: useAppStore((state) => state.updateScript),
  deleteScript: useAppStore((state) => state.deleteScript),
  duplicateScript: useAppStore((state) => state.duplicateScript),
  exportScript: useAppStore((state) => state.exportScript),
  importScript: useAppStore((state) => state.importScript),
  validateScript: useAppStore((state) => state.validateScript),
  selectScript: useAppStore((state) => state.selectScript),
  loadTemplates: useAppStore((state) => state.loadTemplates),
  createFromTemplate: useAppStore((state) => state.createFromTemplate),
});

export const useDeploymentActions = () => ({
  startDeployment: useAppStore((state) => state.startDeployment),
  cancelDeployment: useAppStore((state) => state.cancelDeployment),
  dryRunDeployment: useAppStore((state) => state.dryRunDeployment),
  loadDeployments: useAppStore((state) => state.loadDeployments),
  loadDeploymentLogs: useAppStore((state) => state.loadDeploymentLogs),
  rollbackDeployment: useAppStore((state) => state.rollbackDeployment),
  getRollbackInfo: useAppStore((state) => state.getRollbackInfo),
  setActiveDeployment: useAppStore((state) => state.setActiveDeployment),
  clearDeploymentLogs: useAppStore((state) => state.clearDeploymentLogs),
});

// ============================================================================
// Server Groups selector hooks (Phase 4)
// ============================================================================

export const useGroups = () => useAppStore((state) => state.groups);
export const useSelectedGroup = () => {
  const groups = useAppStore((state) => state.groups);
  const selectedId = useAppStore((state) => state.selectedGroupId);
  return selectedId ? groups.find((g) => g.id === selectedId) ?? null : null;
};
export const useSelectedGroupId = () => useAppStore((state) => state.selectedGroupId);
export const useIsLoadingGroups = () => useAppStore((state) => state.isLoadingGroups);
export const useGroupError = () => useAppStore((state) => state.groupError);

export const useGroupActions = () => ({
  loadGroups: useAppStore((state) => state.loadGroups),
  createGroup: useAppStore((state) => state.createGroup),
  updateGroup: useAppStore((state) => state.updateGroup),
  deleteGroup: useAppStore((state) => state.deleteGroup),
  addServerToGroup: useAppStore((state) => state.addServerToGroup),
  removeServerFromGroup: useAppStore((state) => state.removeServerFromGroup),
  selectGroup: useAppStore((state) => state.selectGroup),
});

// ============================================================================
// Batch Operations selector hooks (Phase 4)
// ============================================================================

export const useBatchResults = () => useAppStore((state) => state.batchResults);
export const useBatchSummary = () => useAppStore((state) => state.batchSummary);
export const useHealthCheckResults = () => useAppStore((state) => state.healthCheckResults);
export const useHealthCheckSummary = () => useAppStore((state) => state.healthCheckSummary);
export const useIsExecutingBatch = () => useAppStore((state) => state.isExecutingBatch);
export const useBatchError = () => useAppStore((state) => state.batchError);

export const useBatchActions = () => ({
  executeBatchCommand: useAppStore((state) => state.executeBatchCommand),
  executeBatchHealthCheck: useAppStore((state) => state.executeBatchHealthCheck),
  clearBatchResults: useAppStore((state) => state.clearBatchResults),
});

// ============================================================================
// File Transfer selector hooks (Phase 4)
// ============================================================================

export const useTransfers = () => useAppStore((state) => state.transfers);
export const useTransferQueue = () => useAppStore((state) => state.transferQueue);
export const useActiveTransfer = () => {
  const transfers = useAppStore((state) => state.transfers);
  const activeId = useAppStore((state) => state.activeTransferId);
  return activeId ? transfers.find((t) => t.id === activeId) ?? null : null;
};
export const useIsTransferring = () => useAppStore((state) => state.isTransferring);
export const useTransferError = () => useAppStore((state) => state.transferError);

export const useTransferActions = () => ({
  queueUploads: useAppStore((state) => state.queueUploads),
  queueDownloads: useAppStore((state) => state.queueDownloads),
  cancelTransfer: useAppStore((state) => state.cancelTransfer),
  setTransferSpeedLimit: useAppStore((state) => state.setTransferSpeedLimit),
  updateTransferStatus: useAppStore((state) => state.updateTransferStatus),
  removeTransfer: useAppStore((state) => state.removeTransfer),
});

// ============================================================================
// Monitoring selector hooks (Phase 4)
// ============================================================================

export const useServerMetrics = (serverId: string) =>
  useAppStore((state) => state.serverMetrics[serverId] ?? null);
export const useAllServerMetrics = () => useAppStore((state) => state.serverMetrics);
export const useServerStatusList = () => useAppStore((state) => state.serverStatusList);
export const useMetricsHistory = (serverId: string, metric: string) =>
  useAppStore((state) => state.metricsHistory[`${serverId}:${metric}`] ?? []);
export const useAlerts = () => useAppStore((state) => state.alerts);
export const useTriggeredAlerts = () => useAppStore((state) => state.triggeredAlerts);
export const useIsMonitoring = () => useAppStore((state) => state.isMonitoring);
export const useIsLoadingMetrics = () => useAppStore((state) => state.isLoadingMetrics);
export const useMonitorError = () => useAppStore((state) => state.monitorError);

export const useMonitorActions = () => ({
  loadServerMetrics: useAppStore((state) => state.loadServerMetrics),
  loadAllServerStatus: useAppStore((state) => state.loadAllServerStatus),
  loadMetricsHistory: useAppStore((state) => state.loadMetricsHistory),
  createAlert: useAppStore((state) => state.createAlert),
  deleteAlert: useAppStore((state) => state.deleteAlert),
  loadAlerts: useAppStore((state) => state.loadAlerts),
  startMonitoring: useAppStore((state) => state.startMonitoring),
  stopMonitoring: useAppStore((state) => state.stopMonitoring),
  updateServerMetrics: useAppStore((state) => state.updateServerMetrics),
  addTriggeredAlert: useAppStore((state) => state.addTriggeredAlert),
});

// ============================================================================
// Snippets selector hooks (Phase 4)
// ============================================================================

export const useSnippets = () => useAppStore((state) => state.snippets);
export const useSelectedSnippet = () => {
  const snippets = useAppStore((state) => state.snippets);
  const selectedId = useAppStore((state) => state.selectedSnippetId);
  return selectedId ? snippets.find((s) => s.id === selectedId) ?? null : null;
};
export const useSelectedSnippetId = () => useAppStore((state) => state.selectedSnippetId);
export const useSnippetCategories = () => useAppStore((state) => state.snippetCategories);
export const useSnippetsByCategory = (category: string) =>
  useAppStore((state) => state.snippets.filter((s) => s.category === category));
export const useIsLoadingSnippets = () => useAppStore((state) => state.isLoadingSnippets);
export const useSnippetError = () => useAppStore((state) => state.snippetError);

export const useSnippetActions = () => ({
  loadSnippets: useAppStore((state) => state.loadSnippets),
  createSnippet: useAppStore((state) => state.createSnippet),
  updateSnippet: useAppStore((state) => state.updateSnippet),
  deleteSnippet: useAppStore((state) => state.deleteSnippet),
  searchSnippets: useAppStore((state) => state.searchSnippets),
  exportSnippets: useAppStore((state) => state.exportSnippets),
  importSnippets: useAppStore((state) => state.importSnippets),
  selectSnippet: useAppStore((state) => state.selectSnippet),
});

// ============================================================================
// Favorites & Activity selector hooks (Phase 4)
// ============================================================================

export const useFavorites = () => useAppStore((state) => state.favorites);
export const useFavoriteServers = () =>
  useAppStore((state) => state.favorites.filter((f) => f.item_type === "server"));
export const useFavoriteScripts = () =>
  useAppStore((state) => state.favorites.filter((f) => f.item_type === "script"));
export const useFavoriteSnippets = () =>
  useAppStore((state) => state.favorites.filter((f) => f.item_type === "snippet"));
export const useIsLoadingFavorites = () => useAppStore((state) => state.isLoadingFavorites);

export const useRecentActivity = () => useAppStore((state) => state.recentActivity);
export const useIsLoadingActivity = () => useAppStore((state) => state.isLoadingActivity);

export const useFavoritesActions = () => ({
  loadFavorites: useAppStore((state) => state.loadFavorites),
  addFavorite: useAppStore((state) => state.addFavorite),
  removeFavorite: useAppStore((state) => state.removeFavorite),
  isFavorite: useAppStore((state) => state.isFavorite),
});

export const useActivityActions = () => ({
  loadRecentActivity: useAppStore((state) => state.loadRecentActivity),
});