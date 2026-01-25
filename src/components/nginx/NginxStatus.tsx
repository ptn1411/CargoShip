import { Play, Square, RotateCcw, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { nginxApi, NginxStatus as NginxStatusType } from "../../lib/tauri";
import { useAppStore } from "../../store";
import { useState } from "react";

interface Props {
  status: NginxStatusType;
  serverId: string;
  onRefresh: () => void;
}

export function NginxStatus({ status, serverId, onRefresh }: Props) {
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);
  const [isLoading, setIsLoading] = useState(false);

  const handleStart = async () => {
    setIsLoading(true);
    try {
      await nginxApi.start(serverId);
      showSuccess("Nginx started");
      onRefresh();
    } catch (error) {
      showError("Failed to start Nginx", String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    try {
      await nginxApi.stop(serverId);
      showSuccess("Nginx stopped");
      onRefresh();
    } catch (error) {
      showError("Failed to stop Nginx", String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestart = async () => {
    setIsLoading(true);
    try {
      await nginxApi.restart(serverId);
      showSuccess("Nginx restarted");
      onRefresh();
    } catch (error) {
      showError("Failed to restart Nginx", String(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border">
      <div className="flex items-center gap-6">
        {/* Running Status */}
        <div className="flex items-center gap-2">
          {status.running ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : (
            <XCircle className="w-4 h-4 text-red-500" />
          )}
          <span className="text-sm">
            {status.running ? "Running" : "Stopped"}
          </span>
        </div>

        {/* Version */}
        <div className="text-sm text-muted-foreground">
          Version: <span className="text-foreground">{status.version || "Unknown"}</span>
        </div>

        {/* Config Status */}
        <div className="flex items-center gap-2">
          {status.config_test ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
          )}
          <span className="text-sm">
            Config: {status.config_test ? "Valid" : "Error"}
          </span>
        </div>

        {/* Sites Count */}
        <div className="text-sm text-muted-foreground">
          Sites: <span className="text-foreground">{status.sites_enabled}</span>
          <span className="text-muted-foreground">/{status.sites_available}</span>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex items-center gap-2">
        {status.running ? (
          <>
            <button
              onClick={handleRestart}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-blue-500/10 text-blue-500 rounded hover:bg-blue-500/20 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restart
            </button>
            <button
              onClick={handleStop}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-red-500/10 text-red-500 rounded hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5" />
              Stop
            </button>
          </>
        ) : (
          <button
            onClick={handleStart}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-green-500/10 text-green-500 rounded hover:bg-green-500/20 transition-colors disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            Start
          </button>
        )}
      </div>

      {/* Config Error */}
      {status.config_error && (
        <div className="absolute top-full left-0 right-0 p-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-500 font-mono">
          {status.config_error}
        </div>
      )}
    </div>
  );
}
