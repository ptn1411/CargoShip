import { useState } from "react";
import { Play, Square, RotateCcw, Pause, PlayCircle, Trash2, FileText, BarChart3, MoreVertical } from "lucide-react";
import { cn } from "../../lib/utils";
import { dockerApi, DockerContainer, ContainerState } from "../../lib/tauri";
import { useAppStore } from "../../store";
import { ContainerLogs } from "./ContainerLogs";
import { DockerStats } from "./DockerStats";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

interface ContainerCardProps {
  container: DockerContainer;
  serverId: string;
  onAction: () => void;
}

const stateColors: Record<ContainerState, string> = {
  running: "bg-green-500",
  paused: "bg-yellow-500",
  restarting: "bg-blue-500",
  exited: "bg-gray-500",
  dead: "bg-red-500",
  created: "bg-purple-500",
  removing: "bg-orange-500",
};

export function ContainerCard({ container, serverId, onAction }: ContainerCardProps) {
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);
  const [isLoading, setIsLoading] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const handleAction = async (action: () => Promise<void>, successMsg: string) => {
    setIsLoading(true);
    try {
      await action();
      showSuccess(successMsg);
      onAction();
    } catch (err) {
      showError("Action failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  const isRunning = container.state === "running";
  const isPaused = container.state === "paused";

  return (
    <>
      <div className="bg-secondary border border-border rounded-lg p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={cn("w-3 h-3 rounded-full mt-1.5", stateColors[container.state])} />
            <div>
              <h3 className="font-medium">{container.name}</h3>
              <p className="text-sm text-muted-foreground">{container.image}</p>
              <p className="text-xs text-muted-foreground mt-1">{container.status}</p>
              {container.ports.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {container.ports.map((port, i) => (
                    <span key={i} className="px-2 py-0.5 bg-accent text-xs rounded">
                      {port.host_port ? `${port.host_port}:` : ""}{port.container_port}/{port.protocol}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Quick Actions */}
            {!isRunning && container.state !== "removing" && (
              <button
                onClick={() => handleAction(() => dockerApi.startContainer(serverId, container.id), "Container started")}
                disabled={isLoading}
                className="p-2 hover:bg-accent rounded text-green-500"
                title="Start"
              >
                <Play className="w-4 h-4" />
              </button>
            )}
            {isRunning && (
              <>
                <button
                  onClick={() => handleAction(() => dockerApi.stopContainer(serverId, container.id), "Container stopped")}
                  disabled={isLoading}
                  className="p-2 hover:bg-accent rounded text-red-500"
                  title="Stop"
                >
                  <Square className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleAction(() => dockerApi.restartContainer(serverId, container.id), "Container restarted")}
                  disabled={isLoading}
                  className="p-2 hover:bg-accent rounded text-blue-500"
                  title="Restart"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </>
            )}
            {isRunning && !isPaused && (
              <button
                onClick={() => handleAction(() => dockerApi.pauseContainer(serverId, container.id), "Container paused")}
                disabled={isLoading}
                className="p-2 hover:bg-accent rounded text-yellow-500"
                title="Pause"
              >
                <Pause className="w-4 h-4" />
              </button>
            )}
            {isPaused && (
              <button
                onClick={() => handleAction(() => dockerApi.unpauseContainer(serverId, container.id), "Container unpaused")}
                disabled={isLoading}
                className="p-2 hover:bg-accent rounded text-green-500"
                title="Unpause"
              >
                <PlayCircle className="w-4 h-4" />
              </button>
            )}

            {/* More Actions */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="p-2 hover:bg-accent rounded">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="min-w-[160px] bg-popover border border-border rounded-md p-1 shadow-lg z-50">
                  <DropdownMenu.Item
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-accent outline-none"
                    onClick={() => setShowLogs(true)}
                  >
                    <FileText className="w-4 h-4" />
                    View Logs
                  </DropdownMenu.Item>
                  {isRunning && (
                    <DropdownMenu.Item
                      className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-accent outline-none"
                      onClick={() => setShowStats(true)}
                    >
                      <BarChart3 className="w-4 h-4" />
                      View Stats
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Separator className="h-px bg-border my-1" />
                  <DropdownMenu.Item
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-accent outline-none text-destructive"
                    onClick={() => handleAction(() => dockerApi.removeContainer(serverId, container.id, true), "Container removed")}
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </div>

      {/* Logs Modal */}
      {showLogs && (
        <ContainerLogs
          serverId={serverId}
          containerId={container.id}
          containerName={container.name}
          onClose={() => setShowLogs(false)}
        />
      )}

      {/* Stats Modal */}
      {showStats && (
        <DockerStats
          serverId={serverId}
          containerId={container.id}
          containerName={container.name}
          onClose={() => setShowStats(false)}
        />
      )}
    </>
  );
}
