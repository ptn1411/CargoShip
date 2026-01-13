import { Server, Monitor, Cloud, Rocket, MoreVertical, Wifi, WifiOff, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { Server as ServerType } from "../../lib/tauri";
import { ServerConnectionStatus } from "../../store";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

interface ServerCardProps {
  server: ServerType;
  status: ServerConnectionStatus;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTestConnection: () => void;
  onBrowseFiles: () => void;
  onOpenTerminal: () => void;
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

export function ServerCard({
  server,
  status,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onTestConnection,
  onBrowseFiles,
  onOpenTerminal,
}: ServerCardProps) {
  const EnvIcon = environmentIcons[server.environment];

  return (
    <div
      className={cn(
        "relative p-4 rounded-lg border transition-all cursor-pointer",
        isSelected
          ? "border-primary bg-accent"
          : "border-border hover:border-primary/50 hover:bg-accent/50"
      )}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpenTerminal();
      }}
    >
      {/* Status Indicator */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <ConnectionStatusIndicator status={status} />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="p-1 rounded hover:bg-secondary"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="w-4 h-4 text-muted-foreground" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[140px] bg-popover border border-border rounded-md p-1 shadow-md z-50"
              sideOffset={5}
            >
              <DropdownMenu.Item
                className="flex items-center px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  onTestConnection();
                }}
              >
                Test Connection
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex items-center px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  onBrowseFiles();
                }}
              >
                Browse Files
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex items-center px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTerminal();
                }}
              >
                Open Terminal
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="h-px bg-border my-1" />
              <DropdownMenu.Item
                className="flex items-center px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                Edit
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex items-center px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* Server Icon and Name */}
      <div className="flex items-start gap-3 pr-16">
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

interface ConnectionStatusIndicatorProps {
  status: ServerConnectionStatus;
  showLabel?: boolean;
}

export function ConnectionStatusIndicator({ status, showLabel = false }: ConnectionStatusIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5">
      {status === "connecting" ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-yellow-500" />
      ) : status === "online" ? (
        <Wifi className="w-3.5 h-3.5 text-green-500" />
      ) : (
        <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />
      )}
      {showLabel && (
        <span className={cn(
          "text-xs capitalize",
          status === "online" && "text-green-500",
          status === "connecting" && "text-yellow-500",
          status === "offline" && "text-muted-foreground"
        )}>
          {status}
        </span>
      )}
    </div>
  );
}
