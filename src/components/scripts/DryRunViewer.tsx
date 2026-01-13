import { useState } from "react";
import {
  X,
  Eye,
  Server,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Terminal,
  Copy,
  Check,
  AlertCircle,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Collapsible from "@radix-ui/react-collapsible";
import { cn } from "../../lib/utils";
import { DryRunResult, DryRunServer, DryRunStep } from "../../lib/tauri";

interface DryRunViewerProps {
  /** Dry run result to display */
  result: DryRunResult | null;
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog is closed */
  onOpenChange: (open: boolean) => void;
}

/**
 * DryRunViewer component - Shows commands that will be executed
 * Requirements: 5.8
 */
export function DryRunViewer({
  result,
  open,
  onOpenChange,
}: DryRunViewerProps) {
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  // Initialize expanded state when result changes
  useState(() => {
    if (result) {
      setExpandedServers(new Set(result.servers.map((s) => s.server_id)));
    }
  });

  // Toggle server expansion
  const toggleServer = (serverId: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev);
      if (next.has(serverId)) {
        next.delete(serverId);
      } else {
        next.add(serverId);
      }
      return next;
    });
  };

  // Expand/collapse all
  const expandAll = () => {
    if (result) {
      setExpandedServers(new Set(result.servers.map((s) => s.server_id)));
    }
  };

  const collapseAll = () => {
    setExpandedServers(new Set());
  };

  // Copy command to clipboard
  const copyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(command);
      setTimeout(() => setCopiedCommand(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  // Copy all commands for a server
  const copyAllCommands = async (server: DryRunServer) => {
    const commands = server.steps
      .filter((s) => s.will_execute)
      .flatMap((s) => s.commands)
      .join("\n");
    
    try {
      await navigator.clipboard.writeText(commands);
      setCopiedCommand(`all-${server.server_id}`);
      setTimeout(() => setCopiedCommand(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  if (!result) return null;

  // Count statistics
  const totalSteps = result.total_steps;
  const executableSteps = result.servers.reduce(
    (acc, s) => acc + s.steps.filter((step) => step.will_execute).length,
    0
  );
  const skippedSteps = result.servers.reduce(
    (acc, s) => acc + s.steps.filter((step) => !step.will_execute).length,
    0
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl max-h-[85vh] bg-background border border-border rounded-lg shadow-lg z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <Eye className="w-5 h-5 text-primary" />
              <div>
                <Dialog.Title className="text-lg font-semibold">
                  Dry Run Preview
                </Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  {result.script_name}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Statistics */}
          <div className="px-6 py-3 border-b border-border bg-secondary/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6 text-sm">
                <span className="flex items-center gap-1.5">
                  <Server className="w-4 h-4" />
                  {result.servers.length} server
                  {result.servers.length !== 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1.5 text-green-500">
                  <CheckCircle className="w-4 h-4" />
                  {executableSteps} to execute
                </span>
                {skippedSteps > 0 && (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <XCircle className="w-4 h-4" />
                    {skippedSteps} skipped
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={expandAll}
                  className="text-xs text-primary hover:underline"
                >
                  Expand All
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  onClick={collapseAll}
                  className="text-xs text-primary hover:underline"
                >
                  Collapse All
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4">
            <div className="space-y-4">
              {result.servers.map((server) => (
                <ServerDryRun
                  key={server.server_id}
                  server={server}
                  isExpanded={expandedServers.has(server.server_id)}
                  onToggle={() => toggleServer(server.server_id)}
                  onCopyCommand={copyCommand}
                  onCopyAll={() => copyAllCommands(server)}
                  copiedCommand={copiedCommand}
                />
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              This is a preview only. No commands have been executed.
            </p>
            <Dialog.Close asChild>
              <button className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent">
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface ServerDryRunProps {
  server: DryRunServer;
  isExpanded: boolean;
  onToggle: () => void;
  onCopyCommand: (command: string) => void;
  onCopyAll: () => void;
  copiedCommand: string | null;
}

function ServerDryRun({
  server,
  isExpanded,
  onToggle,
  onCopyCommand,
  onCopyAll,
  copiedCommand,
}: ServerDryRunProps) {
  const executableCount = server.steps.filter((s) => s.will_execute).length;
  const skippedCount = server.steps.filter((s) => !s.will_execute).length;

  return (
    <Collapsible.Root open={isExpanded} onOpenChange={onToggle}>
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Server Header */}
        <Collapsible.Trigger asChild>
          <button className="w-full px-4 py-3 bg-secondary/50 flex items-center gap-3 hover:bg-secondary/70 transition-colors text-left">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <Server className="w-4 h-4 text-muted-foreground" />
            <span className="flex-1 font-medium">{server.server_name}</span>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-green-500">{executableCount} steps</span>
              {skippedCount > 0 && (
                <span className="text-muted-foreground">{skippedCount} skipped</span>
              )}
            </div>
          </button>
        </Collapsible.Trigger>

        <Collapsible.Content>
          {/* Copy All Button */}
          {executableCount > 0 && (
            <div className="px-4 py-2 border-b border-border bg-secondary/20">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyAll();
                }}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                {copiedCommand === `all-${server.server_id}` ? (
                  <>
                    <Check className="w-3 h-3" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy all commands
                  </>
                )}
              </button>
            </div>
          )}

          {/* Steps */}
          <div className="divide-y divide-border">
            {server.steps.map((step) => (
              <StepDryRun
                key={step.step_id}
                step={step}
                onCopyCommand={onCopyCommand}
                copiedCommand={copiedCommand}
              />
            ))}
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  );
}

interface StepDryRunProps {
  step: DryRunStep;
  onCopyCommand: (command: string) => void;
  copiedCommand: string | null;
}

function StepDryRun({ step, onCopyCommand, copiedCommand }: StepDryRunProps) {
  const [isExpanded, setIsExpanded] = useState(step.will_execute);

  return (
    <Collapsible.Root open={isExpanded} onOpenChange={setIsExpanded}>
      <Collapsible.Trigger asChild>
        <button
          className={cn(
            "w-full px-4 py-2 flex items-center gap-3 hover:bg-accent/50 transition-colors text-left",
            !step.will_execute && "opacity-60"
          )}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          {step.will_execute ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : (
            <XCircle className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="flex-1 text-sm font-medium">{step.step_name}</span>
          {step.condition && (
            <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">
              Conditional
            </span>
          )}
        </button>
      </Collapsible.Trigger>

      <Collapsible.Content>
        <div className="px-4 pb-3 space-y-2">
          {/* Skip Reason */}
          {step.skip_reason && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="w-4 h-4" />
              <span>Skip reason: {step.skip_reason}</span>
            </div>
          )}

          {/* Condition */}
          {step.condition && (
            <div className="text-sm">
              <span className="text-muted-foreground">Condition: </span>
              <code className="px-1.5 py-0.5 rounded bg-secondary text-xs">
                {step.condition}
              </code>
              {step.condition_result !== null && (
                <span
                  className={cn(
                    "ml-2 text-xs",
                    step.condition_result ? "text-green-500" : "text-destructive"
                  )}
                >
                  ({step.condition_result ? "true" : "false"})
                </span>
              )}
            </div>
          )}

          {/* Working Directory */}
          {step.working_dir && (
            <div className="text-sm">
              <span className="text-muted-foreground">Working dir: </span>
              <code className="px-1.5 py-0.5 rounded bg-secondary text-xs">
                {step.working_dir}
              </code>
            </div>
          )}

          {/* Commands */}
          <div className="space-y-1">
            <span className="text-sm text-muted-foreground">Commands:</span>
            {step.commands.map((command, index) => (
              <div
                key={index}
                className="group flex items-start gap-2 p-2 rounded bg-zinc-900"
              >
                <Terminal className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
                <code className="flex-1 text-xs text-zinc-100 font-mono break-all">
                  {command}
                </code>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopyCommand(command);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-700 transition-opacity"
                  title="Copy command"
                >
                  {copiedCommand === command ? (
                    <Check className="w-3 h-3 text-green-500" />
                  ) : (
                    <Copy className="w-3 h-3 text-zinc-400" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

// ============================================================================
// Inline Dry Run Preview (for use in wizard)
// ============================================================================

interface InlineDryRunPreviewProps {
  result: DryRunResult;
  className?: string;
}

export function InlineDryRunPreview({ result, className }: InlineDryRunPreviewProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {result.servers.map((server) => (
        <div key={server.server_id} className="text-sm">
          <div className="font-medium text-muted-foreground mb-1">
            {server.server_name}
          </div>
          <div className="space-y-1 ml-4">
            {server.steps.map((step) => (
              <div
                key={step.step_id}
                className={cn(
                  "flex items-center gap-2",
                  !step.will_execute && "opacity-50"
                )}
              >
                {step.will_execute ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <XCircle className="w-3 h-3 text-muted-foreground" />
                )}
                <span>{step.step_name}</span>
                {step.skip_reason && (
                  <span className="text-xs text-muted-foreground">
                    ({step.skip_reason})
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
