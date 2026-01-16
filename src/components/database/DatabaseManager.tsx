import { useState, useEffect } from "react";
import { Database, Plus, RefreshCw, Server } from "lucide-react";
import { ConnectionList } from "./ConnectionList";
import { ConnectionForm } from "./ConnectionForm";
import { DatabaseBrowser } from "./DatabaseBrowser";
import { QueryEditor } from "./QueryEditor";
import { UserManager } from "./UserManager";
import { BackupManager } from "./BackupManager";
import { useAppStore } from "../../store";
import {
  DatabaseConnection,
  CreateConnectionInput,
  databaseApi,
} from "../../lib/tauri";
import { cn } from "../../lib/utils";

type Tab = "browser" | "query" | "users" | "backup";

export function DatabaseManager() {
  const servers = useAppStore((state) => state.servers);
  const loadServers = useAppStore((state) => state.loadServers);
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [connections, setConnections] = useState<DatabaseConnection[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<DatabaseConnection | null>(null);
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("browser");

  useEffect(() => {
    loadServers();
    loadConnections();
  }, []);

  const loadConnections = async () => {
    setIsLoading(true);
    try {
      const conns = await databaseApi.listConnections();
      setConnections(conns);
    } catch (error) {
      showError("Failed to load connections", String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddConnection = async (input: CreateConnectionInput) => {
    try {
      const conn = await databaseApi.addConnection(input);
      setConnections((prev) => [...prev, conn]);
      setShowConnectionForm(false);
      showSuccess("Connection added", conn.name);
    } catch (error) {
      showError("Failed to add connection", String(error));
    }
  };

  const handleRemoveConnection = async (id: string) => {
    try {
      await databaseApi.removeConnection(id);
      setConnections((prev) => prev.filter((c) => c.id !== id));
      if (selectedConnection?.id === id) {
        setSelectedConnection(null);
        setSelectedDatabase(null);
      }
      showSuccess("Connection removed");
    } catch (error) {
      showError("Failed to remove connection", String(error));
    }
  };

  const handleSelectConnection = (conn: DatabaseConnection) => {
    setSelectedConnection(conn);
    setSelectedDatabase(null);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "browser", label: "Browser" },
    { id: "query", label: "Query" },
    { id: "users", label: "Users" },
    { id: "backup", label: "Backup" },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">Database Manager</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadConnections}
            disabled={isLoading}
            className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </button>
          <button
            onClick={() => setShowConnectionForm(true)}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Connection
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Connection List */}
        <div className="w-64 border-r border-border flex flex-col">
          <ConnectionList
            connections={connections}
            selectedId={selectedConnection?.id || null}
            onSelect={handleSelectConnection}
            onRemove={handleRemoveConnection}
            servers={servers}
          />
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedConnection ? (
            <>
              {/* Connection Info & Tabs */}
              <div className="border-b border-border">
                <div className="px-4 py-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Server className="w-4 h-4" />
                  <span>{selectedConnection.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-accent">
                    {selectedConnection.db_type.toUpperCase()}
                  </span>
                  <span className="text-xs">
                    {selectedConnection.host}:{selectedConnection.port}
                  </span>
                </div>
                <div className="flex px-4">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                        activeTab === tab.id
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-hidden">
                {activeTab === "browser" && (
                  <DatabaseBrowser
                    connection={selectedConnection}
                    selectedDatabase={selectedDatabase}
                    onSelectDatabase={setSelectedDatabase}
                  />
                )}
                {activeTab === "query" && (
                  <QueryEditor
                    connection={selectedConnection}
                    database={selectedDatabase}
                  />
                )}
                {activeTab === "users" && (
                  <UserManager connection={selectedConnection} />
                )}
                {activeTab === "backup" && (
                  <BackupManager
                    connection={selectedConnection}
                    database={selectedDatabase}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Select a connection to get started</p>
                <p className="text-sm mt-1">
                  or{" "}
                  <button
                    onClick={() => setShowConnectionForm(true)}
                    className="text-primary hover:underline"
                  >
                    add a new connection
                  </button>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Connection Form Modal */}
      {showConnectionForm && (
        <ConnectionForm
          servers={servers}
          onSubmit={handleAddConnection}
          onClose={() => setShowConnectionForm(false)}
        />
      )}
    </div>
  );
}
