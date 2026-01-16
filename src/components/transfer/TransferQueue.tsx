import { useEffect, useState } from "react";
import {
  X,
  Upload,
  Download,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  ChevronDown,
  ChevronRight,
  Trash2,
  AlertCircle,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Collapsible from "@radix-ui/react-collapsible";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import {
  TransferStatus,
  TransferState,
  phase4EventApi,
  TransferProgressPayload,
  TransferCompletedPayload,
} from "../../lib/tauri";

interface TransferQueueProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog is closed */
  onOpenChange: (open: boolean) => void;
}

/**
 * TransferQueue component - Shows list of queued/active transfers
 * - Progress bars, speed, ETA
 * - Cancel button
 * Requirements: 3.3, 3.5, 3.6
 */
export function TransferQueue({ open, onOpenChange }: TransferQueueProps) {
  const transfers = useAppStore((state) => state.transfers);
  const cancelTransfer = useAppStore((state) => state.cancelTransfer);
  const updateTransferStatus = useAppStore((state) => state.updateTransferStatus);
  const removeTransfer = useAppStore((state) => state.removeTransfer);
  const showError = useAppStore((state) => state.showError);

  const [expandedTransfers, setExpandedTransfers] = useState<Set<string>>(new Set());

  // Subscribe to transfer events
  useEffect(() => {
    if (!open) return;

    let unsubProgress: (() => void) | null = null;
    let unsubCompleted: (() => void) | null = null;

    const setupListeners = async () => {
      unsubProgress = await phase4EventApi.onTransferProgress((payload: TransferProgressPayload) => {
        // Update transfer progress in store
        const transfer = transfers.find((t) => t.id === payload.transfer_id);
        if (transfer) {
          updateTransferStatus({
            ...transfer,
            bytes_transferred: payload.bytes_transferred,
            total_bytes: payload.total_bytes,
            speed_bps: payload.speed_bps,
            eta_seconds: payload.eta_seconds,
            state: "in_progress",
          });
        }
      });

      unsubCompleted = await phase4EventApi.onTransferCompleted((payload: TransferCompletedPayload) => {
        const transfer = transfers.find((t) => t.id === payload.transfer_id);
        if (transfer) {
          updateTransferStatus({
            ...transfer,
            state: payload.success ? "completed" : { failed: payload.error || "Unknown error" },
            bytes_transferred: payload.success ? transfer.total_bytes : transfer.bytes_transferred,
          });
        }
      });
    };

    setupListeners();

    return () => {
      unsubProgress?.();
      unsubCompleted?.();
    };
  }, [open, transfers, updateTransferStatus]);

  // Toggle transfer expansion
  const toggleTransfer = (transferId: string) => {
    setExpandedTransfers((prev) => {
      const next = new Set(prev);
      if (next.has(transferId)) {
        next.delete(transferId);
      } else {
        next.add(transferId);
      }
      return next;
    });
  };

  // Handle cancel transfer
  const handleCancel = async (transferId: string) => {
    try {
      await cancelTransfer(transferId);
    } catch (error) {
      showError("Failed to cancel transfer", error instanceof Error ? error.message : String(error));
    }
  };

  // Handle remove completed/failed transfer
  const handleRemove = (transferId: string) => {
    removeTransfer(transferId);
  };

  // Clear all completed transfers
  const handleClearCompleted = () => {
    transfers
      .filter((t) => isCompleted(t.state) || isFailed(t.state) || isCancelled(t.state))
      .forEach((t) => removeTransfer(t.id));
  };

  // Categorize transfers
  const activeTransfers = transfers.filter((t) => isActive(t.state));
  const queuedTransfers = transfers.filter((t) => isQueued(t.state));
  const completedTransfers = transfers.filter((t) => isCompleted(t.state) || isFailed(t.state) || isCancelled(t.state));

  const hasCompletedTransfers = completedTransfers.length > 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[80vh] bg-background border border-border rounded-lg shadow-lg z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <Dialog.Title className="text-lg font-semibold">
                File Transfers
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                {transfers.length === 0
                  ? "No transfers"
                  : `${activeTransfers.length} active, ${queuedTransfers.length} queued`}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Summary Bar */}
          <TransferSummaryBar
            active={activeTransfers.length}
            queued={queuedTransfers.length}
            completed={completedTransfers.filter((t) => isCompleted(t.state)).length}
            failed={completedTransfers.filter((t) => isFailed(t.state)).length}
          />

          {/* Transfer List */}
          <div className="flex-1 overflow-auto p-4">
            {transfers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                <Upload className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">No transfers</p>
                <p className="text-sm">Drag and drop files to start transferring</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Active Transfers */}
                {activeTransfers.length > 0 && (
                  <TransferSection title="Active" count={activeTransfers.length}>
                    {activeTransfers.map((transfer) => (
                      <TransferItem
                        key={transfer.id}
                        transfer={transfer}
                        isExpanded={expandedTransfers.has(transfer.id)}
                        onToggle={() => toggleTransfer(transfer.id)}
                        onCancel={() => handleCancel(transfer.id)}
                      />
                    ))}
                  </TransferSection>
                )}

                {/* Queued Transfers */}
                {queuedTransfers.length > 0 && (
                  <TransferSection title="Queued" count={queuedTransfers.length}>
                    {queuedTransfers.map((transfer) => (
                      <TransferItem
                        key={transfer.id}
                        transfer={transfer}
                        isExpanded={expandedTransfers.has(transfer.id)}
                        onToggle={() => toggleTransfer(transfer.id)}
                        onCancel={() => handleCancel(transfer.id)}
                      />
                    ))}
                  </TransferSection>
                )}

                {/* Completed Transfers */}
                {completedTransfers.length > 0 && (
                  <TransferSection title="Completed" count={completedTransfers.length}>
                    {completedTransfers.map((transfer) => (
                      <TransferItem
                        key={transfer.id}
                        transfer={transfer}
                        isExpanded={expandedTransfers.has(transfer.id)}
                        onToggle={() => toggleTransfer(transfer.id)}
                        onRemove={() => handleRemove(transfer.id)}
                      />
                    ))}
                  </TransferSection>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            {hasCompletedTransfers && (
              <button
                onClick={handleClearCompleted}
                className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent"
              >
                Clear completed
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={() => onOpenChange(false)}
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


// Helper functions for transfer state
function isQueued(state: TransferState): boolean {
  return state === "queued";
}

function isActive(state: TransferState): boolean {
  return state === "in_progress";
}

function isCompleted(state: TransferState): boolean {
  return state === "completed";
}

function isFailed(state: TransferState): boolean {
  return typeof state === "object" && "failed" in state;
}

function isCancelled(state: TransferState): boolean {
  return state === "cancelled";
}

function getErrorMessage(state: TransferState): string | null {
  if (typeof state === "object" && "failed" in state) {
    return state.failed;
  }
  return null;
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Format speed
function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

// Format ETA
function formatEta(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "--";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

// Transfer Summary Bar
interface TransferSummaryBarProps {
  active: number;
  queued: number;
  completed: number;
  failed: number;
}

function TransferSummaryBar({ active, queued, completed, failed }: TransferSummaryBarProps) {
  return (
    <div className="flex items-center gap-4 px-6 py-3 bg-muted/50 border-b border-border text-sm">
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
        <span>{active} active</span>
      </div>
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <span>{queued} queued</span>
      </div>
      <div className="flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-green-500" />
        <span>{completed} completed</span>
      </div>
      {failed > 0 && (
        <div className="flex items-center gap-2">
          <XCircle className="w-4 h-4 text-red-500" />
          <span>{failed} failed</span>
        </div>
      )}
    </div>
  );
}

// Transfer Section
interface TransferSectionProps {
  title: string;
  count: number;
  children: React.ReactNode;
}

function TransferSection({ title, count, children }: TransferSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen} className="mb-4">
      <Collapsible.Trigger className="flex items-center gap-2 w-full text-left py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {title} ({count})
      </Collapsible.Trigger>
      <Collapsible.Content className="space-y-2 mt-2">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

// Transfer Item
interface TransferItemProps {
  transfer: TransferStatus;
  isExpanded: boolean;
  onToggle: () => void;
  onCancel?: () => void;
  onRemove?: () => void;
}

function TransferItem({ transfer, isExpanded, onToggle, onCancel, onRemove }: TransferItemProps) {
  const progress = transfer.total_bytes > 0
    ? Math.round((transfer.bytes_transferred / transfer.total_bytes) * 100)
    : 0;

  const isUploading = transfer.direction === "upload";
  const stateIcon = getStateIcon(transfer.state);
  const errorMessage = getErrorMessage(transfer.state);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Main Row */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/50"
        onClick={onToggle}
      >
        {/* Direction Icon */}
        <div className={cn(
          "p-2 rounded-lg",
          isUploading ? "bg-blue-500/10 text-blue-500" : "bg-green-500/10 text-green-500"
        )}>
          {isUploading ? <Upload className="w-4 h-4" /> : <Download className="w-4 h-4" />}
        </div>

        {/* File Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{transfer.file_name}</span>
            {stateIcon}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {isUploading ? "Upload to" : "Download from"} server
          </div>
        </div>

        {/* Progress/Status */}
        <div className="text-right text-sm">
          {isActive(transfer.state) ? (
            <>
              <div className="font-medium">{progress}%</div>
              <div className="text-xs text-muted-foreground">
                {formatSpeed(transfer.speed_bps)}
              </div>
            </>
          ) : isQueued(transfer.state) ? (
            <div className="text-muted-foreground">Waiting...</div>
          ) : isCompleted(transfer.state) ? (
            <div className="text-green-500">Complete</div>
          ) : isFailed(transfer.state) ? (
            <div className="text-red-500">Failed</div>
          ) : isCancelled(transfer.state) ? (
            <div className="text-muted-foreground">Cancelled</div>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {(isActive(transfer.state) || isQueued(transfer.state)) && onCancel && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              title="Cancel transfer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {(isCompleted(transfer.state) || isFailed(transfer.state) || isCancelled(transfer.state)) && onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="p-1.5 rounded hover:bg-secondary text-muted-foreground"
              title="Remove from list"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </div>

      {/* Progress Bar (for active transfers) */}
      {isActive(transfer.state) && (
        <div className="px-3 pb-3">
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border bg-muted/30">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Local path:</span>
              <div className="truncate font-mono text-xs">{transfer.local_path}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Remote path:</span>
              <div className="truncate font-mono text-xs">{transfer.remote_path}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Size:</span>
              <div>{formatBytes(transfer.total_bytes)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Transferred:</span>
              <div>{formatBytes(transfer.bytes_transferred)}</div>
            </div>
            {isActive(transfer.state) && (
              <>
                <div>
                  <span className="text-muted-foreground">Speed:</span>
                  <div>{formatSpeed(transfer.speed_bps)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">ETA:</span>
                  <div>{formatEta(transfer.eta_seconds)}</div>
                </div>
              </>
            )}
            {errorMessage && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Error:</span>
                <div className="text-red-500 text-xs">{errorMessage}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Get state icon
function getStateIcon(state: TransferState): React.ReactNode {
  if (isActive(state)) {
    return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
  }
  if (isQueued(state)) {
    return <Clock className="w-4 h-4 text-muted-foreground" />;
  }
  if (isCompleted(state)) {
    return <CheckCircle className="w-4 h-4 text-green-500" />;
  }
  if (isFailed(state)) {
    return <AlertCircle className="w-4 h-4 text-red-500" />;
  }
  if (isCancelled(state)) {
    return <XCircle className="w-4 h-4 text-muted-foreground" />;
  }
  return null;
}

export default TransferQueue;
