import { Wifi, WifiOff, Terminal, Activity, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";

interface StatusBarProps {
  connectionCount: number;
  activeTerminals: number;
}

export function StatusBar({ connectionCount, activeTerminals }: StatusBarProps) {
  const isConnected = connectionCount > 0;
  const isLoadingServers = useAppStore((state) => state.isLoadingServers);
  const isLoadingFiles = useAppStore((state) => state.isLoadingFiles);
  const isCreatingTerminal = useAppStore((state) => state.isCreatingTerminal);

  const isLoading = isLoadingServers || isLoadingFiles || isCreatingTerminal;

  const getStatusText = () => {
    if (isLoadingServers) return "Loading servers...";
    if (isLoadingFiles) return "Loading files...";
    if (isCreatingTerminal) return "Opening terminal...";
    return "Ready";
  };

  return (
    <footer className="h-7 bg-secondary border-t border-border flex items-center justify-between px-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        {/* Connection Status */}
        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <Wifi className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <span className={cn(isConnected && "text-foreground")}>
            {connectionCount} {connectionCount === 1 ? "connection" : "connections"}
          </span>
        </div>

        {/* Terminal Sessions */}
        <div className="flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5" />
          <span>
            {activeTerminals} {activeTerminals === 1 ? "terminal" : "terminals"}
          </span>
        </div>
      </div>

      {/* Status Indicator */}
      <div className="flex items-center gap-1.5">
        {isLoading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            <span className="text-primary">{getStatusText()}</span>
          </>
        ) : (
          <>
            <Activity className="w-3.5 h-3.5" />
            <span>Ready</span>
          </>
        )}
      </div>
    </footer>
  );
}
