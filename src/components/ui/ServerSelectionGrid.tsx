import { Server, Monitor, Cloud, Rocket, Wifi, WifiOff, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { Server as ServerType } from "../../lib/tauri";
import { ServerConnectionStatus } from "../../store";

interface ServerSelectionGridProps {
  servers: ServerType[];
  serverStatus: Record<string, ServerConnectionStatus>;
  onSelect: (serverId: string) => void;
  emptyTitle: string;
  emptyDescription: string;
  isLoading?: boolean;
}

const environmentIcons = {
  dev: Monitor,
  staging: Cloud,
  prod: Rocket,
};

const environmentColors = {
  dev: "text-blue-500",
  staging: "text-yellow-500",
  prod: "text-red-500",
};

export function ServerSelectionGrid({
  servers,
  serverStatus,
  onSelect,
  emptyTitle,
  emptyDescription,
  isLoading = false,
}: ServerSelectionGridProps) {
  if (servers.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
          <Server className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">{emptyTitle}</h3>
        <p className="text-muted-foreground">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <p className="text-sm text-muted-foreground mb-4">
        Double-click a server to open
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
        {servers.map((server) => (
          <ServerSelectionCard
            key={server.id}
            server={server}
            status={serverStatus[server.id] || "offline"}
            onDoubleClick={() => onSelect(server.id)}
            isLoading={isLoading}
          />
        ))}
      </div>
    </div>
  );
}

interface ServerSelectionCardProps {
  server: ServerType;
  status: ServerConnectionStatus;
  onDoubleClick: () => void;
  isLoading?: boolean;
}

function ServerSelectionCard({
  server,
  status,
  onDoubleClick,
  isLoading = false,
}: ServerSelectionCardProps) {
  const EnvIcon = environmentIcons[server.environment];

  return (
    <div
      className={cn(
        "relative p-4 rounded-lg border transition-all cursor-pointer",
        "border-border hover:border-primary/50 hover:bg-accent/50",
        isLoading && "opacity-50 pointer-events-none"
      )}
      onDoubleClick={onDoubleClick}
    >
      {/* Status Indicator */}
      <div className="absolute top-3 right-3">
        {status === "connecting" ? (
          <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
        ) : status === "online" ? (
          <Wifi className="w-4 h-4 text-green-500" />
        ) : (
          <WifiOff className="w-4 h-4 text-muted-foreground" />
        )}
      </div>

      {/* Server Icon and Name */}
      <div className="flex items-start gap-3 pr-8">
        <div className={cn("p-2 rounded-lg bg-secondary", environmentColors[server.environment])}>
          <Server className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{server.name}</h3>
          <p className="text-sm text-muted-foreground truncate">
            {server.username}@{server.host}:{server.port}
          </p>
        </div>
      </div>

      {/* Tags and Environment */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
            server.environment === "dev" && "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
            server.environment === "staging" && "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
            server.environment === "prod" && "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
          )}
        >
          <EnvIcon className="w-3 h-3" />
          {server.environment}
        </span>
        {server.tags.slice(0, 2).map((tag) => (
          <span
            key={tag}
            className="px-2 py-0.5 rounded-full text-xs bg-secondary text-muted-foreground"
          >
            {tag}
          </span>
        ))}
        {server.tags.length > 2 && (
          <span className="text-xs text-muted-foreground">
            +{server.tags.length - 2}
          </span>
        )}
      </div>
    </div>
  );
}
