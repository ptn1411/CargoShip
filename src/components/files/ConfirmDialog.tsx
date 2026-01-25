import { AlertTriangle, X } from "lucide-react";
import { cn } from "../../lib/utils";

export interface ConfirmDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Dialog title */
  title: string;
  /** Dialog message */
  message: string;
  /** Additional details (e.g., file path) */
  details?: string;
  /** Confirm button text */
  confirmText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Whether the action is destructive */
  isDestructive?: boolean;
  /** Whether the operation is in progress */
  isLoading?: boolean;
  /** Callback when confirmed */
  onConfirm: () => void;
  /** Callback when cancelled/closed */
  onCancel: () => void;
}

/**
 * Confirmation dialog for destructive operations
 * Used for: Delete file/folder confirmation
 * 
 * Requirements: 4.3
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  details,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = false,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCancel();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        className={cn(
          "relative bg-background border border-border rounded-lg shadow-xl",
          "max-w-md w-full mx-4 animate-in fade-in zoom-in-95 duration-200"
        )}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          {isDestructive && (
            <div className="p-2 rounded-full bg-destructive/10">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-secondary transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          <p className="text-sm text-muted-foreground">{message}</p>
          {details && (
            <div className="p-3 bg-secondary/50 rounded-lg">
              <p className="text-sm font-mono text-foreground break-all">
                {details}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-border bg-secondary/30">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className={cn(
              "px-4 py-2 text-sm rounded-lg",
              "bg-secondary hover:bg-secondary/80 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              "px-4 py-2 text-sm rounded-lg transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              isDestructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {isLoading ? "Processing..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
