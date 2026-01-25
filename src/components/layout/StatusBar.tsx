import { Command, Loader2, Terminal, Wifi, WifiOff } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";

interface StatusBarProps {
  connectionCount: number;
  activeTerminals: number;
}

export function StatusBar({
  connectionCount,
  activeTerminals,
}: StatusBarProps) {
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
    <footer
      className="h-7 bg-secondary/80 border-t border-border flex items-center justify-between px-4 text-xs"
      role="contentinfo"
      aria-label="Application status">
      <div className="flex items-center gap-6">
        {/* Connection Status */}
        <div
          className="flex items-center gap-1.5"
          role="status"
          aria-live="polite">
          {isConnected ? (
            <Wifi className="w-3.5 h-3.5 status-online" aria-hidden="true" />
          ) : (
            <WifiOff
              className="w-3.5 h-3.5 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <span
            className={cn(
              "font-medium",
              isConnected ? "text-foreground" : "text-muted-foreground"
            )}>
            {connectionCount}{" "}
            {connectionCount === 1 ? "connection" : "connections"}
          </span>
        </div>

        {/* Terminal Sessions */}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
          <span>
            {activeTerminals} {activeTerminals === 1 ? "terminal" : "terminals"}
          </span>
        </div>

        {/* Command Palette Hint */}
        <div className="hidden sm:flex items-center gap-1.5 text-muted-foreground">
          <Command className="w-3 h-3" aria-hidden="true" />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-muted rounded border border-border">
            Ctrl+P
          </kbd>
          <span className="text-muted-foreground">Command Palette</span>
        </div>
      </div>

      {/* Status Indicator */}
      <div
        className="flex items-center gap-1.5"
        role="status"
        aria-live="polite">
        {isLoading ? (
          <>
            <Loader2
              className="w-3.5 h-3.5 animate-spin text-primary"
              aria-hidden="true"
            />
            <span className="text-primary font-medium">{getStatusText()}</span>
          </>
        ) : (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-muted-foreground">Ready</span>
          </>
        )}
      </div>
    </footer>
  );
}
