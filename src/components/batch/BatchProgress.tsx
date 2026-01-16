import { useEffect, useState } from "react";
import {
  X,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Server,
  Clock,
  Wifi,
  WifiOff,
  Copy,
  Check,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Collapsible from "@radix-ui/react-collapsible";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import {
  BatchResult,
  HealthCheckResult,
  BatchSummary,
  HealthCheckSummary,
  phase4EventApi,
  BatchProgressPayload,
} from "../../lib/tauri";

interface BatchProgressProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog is closed */
  onOpenChange: (open: boolean) => void;
  /** Type of batch operation */
  type: "command" | "healthcheck";
}

/**
 * BatchProgress component - Shows progress and results of batch operations
 * - Progress for each server
 * - Summary with success/failure counts
 * Requirements: 2.3, 2.5
 */
export function BatchProgress({ open, onOpenChange, type }: BatchProgressProps) {
  const batchResults = useAppStore((state) => state.batchResults);
  const batchSummary = useAppStore((state) => state.batchSummary);
  const healthCheckResults = useAppStore((state) => state.healthCheckResults);
  const healthCheckSummary = useAppStore((state) => state.healthCheckSummary);
  const isExecutingBatch = useAppStore((state) => state.isExecutingBatch);
  const clearBatchResults = useAppStore((state) => state.clearBatchResults);

  const [progress, setProgress] = useState<BatchProgressPayload | null>(null);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

  // Subscribe to batch progress events
  useEffect(() => {
    if (!open || !isExecutingBatch) return;

    let unsubscribe: (() => void) | null = null;

    const setupListener = async () => {
      unsubscribe = await phase4EventApi.onBatchProgress((payload) => {
        setProgress(payload);
      });
    };

    setupListener();

    return () => {
      unsubscribe?.();
    };
  }, [open, isExecutingBatch]);

  // Reset progress when dialog closes
  useEffect(() => {
    if (!open) {
      setProgress(null);
    }
  }, [open]);

  // Expand all servers by default when results arrive
  useEffect(() => {
    const results = type === "command" ? batchResults : healthCheckResults;
    if (results.length > 0) {
      setExpandedServers(new Set(results.map((r) => r.server_id)));
    }
  }, [batchResults, healthCheckResults, type]);

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

  // Handle close
  const handleClose = () => {
    onOpenChange(false);
    // Clear results after a short delay to allow animation
    setTimeout(() => {
      clearBatchResults();
    }, 200);
  };

  const results = type === "command" ? batchResults : healthCheckResults;
  const summary = type === "command" ? batchSummary : healthCheckSummary;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[80vh] bg-background border border-border rounded-lg shadow-lg z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <Dialog.Title className="text-lg font-semibold">
                {type === "command" ? "Batch Command Results" : "Health Check Results"}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                {isExecutingBatch
                  ? "Operation in progress..."
                  : `Completed on ${results.length} server(s)`}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Summary Bar */}
          {summary && (
            <BatchSummaryBar
              summary={summary}
              type={type}
              isExecuting={isExecutingBatch}
              progress={progress}
            />
          )}

          {/* Results Content */}
          <div className="flex-1 overflow-auto p-4">
            {isExecutingBatch && results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin mb-3" />
                <p>
                  {progress
                    ? `Processing ${progress.current_server}...`
                    : "Starting batch operation..."}
                </p>
                {progress && (
                  <p className="text-sm mt-1">
                    {progress.completed} / {progress.total} completed
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {type === "command"
                  ? (results as BatchResult[]).map((result) => (
                      <BatchResultItem
                        key={result.server_id}
                        result={result}
                        isExpanded={expandedServers.has(result.server_id)}
                        onToggle={() => toggleServer(result.server_id)}
                      />
                    ))
                  : (results as HealthCheckResult[]).map((result) => (
                      <HealthCheckResultItem
                        key={result.server_id}
                        result={result}
                        isExpanded={expandedServers.has(result.server_id)}
                        onToggle={() => toggleServer(result.server_id)}
                      />
                    ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-6 py-4 border-t border-border">
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
            >
              Close
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}


// ============================================================================
// Summary Bar Sub-component
// ============================================================================

interface BatchSummaryBarProps {
  summary: BatchSummary | HealthCheckSummary;
  type: "command" | "healthcheck";
  isExecuting: boolean;
  progress: BatchProgressPayload | null;
}

function BatchSummaryBar({ summary, type, isExecuting, progress }: BatchSummaryBarProps) {
  const isBatchSummary = type === "command";
  const successCount = isBatchSummary
    ? (summary as BatchSummary).success_count
    : (summary as HealthCheckSummary).online_count;
  const failureCount = isBatchSummary
    ? (summary as BatchSummary).failure_count
    : (summary as HealthCheckSummary).offline_count;
  const total = summary.total;

  const progressPercent = isExecuting && progress
    ? (progress.completed / progress.total) * 100
    : 100;

  return (
    <div className="px-6 py-3 border-b border-border bg-secondary/30">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <Server className="w-4 h-4" />
            {total} server{total !== 1 ? "s" : ""}
          </span>
          {!isExecuting && (
            <>
              <span className="flex items-center gap-1.5 text-green-500">
                <CheckCircle className="w-4 h-4" />
                {successCount} {isBatchSummary ? "succeeded" : "online"}
              </span>
              {failureCount > 0 && (
                <span className="flex items-center gap-1.5 text-destructive">
                  <XCircle className="w-4 h-4" />
                  {failureCount} {isBatchSummary ? "failed" : "offline"}
                </span>
              )}
            </>
          )}
        </div>
        {isExecuting && progress && (
          <span className="text-sm text-muted-foreground">
            {progress.completed} / {progress.total}
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className={cn(
            "h-full transition-all duration-300",
            isExecuting
              ? "bg-primary"
              : failureCount === 0
              ? "bg-green-500"
              : failureCount === total
              ? "bg-destructive"
              : "bg-yellow-500"
          )}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Batch Result Item Sub-component
// ============================================================================

interface BatchResultItemProps {
  result: BatchResult;
  isExpanded: boolean;
  onToggle: () => void;
}

function BatchResultItem({ result, isExpanded, onToggle }: BatchResultItemProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyOutput = async () => {
    const text = result.output || result.error || "";
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Collapsible.Root open={isExpanded} onOpenChange={onToggle}>
      <div className="rounded-lg border border-border overflow-hidden">
        <Collapsible.Trigger asChild>
          <button className="w-full px-4 py-3 flex items-center gap-3 hover:bg-accent/50 transition-colors text-left">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            {result.success ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-destructive" />
            )}
            <div className="flex-1 min-w-0">
              <span className="font-medium">{result.server_name}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              {result.duration_ms}ms
            </div>
          </button>
        </Collapsible.Trigger>

        <Collapsible.Content>
          <div className="px-4 pb-3 pt-1">
            <div className="relative">
              <pre
                className={cn(
                  "p-3 rounded-md text-xs font-mono overflow-auto max-h-48",
                  "whitespace-pre-wrap break-all",
                  result.success
                    ? "bg-zinc-900 text-zinc-100"
                    : "bg-destructive/10 text-destructive"
                )}
              >
                {result.output || result.error || "No output"}
              </pre>
              {(result.output || result.error) && (
                <button
                  onClick={handleCopyOutput}
                  className="absolute top-2 right-2 p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors"
                  title="Copy output"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                </button>
              )}
            </div>
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  );
}

// ============================================================================
// Health Check Result Item Sub-component
// ============================================================================

interface HealthCheckResultItemProps {
  result: HealthCheckResult;
  isExpanded: boolean;
  onToggle: () => void;
}

function HealthCheckResultItem({ result, isExpanded, onToggle }: HealthCheckResultItemProps) {
  return (
    <Collapsible.Root open={isExpanded} onOpenChange={onToggle}>
      <div className="rounded-lg border border-border overflow-hidden">
        <Collapsible.Trigger asChild>
          <button className="w-full px-4 py-3 flex items-center gap-3 hover:bg-accent/50 transition-colors text-left">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            {result.connected ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-destructive" />
            )}
            <div className="flex-1 min-w-0">
              <span className="font-medium">{result.server_name}</span>
            </div>
            <div className="flex items-center gap-3">
              {result.latency_ms !== null && result.latency_ms !== undefined && (
                <span className="text-sm text-muted-foreground">
                  {result.latency_ms}ms
                </span>
              )}
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-medium",
                  result.connected
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                )}
              >
                {result.connected ? "Online" : "Offline"}
              </span>
            </div>
          </button>
        </Collapsible.Trigger>

        <Collapsible.Content>
          <div className="px-4 pb-3 pt-1">
            {result.error ? (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {result.error}
              </div>
            ) : (
              <div className="p-3 rounded-md bg-secondary text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground">Status:</span>{" "}
                    <span className={result.connected ? "text-green-500" : "text-destructive"}>
                      {result.connected ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                  {result.latency_ms !== null && result.latency_ms !== undefined && (
                    <div>
                      <span className="text-muted-foreground">Latency:</span>{" "}
                      <span>{result.latency_ms}ms</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  );
}

// ============================================================================
// Compact Progress Indicator (for use in other components)
// ============================================================================

interface BatchProgressIndicatorProps {
  /** Whether batch operation is running */
  isExecuting: boolean;
  /** Progress payload */
  progress: BatchProgressPayload | null;
  /** Click handler */
  onClick?: () => void;
}

export function BatchProgressIndicator({
  isExecuting,
  progress,
  onClick,
}: BatchProgressIndicatorProps) {
  if (!isExecuting) return null;

  const progressPercent = progress
    ? (progress.completed / progress.total) * 100
    : 0;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 rounded-md border border-border hover:bg-accent transition-colors w-full text-left"
    >
      <Loader2 className="w-4 h-4 animate-spin text-primary" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {progress?.current_server || "Batch Operation"}
        </div>
        <div className="text-xs text-muted-foreground">
          {progress ? `${progress.completed}/${progress.total} servers` : "Starting..."}
        </div>
      </div>
      <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </button>
  );
}
