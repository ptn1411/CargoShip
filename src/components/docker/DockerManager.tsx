import { useState, useEffect } from "react";
import { Box, RefreshCw, Container, Image, HardDrive, Network, Trash2, AlertCircle, Server } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import { dockerApi, DockerInfo } from "../../lib/tauri";
import { ContainerList } from "./ContainerList";
import { ImageList } from "./ImageList";
import { VolumeList } from "./VolumeList";
import { NetworkList } from "./NetworkList";
import { LoadingSpinner } from "../ui";

type DockerTab = "containers" | "images" | "volumes" | "networks";

export function DockerManager() {
  const servers = useAppStore((state) => state.servers);
  const loadServers = useAppStore((state) => state.loadServers);
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DockerTab>("containers");
  const [dockerInfo, setDockerInfo] = useState<DockerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPruning, setIsPruning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  useEffect(() => {
    if (selectedServerId) {
      loadDockerInfo();
    }
  }, [selectedServerId]);

  const loadDockerInfo = async () => {
    if (!selectedServerId) return;
    setIsLoading(true);
    setError(null);
    try {
      const info = await dockerApi.getInfo(selectedServerId);
      setDockerInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to Docker");
      setDockerInfo(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrune = async (type: "containers" | "images" | "volumes" | "networks" | "all") => {
    if (!selectedServerId) return;
    setIsPruning(true);
    try {
      const result = await dockerApi.prune(selectedServerId, type);
      showSuccess("Prune completed", result.substring(0, 100));
      loadDockerInfo();
    } catch (err) {
      showError("Prune failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsPruning(false);
    }
  };

  const tabs = [
    { id: "containers" as const, label: "Containers", icon: Container },
    { id: "images" as const, label: "Images", icon: Image },
    { id: "volumes" as const, label: "Volumes", icon: HardDrive },
    { id: "networks" as const, label: "Networks", icon: Network },
  ];

  if (!selectedServerId) {
    return (
      <div className="h-full flex flex-col p-4">
        <div className="flex items-center gap-2 mb-4">
          <Box className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Docker Manager</h2>
        </div>
        {servers.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
              <Server className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No servers configured</h3>
            <p className="text-muted-foreground">Add a server first to manage Docker</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <p className="text-sm text-muted-foreground mb-4">Select a server to manage Docker</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {servers.map((server) => (
                <div
                  key={server.id}
                  onClick={() => setSelectedServerId(server.id)}
                  className="p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/50 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-secondary">
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-medium">{server.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {server.username}@{server.host}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const selectedServer = servers.find((s) => s.id === selectedServerId);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedServerId(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            ← Back
          </button>
          <Box className="w-5 h-5 text-primary" />
          <div>
            <h2 className="font-semibold">{selectedServer?.name}</h2>
            {dockerInfo && (
              <p className="text-xs text-muted-foreground">
                Docker {dockerInfo.version} • {dockerInfo.containers_running} running
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handlePrune("all")}
            disabled={isPruning}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-destructive/10 text-destructive rounded hover:bg-destructive/20 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {isPruning ? "Pruning..." : "Prune All"}
          </button>
          <button
            onClick={loadDockerInfo}
            disabled={isLoading}
            className="p-2 hover:bg-accent rounded"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="m-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-destructive" />
          <div>
            <p className="font-medium text-destructive">Docker not available</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && !dockerInfo && (
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      )}

      {/* Docker Info Summary */}
      {dockerInfo && (
        <>
          <div className="grid grid-cols-5 gap-4 p-4 border-b border-border">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-500">{dockerInfo.containers_running}</p>
              <p className="text-xs text-muted-foreground">Running</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-500">{dockerInfo.containers_paused}</p>
              <p className="text-xs text-muted-foreground">Paused</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-500">{dockerInfo.containers_stopped}</p>
              <p className="text-xs text-muted-foreground">Stopped</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-500">{dockerInfo.images}</p>
              <p className="text-xs text-muted-foreground">Images</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{dockerInfo.cpus}</p>
              <p className="text-xs text-muted-foreground">CPUs</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-auto">
            {activeTab === "containers" && (
              <ContainerList serverId={selectedServerId} onRefresh={loadDockerInfo} />
            )}
            {activeTab === "images" && (
              <ImageList serverId={selectedServerId} onRefresh={loadDockerInfo} />
            )}
            {activeTab === "volumes" && (
              <VolumeList serverId={selectedServerId} />
            )}
            {activeTab === "networks" && (
              <NetworkList serverId={selectedServerId} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
