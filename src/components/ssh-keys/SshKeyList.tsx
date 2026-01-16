import { useEffect, useState } from "react";
import { Plus, RefreshCw, Key, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { SshKey, CreateSshKeyInput, sshKeyApi } from "../../lib/tauri";
import { parseError } from "../../lib/errorHandler";
import { useAppStore } from "../../store";
import { SshKeyCard } from "./SshKeyCard";
import { SshKeyForm } from "./SshKeyForm";

export function SshKeyList() {
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [sshKeys, setSshKeys] = useState<SshKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<SshKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadKeys = async () => {
    try {
      const keys = await sshKeyApi.list();
      setSshKeys(keys);
      setError(null);
    } catch (err) {
      const parsed = parseError(err);
      setError(parsed.message);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    loadKeys().finally(() => setIsLoading(false));
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadKeys();
    setIsRefreshing(false);
  };

  const handleAddKey = () => {
    setEditingKey(null);
    setIsFormOpen(true);
  };

  const handleEditKey = (key: SshKey) => {
    setEditingKey(key);
    setIsFormOpen(true);
  };

  const handleDeleteKey = async (key: SshKey) => {
    if (window.confirm(`Are you sure you want to delete "${key.name}"? This action cannot be undone.`)) {
      try {
        await sshKeyApi.delete(key.id);
        showSuccess("SSH Key Deleted", `"${key.name}" has been removed.`);
        await loadKeys();
      } catch (err) {
        const parsed = parseError(err);
        showError(parsed.title, parsed.message);
      }
    }
  };

  const handleCopyPublicKey = async (key: SshKey) => {
    try {
      const publicKey = await sshKeyApi.exportPublicKey(key.id);
      await navigator.clipboard.writeText(publicKey);
      showSuccess("Copied!", "Public key copied to clipboard");
    } catch (err) {
      const parsed = parseError(err);
      showError(parsed.title, parsed.message);
    }
  };

  const handleFormSubmit = async (input: CreateSshKeyInput | { name?: string; comment?: string }) => {
    try {
      if (editingKey) {
        await sshKeyApi.update(editingKey.id, (input as { name?: string; comment?: string }).name, (input as { name?: string; comment?: string }).comment);
        showSuccess("SSH Key Updated", "Key has been updated.");
      } else {
        const result = await sshKeyApi.generate(input as CreateSshKeyInput);
        showSuccess("SSH Key Generated", `"${result.name}" has been created.`);
      }
      await loadKeys();
    } catch (err) {
      throw err;
    }
  };

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">SSH Keys</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-md border border-border hover:bg-accent disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          </button>
          <button
            onClick={handleAddKey}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Generate Key
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Loading State */}
      {isLoading && sshKeys.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && sshKeys.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
            <Key className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No SSH keys</h3>
          <p className="text-muted-foreground mb-4">
            Generate your first SSH key to use for server connections
          </p>
          <button
            onClick={handleAddKey}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Generate Key
          </button>
        </div>
      )}

      {/* Key Grid */}
      {sshKeys.length > 0 && (
        <div className="flex-1 overflow-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
          {sshKeys.map((key) => (
            <SshKeyCard
              key={key.id}
              sshKey={key}
              onEdit={() => handleEditKey(key)}
              onDelete={() => handleDeleteKey(key)}
              onCopyPublicKey={() => handleCopyPublicKey(key)}
            />
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <SshKeyForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        sshKey={editingKey}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
