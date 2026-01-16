import { useState } from "react";
import { Database, Trash2, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { DatabaseConnection, Server, databaseApi } from "../../lib/tauri";
import { cn } from "../../lib/utils";

interface ConnectionListProps {
  connections: DatabaseConnection[];
  selectedId: string | null;
  onSelect: (conn: DatabaseConnection) => void;
  onRemove: (id: string) => void;
  servers: Server[];
}

export function ConnectionList({
  connections,
  selectedId,
  onSelect,
  onRemove,
  servers,
}: ConnectionListProps) {
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, boolean>>({});

  const getServerName = (serverId: string) => {
    const server = servers.find((s) => s.id === serverId);
    return server?.name || "Unknown Server";
  };

  const handleTestConnection = async (conn: DatabaseConnection, e: React.MouseEvent) => {
    e.stopPropagation();
    setTestingId(conn.id);
    try {
      const result = await databaseApi.testConnection(conn.id);
      setTestResults((prev) => ({ ...prev, [conn.id]: result.success }));
    } catch {
      setTestResults((prev) => ({ ...prev, [conn.id]: false }));
    } finally {
      setTestingId(null);
    }
  };

  const handleRemove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to remove this connection?")) {
      onRemove(id);
    }
  };

  if (connections.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-muted-foreground text-sm">
        No connections yet
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {connections.map((conn) => (
        <div
          key={conn.id}
          onClick={() => onSelect(conn)}
          className={cn(
            "p-3 border-b border-border cursor-pointer hover:bg-accent/50 transition-colors",
            selectedId === conn.id && "bg-accent"
          )}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Database
                className={cn(
                  "w-4 h-4 flex-shrink-0",
                  conn.db_type === "mysql" ? "text-blue-500" : "text-green-500"
                )}
              />
              <div className="min-w-0">
                <div className="font-medium truncate">{conn.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {getServerName(conn.server_id)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {testingId === conn.id ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : testResults[conn.id] !== undefined ? (
                testResults[conn.id] ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )
              ) : (
                <button
                  onClick={(e) => handleTestConnection(conn, e)}
                  className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                  title="Test connection"
                >
                  <CheckCircle className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={(e) => handleRemove(conn.id, e)}
                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                title="Remove connection"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            <span className="px-1.5 py-0.5 rounded bg-secondary">
              {conn.db_type.toUpperCase()}
            </span>
            <span className="ml-2">
              {conn.host}:{conn.port}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
