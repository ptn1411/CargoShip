import { useEffect, useState } from "react";
import { Plus, Grid, List, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import { Server, CreateServerInput, UpdateServerInput, credentialApi } from "../../lib/tauri";
import { parseError } from "../../lib/errorHandler";
import { ServerCard } from "./ServerCard";
import { ServerForm } from "./ServerForm";

type ViewMode = "grid" | "list";

export function ServerList() {
  const servers = useAppStore((state) => state.servers);
  const serverStatus = useAppStore((state) => state.serverStatus);
  const selectedServerId = useAppStore((state) => state.selectedServerId);
  const isLoadingServers = useAppStore((state) => state.isLoadingServers);
  const serverError = useAppStore((state) => state.serverError);
  
  const loadServers = useAppStore((state) => state.loadServers);
  const addServer = useAppStore((state) => state.addServer);
  const updateServer = useAppStore((state) => state.updateServer);
  const deleteServer = useAppStore((state) => state.deleteServer);
  const selectServer = useAppStore((state) => state.selectServer);
  const testConnection = useAppStore((state) => state.testConnection);
  const setSidebarItem = useAppStore((state) => state.setSidebarItem);
  const setFileBrowserServer = useAppStore((state) => state.setFileBrowserServer);
  const openTerminal = useAppStore((state) => state.openTerminal);
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);
  const showWarning = useAppStore((state) => state.showWarning);

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load servers on mount
  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadServers();
    setIsRefreshing(false);
  };

  const handleAddServer = () => {
    setEditingServer(null);
    setIsFormOpen(true);
  };

  const handleEditServer = (server: Server) => {
    setEditingServer(server);
    setIsFormOpen(true);
  };

  const handleDeleteServer = async (server: Server) => {
    if (window.confirm(`Are you sure you want to delete "${server.name}"?`)) {
      try {
        await deleteServer(server.id);
        showSuccess("Server Deleted", `"${server.name}" has been removed.`);
      } catch (error) {
        const parsed = parseError(error);
        showError(parsed.title, parsed.message);
      }
    }
  };

  const handleFormSubmit = async (
    input: CreateServerInput | UpdateServerInput,
    credential?: string,
    keyPassphrase?: string
  ) => {
    try {
      if (editingServer) {
        await updateServer(editingServer.id, input as UpdateServerInput);
        // If credential provided, store it
        if (credential) {
          await credentialApi.store(
            editingServer.id,
            credential,
            (input as UpdateServerInput).auth_method === "password"
          );
        }
        // If SSH key passphrase provided, store it
        if (keyPassphrase !== undefined && (input as UpdateServerInput).auth_method === "ssh_key") {
          await credentialApi.storeKeyPassphrase(editingServer.id, keyPassphrase);
        }
        showSuccess("Server Updated", `"${(input as UpdateServerInput).name || editingServer.name}" has been updated.`);
      } else {
        const server = await addServer(input as CreateServerInput, credential);
        // If SSH key passphrase provided, store it
        if (keyPassphrase !== undefined && (input as CreateServerInput).auth_method === "ssh_key") {
          await credentialApi.storeKeyPassphrase(server.id, keyPassphrase);
        }
        showSuccess("Server Added", `"${server.name}" has been added.`);
      }
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
      throw error; // Re-throw to keep form open
    }
  };

  const handleTestConnection = async (server: Server) => {
    try {
      const status = await testConnection(server.id);
      if (status.connected) {
        showSuccess("Connection Successful", `Connected to ${server.name}`);
      } else {
        showWarning("Connection Failed", status.error || "Could not connect to server");
      }
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message, {
        label: "Retry",
        onClick: () => handleTestConnection(server),
      });
    }
  };

  const handleBrowseFiles = (server: Server) => {
    setFileBrowserServer(server.id);
    setSidebarItem("files");
  };

  const handleOpenTerminal = async (server: Server) => {
    try {
      await openTerminal(server.id);
      setSidebarItem("terminal");
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Servers</h2>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center border border-border rounded-md">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-2 rounded-l-md transition-colors",
                viewMode === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
              title="Grid view"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-2 rounded-r-md transition-colors",
                viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-md border border-border hover:bg-accent disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          </button>

          {/* Add Server Button */}
          <button
            onClick={handleAddServer}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Add Server
          </button>
        </div>
      </div>

      {/* Error Message */}
      {serverError && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {serverError}
        </div>
      )}

      {/* Loading State */}
      {isLoadingServers && servers.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!isLoadingServers && servers.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
            <Plus className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No servers configured</h3>
          <p className="text-muted-foreground mb-4">
            Add your first server to get started
          </p>
          <button
            onClick={handleAddServer}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Add Server
          </button>
        </div>
      )}

      {/* Server Grid/List */}
      {servers.length > 0 && (
        <div
          className={cn(
            "flex-1 overflow-auto",
            viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 content-start"
              : "flex flex-col gap-2"
          )}
        >
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              status={serverStatus[server.id] || "offline"}
              isSelected={selectedServerId === server.id}
              onSelect={() => selectServer(server.id)}
              onEdit={() => handleEditServer(server)}
              onDelete={() => handleDeleteServer(server)}
              onTestConnection={() => handleTestConnection(server)}
              onBrowseFiles={() => handleBrowseFiles(server)}
              onOpenTerminal={() => handleOpenTerminal(server)}
            />
          ))}
        </div>
      )}

      {/* Server Form Dialog */}
      <ServerForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        server={editingServer}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
