import { useState, useCallback } from "react";
import { Lock } from "lucide-react";

interface SudoPasswordDialogProps {
  isOpen: boolean;
  serverName: string;
  onSubmit: (password: string) => void;
  onCancel: () => void;
  error?: string | null;
  isLoading?: boolean;
}

/**
 * Dialog to prompt user for sudo password when required
 */
export function SudoPasswordDialog({
  isOpen,
  serverName,
  onSubmit,
  onCancel,
  error,
  isLoading = false,
}: SudoPasswordDialogProps) {
  const [password, setPassword] = useState("");

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) {
      onSubmit(password);
    }
  }, [password, onSubmit]);

  const handleClose = useCallback(() => {
    setPassword("");
    onCancel();
  }, [onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
            <Lock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Sudo Password Required</h3>
            <p className="text-sm text-muted-foreground">{serverName}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          This operation requires elevated privileges. Please enter your sudo password.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="sudo-password" className="block text-sm font-medium mb-2">
              Password
            </label>
            <input
              id="sudo-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter sudo password"
              autoFocus
              disabled={isLoading}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-md border border-border hover:bg-secondary transition-colors text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!password.trim() || isLoading}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm disabled:opacity-50"
            >
              {isLoading ? "Authenticating..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
