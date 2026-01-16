import { Key, Copy, Trash2, Edit, Clock } from "lucide-react";
import { cn } from "../../lib/utils";
import { SshKey } from "../../lib/tauri";

interface SshKeyCardProps {
  sshKey: SshKey;
  onEdit: () => void;
  onDelete: () => void;
  onCopyPublicKey: () => void;
}

export function SshKeyCard({ sshKey, onEdit, onDelete, onCopyPublicKey }: SshKeyCardProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const truncateKey = (key: string, maxLength: number = 50) => {
    if (key.length <= maxLength) return key;
    return key.substring(0, maxLength) + "...";
  };

  return (
    <div className="p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center",
            sshKey.key_type === "ed25519" ? "bg-green-500/10 text-green-500" : "bg-blue-500/10 text-blue-500"
          )}>
            <Key className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium truncate">{sshKey.name}</h3>
            <p className="text-xs text-muted-foreground uppercase">{sshKey.key_type}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onCopyPublicKey}
            className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Copy public key"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={onEdit}
            className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Edit"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Fingerprint</p>
          <code className="text-xs bg-muted px-2 py-1 rounded font-mono block truncate">
            {sshKey.fingerprint}
          </code>
        </div>
        
        <div>
          <p className="text-xs text-muted-foreground mb-1">Public Key</p>
          <code className="text-xs bg-muted px-2 py-1 rounded font-mono block truncate">
            {truncateKey(sshKey.public_key)}
          </code>
        </div>

        {sshKey.comment && (
          <p className="text-xs text-muted-foreground">
            Comment: {sshKey.comment}
          </p>
        )}

        <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
          <Clock className="w-3 h-3" />
          <span>Created {formatDate(sshKey.created_at)}</span>
        </div>
      </div>
    </div>
  );
}
