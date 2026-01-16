import { FolderOpen, MoreVertical, Server } from "lucide-react";
import { cn } from "../../lib/utils";
import { ServerGroup } from "../../lib/tauri";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

interface GroupCardProps {
  group: ServerGroup;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDeploy?: () => void;
}

export function GroupCard({
  group,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onDeploy,
}: GroupCardProps) {
  const serverCount = group.server_ids.length;

  return (
    <div
      className={cn(
        "relative p-4 rounded-lg border transition-all cursor-pointer",
        isSelected
          ? "border-primary bg-accent"
          : "border-border hover:border-primary/50 hover:bg-accent/50"
      )}
      onClick={onSelect}
    >
      {/* Actions Menu */}
      <div className="absolute top-3 right-3">
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
              {onDeploy && (
                <DropdownMenu.Item
                  className="flex items-center px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeploy();
                  }}
                >
                  Deploy to Group
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Item
                className="flex items-center px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                Edit
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="h-px bg-border my-1" />
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

      {/* Group Icon and Name */}
      <div className="flex items-start gap-3 pr-10">
        <div className="p-2 rounded-lg bg-secondary text-primary">
          <FolderOpen className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{group.name}</h3>
          {group.description && (
            <p className="text-sm text-muted-foreground truncate">
              {group.description}
            </p>
          )}
        </div>
      </div>

      {/* Server Count */}
      <div className="mt-3 flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
            serverCount > 0
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
              : "bg-secondary text-muted-foreground"
          )}
        >
          <Server className="w-3 h-3" />
          {serverCount} {serverCount === 1 ? "server" : "servers"}
        </span>
      </div>
    </div>
  );
}
