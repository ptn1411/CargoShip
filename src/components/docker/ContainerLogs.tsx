import { useState, useEffect, useRef } from "react";
import { X, RefreshCw, Download } from "lucide-react";
import { dockerApi, ContainerLogs as ContainerLogsType } from "../../lib/tauri";
import { useAppStore } from "../../store";

interface ContainerLogsProps {
  serverId: string;
  containerId: string;
  containerName: string;
  onClose: () => void;
}

export function ContainerLogs({ serverId, containerId, containerName, onClose }: ContainerLogsProps) {
  const showError = useAppStore((state) => state.showError);
  const [logs, setLogs] = useState<ContainerLogsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tailLines, setTailLines] = useState(100);
  const logsRef = useRef<HTMLPreElement>(null);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const result = await dockerApi.getContainerLogs(serverId, containerId, tailLines);
      setLogs(result);
      // Scroll to bottom
      setTimeout(() => {
        if (logsRef.current) {
          logsRef.current.scrollTop = logsRef.current.scrollHeight;
        }
      }, 100);
    } catch (err) {
      showError("Failed to load logs", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [serverId, containerId, tailLines]);

  const handleDownload = () => {
    if (!logs) return;
    const content = logs.stdout + (logs.stderr ? "\n--- STDERR ---\n" + logs.stderr : "");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${containerName}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg w-[900px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">Logs: {containerName}</h3>
          <div className="flex items-center gap-2">
            <select
              value={tailLines}
              onChange={(e) => setTailLines(Number(e.target.value))}
              className="px-2 py-1 bg-secondary border border-border rounded text-sm"
            >
              <option value={50}>Last 50 lines</option>
              <option value={100}>Last 100 lines</option>
              <option value={500}>Last 500 lines</option>
              <option value={1000}>Last 1000 lines</option>
            </select>
            <button onClick={loadLogs} className="p-2 hover:bg-accent rounded" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={handleDownload} className="p-2 hover:bg-accent rounded" title="Download">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-accent rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Logs Content */}
        <pre
          ref={logsRef}
          className="flex-1 overflow-auto p-4 bg-black text-green-400 font-mono text-xs whitespace-pre-wrap"
        >
          {isLoading ? (
            "Loading logs..."
          ) : logs ? (
            <>
              {logs.stdout}
              {logs.stderr && (
                <>
                  {"\n"}
                  <span className="text-red-400">--- STDERR ---{"\n"}{logs.stderr}</span>
                </>
              )}
            </>
          ) : (
            "No logs available"
          )}
        </pre>
      </div>
    </div>
  );
}
