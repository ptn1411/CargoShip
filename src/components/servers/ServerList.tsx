import { Grid, List, Plus, RefreshCw, Server as ServerIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { parseError } from "../../lib/errorHandler";
import {
  CreateServerInput,
  Server,
  UpdateServerInput,
  credentialApi,
} from "../../lib/tauri";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import { Button, EmptyState, PageHeader, SkeletonCard } from "../ui";
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
  const setFileBrowserServer = useAppStore(
    (state) => state.setFileBrowserServer
  );
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
        if (
          keyPassphrase !== undefined &&
          (input as UpdateServerInput).auth_method === "ssh_key"
        ) {
          await credentialApi.storeKeyPassphrase(
            editingServer.id,
            keyPassphrase
          );
        }
        showSuccess(
          "Server Updated",
          `"${
            (input as UpdateServerInput).name || editingServer.name
          }" has been updated.`
        );
      } else {
        const server = await addServer(input as CreateServerInput, credential);
        // If SSH key passphrase provided, store it
        if (
          keyPassphrase !== undefined &&
          (input as CreateServerInput).auth_method === "ssh_key"
        ) {
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
        showWarning(
          "Connection Failed",
          status.error || "Could not connect to server"
        );
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
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <PageHeader
        title="Servers"
        description="Manage your SSH connections"
        icon={<ServerIcon className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-2.5 cursor-pointer transition-all duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                  viewMode === "grid"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-muted-foreground hover:text-foreground"
                )}
                aria-label="Grid view"
                aria-pressed={viewMode === "grid"}>
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "p-2.5 cursor-pointer transition-all duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                  viewMode === "list"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-muted-foreground hover:text-foreground"
                )}
                aria-label="List view"
                aria-pressed={viewMode === "list"}>
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              isLoading={isRefreshing}
              aria-label="Refresh servers">
              <RefreshCw className="w-4 h-4" />
            </Button>

            {/* Add Server Button */}
            <Button onClick={handleAddServer} leftIcon={<Plus className="w-4 h-4" />}>
              Add Server
            </Button>
          </div>
        }
      />

      {/* Error Message */}
      {serverError && (
        <div
          className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm"
          role="alert">
          {serverError}
        </div>
      )}

      {/* Loading State */}
      {isLoadingServers && servers.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoadingServers && servers.length === 0 && (
        <EmptyState
          icon={<ServerIcon className="w-8 h-8" />}
          title="No servers configured"
          description="Add your first SSH server to start managing your infrastructure"
          actions={
            <Button onClick={handleAddServer} leftIcon={<Plus className="w-4 h-4" />}>
              Add Server
            </Button>
          }
          className="flex-1"
        />
      )}

      {/* Server Grid/List */}
      {servers.length > 0 && (
        <div
          className={cn(
            "flex-1 overflow-auto",
            viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 content-start"
              : "flex flex-col gap-3"
          )}
          role="list"
          aria-label="Server list">
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
