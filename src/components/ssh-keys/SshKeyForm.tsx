import { Eye, EyeOff, Key, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CreateSshKeyInput, SshKey } from "../../lib/tauri";
import { cn } from "../../lib/utils";

interface SshKeyFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sshKey?: SshKey | null;
  onSubmit: (
    input: CreateSshKeyInput | { name?: string; comment?: string },
  ) => Promise<void>;
}

export function SshKeyForm({
  open,
  onOpenChange,
  sshKey,
  onSubmit,
}: SshKeyFormProps) {
  const isEditing = !!sshKey;

  const [name, setName] = useState(sshKey?.name || "");
  const [keyType, setKeyType] = useState<"ed25519" | "rsa">("ed25519");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [comment, setComment] = useState(sshKey?.comment || "");
  const [bits, setBits] = useState(4096);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSubmitting) {
      setElapsedTime(0);
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSubmitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (!isEditing && passphrase && passphrase !== confirmPassphrase) {
      setError("Passphrases do not match");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing) {
        await onSubmit({
          name: name.trim(),
          comment: comment.trim() || undefined,
        });
      } else {
        const input: CreateSshKeyInput = {
          name: name.trim(),
          key_type: keyType,
          passphrase: passphrase || undefined,
          comment: comment.trim() || undefined,
          bits: keyType === "rsa" ? bits : undefined,
        };
        await onSubmit(input);
      }
      onOpenChange(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setName("");
    setKeyType("ed25519");
    setPassphrase("");
    setConfirmPassphrase("");
    setComment("");
    setBits(4096);
    setError(null);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative bg-background text-foreground border border-border rounded-lg shadow-lg w-full max-w-md mx-4 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">
              {isEditing ? "Edit SSH Key" : "Generate SSH Key"}
            </h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 rounded-md hover:bg-accent">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., My Server Key"
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>

          {!isEditing && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Key Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setKeyType("ed25519")}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-md border text-sm transition-colors",
                      keyType === "ed25519"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input hover:bg-accent",
                    )}>
                    Ed25519 (Recommended)
                  </button>
                  <button
                    type="button"
                    onClick={() => setKeyType("rsa")}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-md border text-sm transition-colors",
                      keyType === "rsa"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input hover:bg-accent",
                    )}>
                    RSA
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {keyType === "ed25519"
                    ? "Ed25519 is faster and more secure"
                    : "RSA is widely compatible with older systems"}
                </p>
              </div>

              {keyType === "rsa" && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Key Size (bits)
                  </label>
                  <select
                    value={bits}
                    onChange={(e) => setBits(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value={2048}>2048 bits</option>
                    <option value={4096}>4096 bits (Recommended)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">
                  Passphrase (Optional)
                </label>
                <div className="relative">
                  <input
                    type={showPassphrase ? "text" : "password"}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Leave empty for no passphrase"
                    className="w-full px-3 py-2 pr-10 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassphrase(!showPassphrase)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                    {showPassphrase ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {passphrase && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Confirm Passphrase
                  </label>
                  <input
                    type={showPassphrase ? "text" : "password"}
                    value={confirmPassphrase}
                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                    placeholder="Confirm passphrase"
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}
            </>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">
              Comment (Optional)
            </label>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g., user@hostname"
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 rounded-md border border-input text-sm hover:bg-accent">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50">
              {isSubmitting
                ? `Processing... (${elapsedTime}s)`
                : isEditing
                  ? "Save Changes"
                  : "Generate Key"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
