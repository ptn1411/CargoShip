import { X, Terminal, Monitor } from "lucide-react";
import { cn } from "../../lib/utils";
import { TerminalSession } from "../../store";

interface TerminalTabProps {
  session: TerminalSession;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  isLocal?: boolean;
}

export function TerminalTab({ session, isActive, onSelect, onClose, isLocal }: TerminalTabProps) {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  const Icon = isLocal ? Monitor : Terminal;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 border-r border-border cursor-pointer transition-colors group",
        isActive
          ? "bg-background text-foreground"
          : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
      onClick={onSelect}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="text-sm truncate max-w-[120px]">{session.serverName}</span>
      <button
        onClick={handleClose}
        className={cn(
          "p-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-colors",
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        title="Close terminal"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
