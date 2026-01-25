import { useState } from "react";
import { AlertTriangle, FileText, GitCompare, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { ConflictInfo, useEditorActions, useAppStore } from "../../store";
import { ConflictResolution } from "../../lib/tauri";

interface ConflictDialogProps {
  /** The conflict information */
  conflict: ConflictInfo;
  /** File ID for the conflicted file */
  fileId: string;
  /** Callback when user wants to view diff */
  onViewDiff: () => void;
  /** Callback when dialog is closed */
  onClose: () => void;
}

/**
 * Conflict resolution dialog component
 * Shows conflict warning and provides options: Keep Local, Use Remote, View Diff
 * 
 * Requirements: 2.5, 6.3
 */
export function ConflictDialog({
  conflict,
  fileId,
  onViewDiff,
  onClose,
}: ConflictDialogProps) {
  const [isResolving, setIsResolving] = useState(false);
  const { resolveConflict, clearConflict } = useEditorActions();
  const showError = useAppStore((state) => state.showError);

  // Extract filename from path
  const fileName = conflict.remotePath.split("/").pop() || conflict.remotePath;

  // Format timestamp for display
  const formatTime = (timestamp: number | undefined) => {
    if (!timestamp) return "Unknown";
    return new Date(timestamp * 1000).toLocaleString();
  };

  const handleResolve = async (resolution: ConflictResolution) => {
    setIsResolving(true);
    try {
      await resolveConflict(fileId, resolution);
      onClose();
    } catch (error) {
      showError(
        "Failed to resolve conflict",
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setIsResolving(false);
    }
  };

  const handleKeepLocal = () => handleResolve("keep_local");
  const handleUseRemote = () => handleResolve("use_remote");

  const handleViewDiff = () => {
    onViewDiff();
  };

  const handleDismiss = () => {
    clearConflict(fileId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleDismiss}
      />
      
      {/* Dialog */}
      <div className="relative bg-background border border-border rounded-lg shadow-xl max-w-md w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="p-2 rounded-full bg-amber-500/10">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-foreground">
              File Conflict Detected
            </h2>
            <p className="text-sm text-muted-foreground truncate" title={conflict.remotePath}>
              {fileName}
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 rounded hover:bg-secondary transition-colors"
            title="Dismiss"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            This file has been modified on the remote server while you were editing it.
            Choose how to resolve this conflict:
          </p>

          {/* Conflict details */}
          {conflict.status.type === "remote_modified" && (
            <div className="bg-secondary/50 rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Local version:</span>
                <span className="font-mono">
                  {formatTime(conflict.status.local_time)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Remote version:</span>
                <span className="font-mono text-amber-500">
                  {formatTime(conflict.status.remote_time)}
                </span>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-2">
            {/* Keep Local */}
            <button
              onClick={handleKeepLocal}
              disabled={isResolving}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg border border-border",
                "hover:bg-secondary/50 transition-colors text-left",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <FileText className="w-5 h-5 text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">Keep Local Changes</p>
                <p className="text-xs text-muted-foreground">
                  Overwrite the remote file with your local version
                </p>
              </div>
            </button>

            {/* Use Remote */}
            <button
              onClick={handleUseRemote}
              disabled={isResolving}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg border border-border",
                "hover:bg-secondary/50 transition-colors text-left",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <FileText className="w-5 h-5 text-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">Use Remote Version</p>
                <p className="text-xs text-muted-foreground">
                  Discard your local changes and use the server version
                </p>
              </div>
            </button>

            {/* View Diff */}
            <button
              onClick={handleViewDiff}
              disabled={isResolving}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg border border-border",
                "hover:bg-secondary/50 transition-colors text-left",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <GitCompare className="w-5 h-5 text-purple-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">View Diff</p>
                <p className="text-xs text-muted-foreground">
                  Compare local and remote versions side by side
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-border bg-secondary/30">
          <button
            onClick={handleDismiss}
            disabled={isResolving}
            className={cn(
              "px-4 py-2 text-sm rounded-lg",
              "bg-secondary hover:bg-secondary/80 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
