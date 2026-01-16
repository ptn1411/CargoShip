import { MoreVertical, Edit, Trash2, Copy, Terminal, FileCode, Tag, Clock } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "../../lib/utils";
import { Snippet } from "../../lib/tauri";

interface SnippetCardProps {
  snippet: Snippet;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onInsertToTerminal?: () => void;
  onInsertToScript?: () => void;
  formatDate: (dateStr: string) => string;
}

/**
 * SnippetCard displays a single snippet with actions
 * Requirements: 5.2, 5.4, 5.5
 */
export function SnippetCard({
  snippet,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onInsertToTerminal,
  onInsertToScript,
  formatDate,
}: SnippetCardProps) {
  const handleCopyCommand = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(snippet.command);
  };

  return (
    <div
      className={cn(
        "relative p-4 rounded-lg border transition-all cursor-pointer",
        isSelected
          ? "border-primary bg-accent"
          : "border-border hover:border-primary/50 hover:bg-accent/50"
      )}
      onClick={onSelect}
      onDoubleClick={onEdit}
    >
      {/* Actions Menu */}
      <div className="absolute top-3 right-3 flex items-center gap-1">
        <button
          className="p-1.5 rounded hover:bg-secondary"
          onClick={handleCopyCommand}
          title="Copy command"
        >
          <Copy className="w-4 h-4 text-muted-foreground" />
        </button>
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
              className="min-w-[160px] bg-popover border border-border rounded-md p-1 shadow-md z-50"
              sideOffset={5}
            >
              {onInsertToTerminal && (
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInsertToTerminal();
                  }}
                >
                  <Terminal className="w-4 h-4" />
                  Insert to Terminal
                </DropdownMenu.Item>
              )}
              {onInsertToScript && (
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInsertToScript();
                  }}
                >
                  <FileCode className="w-4 h-4" />
                  Insert to Script
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Item
                className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyCommand(e);
                }}
              >
                <Copy className="w-4 h-4" />
                Copy Command
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="h-px bg-border my-1" />
              <DropdownMenu.Item
                className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Edit className="w-4 h-4" />
                Edit
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* Snippet Info */}
      <div className="flex items-start gap-3 pr-16">
        <div className="p-2 rounded-lg bg-secondary text-primary">
          <Terminal className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{snippet.name}</h3>
          {snippet.description && (
            <p className="text-sm text-muted-foreground truncate mt-0.5">
              {snippet.description}
            </p>
          )}
        </div>
      </div>

      {/* Command Preview */}
      <div className="mt-3 p-2 rounded bg-secondary/50 font-mono text-xs text-muted-foreground truncate">
        {snippet.command}
      </div>

      {/* Metadata */}
      <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
        {/* Category */}
        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary">
          {snippet.category}
        </span>

        {/* Updated date */}
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDate(snippet.updated_at)}
        </span>
      </div>

      {/* Tags */}
      {snippet.tags.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          <Tag className="w-3 h-3 text-muted-foreground" />
          {snippet.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-full text-xs bg-secondary text-muted-foreground"
            >
              {tag}
            </span>
          ))}
          {snippet.tags.length > 3 && (
            <span className="text-xs text-muted-foreground">
              +{snippet.tags.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
