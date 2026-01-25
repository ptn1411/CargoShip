import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Cloud,
  Loader2,
  Monitor,
  MoreVertical,
  Rocket,
  Server,
  WifiOff,
} from "lucide-react";
import { Server as ServerType } from "../../lib/tauri";
import { cn } from "../../lib/utils";
import { ServerConnectionStatus } from "../../store";
import { FavoriteButton } from "../quick-actions";

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
  staging: "text-amber-500",
  prod: "text-red-500",
};

const environmentBadgeStyles = {
  dev: "bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/20",
  staging:
    "bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/20",
  prod: "bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/20",
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
        "relative p-4 rounded-xl border cursor-pointer",
        "transition-all duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        isSelected
          ? "border-primary bg-primary/5 shadow-lg glow-primary"
          : "border-border bg-card hover:border-primary/40 hover:bg-accent/50 hover:shadow-md"
      )}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpenTerminal();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect();
        if (e.key === "Enter" && e.shiftKey) onOpenTerminal();
      }}
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
      aria-label={`${server.name} - ${status}`}>
      {/* Status Indicator */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <FavoriteButton itemType="server" itemId={server.id} size="sm" />
        <ConnectionStatusIndicator status={status} />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className={cn(
                "p-1.5 rounded-lg cursor-pointer",
                "text-muted-foreground hover:text-foreground",
                "hover:bg-accent transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              )}
              onClick={(e) => e.stopPropagation()}
              aria-label="Server options">
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className={cn(
                "min-w-[160px] bg-popover border border-border rounded-lg p-1.5 shadow-xl z-50",
                "animate-scale-in"
              )}
              sideOffset={5}>
              <DropdownMenu.Item
                className={cn(
                  "flex items-center px-3 py-2 text-sm rounded-md cursor-pointer outline-none",
                  "transition-colors duration-150 hover:bg-accent"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onTestConnection();
                }}>
                Test Connection
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={cn(
                  "flex items-center px-3 py-2 text-sm rounded-md cursor-pointer outline-none",
                  "transition-colors duration-150 hover:bg-accent"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onBrowseFiles();
                }}>
                Browse Files
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={cn(
                  "flex items-center px-3 py-2 text-sm rounded-md cursor-pointer outline-none",
                  "transition-colors duration-150 hover:bg-accent"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTerminal();
                }}>
                Open Terminal
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="h-px bg-border my-1.5" />
              <DropdownMenu.Item
                className={cn(
                  "flex items-center px-3 py-2 text-sm rounded-md cursor-pointer outline-none",
                  "transition-colors duration-150 hover:bg-accent"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}>
                Edit
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={cn(
                  "flex items-center px-3 py-2 text-sm rounded-md cursor-pointer outline-none",
                  "transition-colors duration-150 hover:bg-destructive/10 text-destructive"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}>
                Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* Server Icon and Name */}
      <div className="flex items-start gap-3 pr-20">
        <div
          className={cn(
            "p-2.5 rounded-lg bg-muted/50",
            environmentColors[server.environment]
          )}>
          <Server className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">{server.name}</h3>
          <p className="text-sm text-muted-foreground truncate font-mono">
            {server.username}@{server.host}:{server.port}
          </p>
        </div>
      </div>

      {/* Tags and Environment */}
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border",
            environmentBadgeStyles[server.environment]
          )}>
          <EnvIcon className="w-3 h-3" aria-hidden="true" />
          <span className="capitalize">{server.environment}</span>
        </span>
        {server.tags.slice(0, 2).map((tag) => (
          <span
            key={tag}
            className="px-2 py-1 rounded-md text-xs bg-muted text-muted-foreground font-medium">
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

export function ConnectionStatusIndicator({
  status,
  showLabel = false,
}: ConnectionStatusIndicatorProps) {
  return (
    <div
      className="flex items-center gap-1.5"
      role="status"
      aria-label={`Connection status: ${status}`}>
      {status === "connecting" ? (
        <Loader2
          className="w-3.5 h-3.5 animate-spin status-warning"
          aria-hidden="true"
        />
      ) : status === "online" ? (
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
        </span>
      ) : (
        <WifiOff
          className="w-3.5 h-3.5 text-muted-foreground"
          aria-hidden="true"
        />
      )}
      {showLabel && (
        <span
          className={cn(
            "text-xs font-medium capitalize",
            status === "online" && "status-online",
            status === "connecting" && "status-warning",
            status === "offline" && "text-muted-foreground"
          )}>
          {status}
        </span>
      )}
    </div>
  );
}
