import { useState, useEffect } from "react";
import { X, RefreshCw } from "lucide-react";
import { dockerApi, ContainerStats } from "../../lib/tauri";
import { useAppStore } from "../../store";

interface DockerStatsProps {
  serverId: string;
  containerId: string;
  containerName: string;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function DockerStats({ serverId, containerId, containerName, onClose }: DockerStatsProps) {
  const showError = useAppStore((state) => state.showError);
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const result = await dockerApi.getContainerStats(serverId, containerId);
      setStats(result);
    } catch (err) {
      showError("Failed to load stats", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, [serverId, containerId]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg w-[500px]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">Stats: {containerName}</h3>
          <div className="flex items-center gap-2">
            <button onClick={loadStats} className="p-2 hover:bg-accent rounded" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-accent rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats Content */}
        <div className="p-4 space-y-4">
          {stats ? (
            <>
              {/* CPU */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>CPU Usage</span>
                  <span className="font-mono">{stats.cpu_percent.toFixed(2)}%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${Math.min(stats.cpu_percent, 100)}%` }}
                  />
                </div>
              </div>

              {/* Memory */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Memory Usage</span>
                  <span className="font-mono">
                    {formatBytes(stats.memory_usage)} / {formatBytes(stats.memory_limit)} ({stats.memory_percent.toFixed(2)}%)
                  </span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${Math.min(stats.memory_percent, 100)}%` }}
                  />
                </div>
              </div>

              {/* Network */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-secondary p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Network RX</p>
                  <p className="font-mono text-lg">{formatBytes(stats.network_rx)}</p>
                </div>
                <div className="bg-secondary p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Network TX</p>
                  <p className="font-mono text-lg">{formatBytes(stats.network_tx)}</p>
                </div>
              </div>

              {/* Block I/O */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-secondary p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Block Read</p>
                  <p className="font-mono text-lg">{formatBytes(stats.block_read)}</p>
                </div>
                <div className="bg-secondary p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Block Write</p>
                  <p className="font-mono text-lg">{formatBytes(stats.block_write)}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {isLoading ? "Loading stats..." : "No stats available"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
