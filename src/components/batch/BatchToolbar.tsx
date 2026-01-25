import { useState } from "react";
import {
  Play,
  Heart,
  Terminal,
  Loader2,
  X,
  ChevronDown,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import { Server } from "../../lib/tauri";
import { parseError } from "../../lib/errorHandler";

interface BatchToolbarProps {
  /** Selected server IDs */
  selectedServerIds: string[];
  /** Callback to clear selection */
  onClearSelection: () => void;
  /** Callback when batch operation completes */
  onBatchComplete?: () => void;
}

/**
 * BatchToolbar component - Appears when multiple servers are selected
 * - Execute command on all selected servers
 * - Health check all selected servers
 * Requirements: 2.1
 */
export function BatchToolbar({
  selectedServerIds,
  onClearSelection,
  onBatchComplete,
}: BatchToolbarProps) {
  const servers = useAppStore((state) => state.servers);
  const isExecutingBatch = useAppStore((state) => state.isExecutingBatch);
  const executeBatchCommand = useAppStore((state) => state.executeBatchCommand);
  const executeBatchHealthCheck = useAppStore((state) => state.executeBatchHealthCheck);
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [isCommandDialogOpen, setIsCommandDialogOpen] = useState(false);
  const [command, setCommand] = useState("");

  // Get selected server objects
  const selectedServers = servers.filter((s) => selectedServerIds.includes(s.id));

  // Handle execute command
  const handleExecuteCommand = async () => {
    if (!command.trim()) return;

    try {
      const results = await executeBatchCommand(selectedServerIds, command);
      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.length - successCount;

      if (failureCount === 0) {
        showSuccess(
          "Batch command completed",
          `Successfully executed on ${successCount} server(s)`
        );
      } else {
        showError(
          "Batch command completed with errors",
          `${successCount} succeeded, ${failureCount} failed`
        );
      }

      setIsCommandDialogOpen(false);
      setCommand("");
      onBatchComplete?.();
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    }
  };

  // Handle health check
  const handleHealthCheck = async () => {
    try {
      const results = await executeBatchHealthCheck(selectedServerIds);
      const onlineCount = results.filter((r) => r.connected).length;
      const offlineCount = results.length - onlineCount;

      if (offlineCount === 0) {
        showSuccess(
          "Health check completed",
          `All ${onlineCount} server(s) are online`
        );
      } else {
        showError(
          "Health check completed",
          `${onlineCount} online, ${offlineCount} offline`
        );
      }

      onBatchComplete?.();
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    }
  };

  if (selectedServerIds.length < 2) {
    return null;
  }

  return (
    <>
      {/* Floating Toolbar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        <div className="flex items-center gap-2 px-4 py-3 bg-background border border-border rounded-lg shadow-lg">
          {/* Selection Info */}
          <div className="flex items-center gap-2 pr-3 border-r border-border">
            <span className="text-sm font-medium">
              {selectedServerIds.length} servers selected
            </span>
            <button
              onClick={onClearSelection}
              className="p-1 rounded hover:bg-secondary"
              title="Clear selection"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Execute Command Button */}
            <button
              onClick={() => setIsCommandDialogOpen(true)}
              disabled={isExecutingBatch}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isExecutingBatch ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Terminal className="w-4 h-4" />
              )}
              Execute Command
            </button>

            {/* Health Check Button */}
            <button
              onClick={handleHealthCheck}
              disabled={isExecutingBatch}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                "border border-border hover:bg-accent",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isExecutingBatch ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Heart className="w-4 h-4" />
              )}
              Health Check
            </button>

            {/* More Actions Dropdown */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  disabled={isExecutingBatch}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1.5 rounded-md text-sm transition-colors",
                    "border border-border hover:bg-accent",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="min-w-[160px] bg-popover border border-border rounded-md p-1 shadow-md z-50"
                  sideOffset={5}
                >
                  <DropdownMenu.Item
                    className="flex items-center px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                    onClick={() => setIsCommandDialogOpen(true)}
                  >
                    <Terminal className="w-4 h-4 mr-2" />
                    Execute Command
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="flex items-center px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                    onClick={handleHealthCheck}
                  >
                    <Heart className="w-4 h-4 mr-2" />
                    Health Check
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </div>

      {/* Command Dialog */}
      <CommandDialog
        open={isCommandDialogOpen}
        onOpenChange={setIsCommandDialogOpen}
        selectedServers={selectedServers}
        command={command}
        onCommandChange={setCommand}
        onExecute={handleExecuteCommand}
        isExecuting={isExecutingBatch}
      />
    </>
  );
}


// ============================================================================
// Command Dialog Sub-component
// ============================================================================

interface CommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedServers: Server[];
  command: string;
  onCommandChange: (command: string) => void;
  onExecute: () => void;
  isExecuting: boolean;
}

function CommandDialog({
  open,
  onOpenChange,
  selectedServers,
  command,
  onCommandChange,
  onExecute,
  isExecuting,
}: CommandDialogProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onExecute();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-background border border-border rounded-lg shadow-lg z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <Dialog.Title className="text-lg font-semibold">
                Execute Batch Command
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                Run a command on {selectedServers.length} selected server(s)
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-4">
            {/* Selected Servers Preview */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Target Servers
              </label>
              <div className="flex flex-wrap gap-2">
                {selectedServers.slice(0, 5).map((server) => (
                  <span
                    key={server.id}
                    className="px-2 py-1 text-xs rounded-full bg-secondary"
                  >
                    {server.name}
                  </span>
                ))}
                {selectedServers.length > 5 && (
                  <span className="px-2 py-1 text-xs rounded-full bg-secondary text-muted-foreground">
                    +{selectedServers.length - 5} more
                  </span>
                )}
              </div>
            </div>

            {/* Command Input */}
            <div>
              <label htmlFor="batch-command" className="text-sm font-medium mb-2 block">
                Command
              </label>
              <textarea
                id="batch-command"
                value={command}
                onChange={(e) => onCommandChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter command to execute..."
                className={cn(
                  "w-full h-24 px-3 py-2 rounded-md border border-border bg-background",
                  "font-mono text-sm resize-none",
                  "focus:outline-none focus:ring-2 focus:ring-primary/50"
                )}
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">
                Press Ctrl+Enter to execute
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
            <Dialog.Close asChild>
              <button className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent">
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={onExecute}
              disabled={!command.trim() || isExecuting}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isExecuting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Execute
                </>
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
