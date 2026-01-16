import {
  Rocket,
  FileEdit,
  Terminal,
  ChevronRight,
  Zap,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";

interface QuickActionButtonProps {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  variant?: "default" | "primary";
}

function QuickActionButton({
  icon,
  label,
  description,
  onClick,
  variant = "default",
}: QuickActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-all text-left w-full",
        variant === "primary"
          ? "border-primary/50 bg-primary/5 hover:bg-primary/10"
          : "border-border hover:border-primary/50 hover:bg-accent/50"
      )}
    >
      <div
        className={cn(
          "p-2 rounded-lg",
          variant === "primary"
            ? "bg-primary/10 text-primary"
            : "bg-secondary text-muted-foreground"
        )}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </button>
  );
}

interface QuickActionsProps {
  onDeploy?: () => void;
  onEditFile?: () => void;
  onOpenTerminal?: () => void;
}

/**
 * QuickActions component displays quick action buttons for common tasks
 * Actions: Deploy, Edit File, Open Terminal
 * Requirements: 7.1
 */
export function QuickActions({
  onDeploy,
  onEditFile,
  onOpenTerminal,
}: QuickActionsProps) {
  const servers = useAppStore((state) => state.servers);
  const scripts = useAppStore((state) => state.scripts);
  const setSidebarItem = useAppStore((state) => state.setSidebarItem);

  const handleDeploy = () => {
    if (onDeploy) {
      onDeploy();
    } else {
      setSidebarItem("scripts");
    }
  };

  const handleEditFile = () => {
    if (onEditFile) {
      onEditFile();
    } else {
      setSidebarItem("files");
    }
  };

  const handleOpenTerminal = () => {
    if (onOpenTerminal) {
      onOpenTerminal();
    } else {
      setSidebarItem("terminal");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-primary" />
        <h3 className="font-medium">Quick Actions</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <QuickActionButton
          icon={<Rocket className="w-4 h-4" />}
          label="Deploy"
          description={scripts.length > 0 ? `${scripts.length} scripts available` : "Create a script first"}
          onClick={handleDeploy}
          variant="primary"
        />
        <QuickActionButton
          icon={<FileEdit className="w-4 h-4" />}
          label="Edit File"
          description={servers.length > 0 ? "Browse server files" : "Add a server first"}
          onClick={handleEditFile}
        />
        <QuickActionButton
          icon={<Terminal className="w-4 h-4" />}
          label="Open Terminal"
          description={servers.length > 0 ? `${servers.length} servers` : "Add a server first"}
          onClick={handleOpenTerminal}
        />
      </div>
    </div>
  );
}
