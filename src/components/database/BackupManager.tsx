import { useState, useEffect } from "react";
import {
  Archive,
  Download,
  Upload,
  Trash2,
  RefreshCw,
  FolderOpen,
  Clock,
  CheckCircle,
  XCircle,
  FileArchive,
  HardDrive,
} from "lucide-react";
import {
  DatabaseConnection,
  BackupOptions,
  BackupResult,
  RestoreOptions,
  RestoreSource,
  BackupFileInfo,
  BackupHistoryEntry,
  databaseApi,
} from "../../lib/tauri";
import { useAppStore } from "../../store";
import { cn } from "../../lib/utils";

interface BackupManagerProps {
  connection: DatabaseConnection;
  database: string | null;
}

type Tab = "backup" | "restore" | "history" | "files";

export function BackupManager({ connection, database }: BackupManagerProps) {
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [activeTab, setActiveTab] = useState<Tab>("backup");
  const [isLoading, setIsLoading] = useState(false);

  // Backup state
  const [backupOptions, setBackupOptions] = useState<Partial<BackupOptions>>({
    include_structure: true,
    include_data: true,
    compress: true,
    remote_path: "/tmp",
  });
  const [backupResult, setBackupResult] = useState<BackupResult | null>(null);

  // Restore state
  const [restoreSource, setRestoreSource] = useState<"file" | "content">("file");
  const [restoreFilePath, setRestoreFilePath] = useState("");
  const [restoreContent, setRestoreContent] = useState("");
  const [dropExisting, setDropExisting] = useState(false);

  // Files state
  const [backupFiles, setBackupFiles] = useState<BackupFileInfo[]>([]);
  const [backupDirectory, setBackupDirectory] = useState("/tmp");

  // History state
  const [backupHistory, setBackupHistory] = useState<BackupHistoryEntry[]>([]);

  useEffect(() => {
    if (activeTab === "history") {
      loadBackupHistory();
    } else if (activeTab === "files") {
      loadBackupFiles();
    }
  }, [activeTab, connection.id]);

  const loadBackupHistory = async () => {
    try {
      const history = await databaseApi.getBackupHistory(connection.id, 50);
      setBackupHistory(history);
    } catch (error) {
      showError("Failed to load backup history", String(error));
    }
  };

  const loadBackupFiles = async () => {
    setIsLoading(true);
    try {
      const files = await databaseApi.listBackupFiles(connection.id, backupDirectory);
      setBackupFiles(files);
    } catch (error) {
      showError("Failed to load backup files", String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackup = async () => {
    if (!database) {
      showError("No database selected", "Please select a database first");
      return;
    }

    setIsLoading(true);
    setBackupResult(null);

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const extension = backupOptions.compress ? ".sql.gz" : ".sql";
      const fileName = `${database}_${timestamp}${extension}`;
      const remotePath = backupOptions.remote_path
        ? `${backupOptions.remote_path.replace(/\/$/, "")}/${fileName}`
        : undefined;

      const options: BackupOptions = {
        connection_id: connection.id,
        database,
        tables: undefined,
        include_structure: backupOptions.include_structure ?? true,
        include_data: backupOptions.include_data ?? true,
        compress: backupOptions.compress ?? true,
        remote_path: remotePath,
      };

      const result = await databaseApi.backupDatabase(options);
      setBackupResult(result);

      if (result.success) {
        showSuccess("Backup completed", `Database backed up successfully in ${result.duration_ms}ms`);
        loadBackupHistory();
      } else {
        showError("Backup failed", result.error || "Unknown error");
      }
    } catch (error) {
      showError("Backup failed", String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!database) {
      showError("No database selected", "Please select a database first");
      return;
    }

    const source: RestoreSource = restoreSource === "file"
      ? { type: "RemotePath", value: restoreFilePath }
      : { type: "Content", value: restoreContent };

    if (restoreSource === "file" && !restoreFilePath) {
      showError("No file selected", "Please enter a backup file path");
      return;
    }

    if (restoreSource === "content" && !restoreContent) {
      showError("No content provided", "Please paste SQL content to restore");
      return;
    }

    setIsLoading(true);

    try {
      const options: RestoreOptions = {
        connection_id: connection.id,
        database,
        source,
        drop_existing: dropExisting,
      };

      const result = await databaseApi.restoreDatabase(options);

      if (result.success) {
        showSuccess(
          "Restore completed",
          `Restored ${result.tables_restored} tables in ${result.duration_ms}ms`
        );
      } else {
        showError("Restore failed", result.error || "Unknown error");
      }
    } catch (error) {
      showError("Restore failed", String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBackupFile = async (filePath: string) => {
    if (!confirm("Are you sure you want to delete this backup file?")) return;

    try {
      await databaseApi.deleteBackupFile(connection.id, filePath);
      showSuccess("File deleted");
      loadBackupFiles();
    } catch (error) {
      showError("Failed to delete file", String(error));
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "backup", label: "Backup", icon: <Download className="w-4 h-4" /> },
    { id: "restore", label: "Restore", icon: <Upload className="w-4 h-4" /> },
    { id: "files", label: "Files", icon: <FolderOpen className="w-4 h-4" /> },
    { id: "history", label: "History", icon: <Clock className="w-4 h-4" /> },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-border px-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Backup Tab */}
        {activeTab === "backup" && (
          <div className="space-y-6 max-w-xl">
            <div className="flex items-center gap-2 text-lg font-medium">
              <Archive className="w-5 h-5 text-primary" />
              Create Backup
            </div>

            {!database && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-600 dark:text-yellow-400">
                Please select a database from the Browser tab first.
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Database</label>
                <input
                  type="text"
                  value={database || ""}
                  disabled
                  className="w-full px-3 py-2 bg-muted rounded-lg text-muted-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Save to Directory</label>
                <input
                  type="text"
                  value={backupOptions.remote_path || ""}
                  onChange={(e) => setBackupOptions({ ...backupOptions, remote_path: e.target.value })}
                  placeholder="/tmp"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={backupOptions.include_structure ?? true}
                    onChange={(e) => setBackupOptions({ ...backupOptions, include_structure: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Include table structure (CREATE TABLE)</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={backupOptions.include_data ?? true}
                    onChange={(e) => setBackupOptions({ ...backupOptions, include_data: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Include data (INSERT statements)</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={backupOptions.compress ?? true}
                    onChange={(e) => setBackupOptions({ ...backupOptions, compress: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Compress backup (gzip)</span>
                </label>
              </div>

              <button
                onClick={handleBackup}
                disabled={isLoading || !database}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Create Backup
              </button>

              {backupResult && (
                <div
                  className={cn(
                    "p-4 rounded-lg border",
                    backupResult.success
                      ? "bg-green-500/10 border-green-500/20"
                      : "bg-red-500/10 border-red-500/20"
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {backupResult.success ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    <span className="font-medium">
                      {backupResult.success ? "Backup Successful" : "Backup Failed"}
                    </span>
                  </div>
                  {backupResult.file_path && (
                    <p className="text-sm text-muted-foreground">
                      File: {backupResult.file_path}
                    </p>
                  )}
                  {backupResult.file_size && (
                    <p className="text-sm text-muted-foreground">
                      Size: {formatFileSize(backupResult.file_size)}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Duration: {backupResult.duration_ms}ms
                  </p>
                  {backupResult.error && (
                    <p className="text-sm text-red-500 mt-2">{backupResult.error}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Restore Tab */}
        {activeTab === "restore" && (
          <div className="space-y-6 max-w-xl">
            <div className="flex items-center gap-2 text-lg font-medium">
              <Upload className="w-5 h-5 text-primary" />
              Restore Database
            </div>

            {!database && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-600 dark:text-yellow-400">
                Please select a database from the Browser tab first.
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Target Database</label>
                <input
                  type="text"
                  value={database || ""}
                  disabled
                  className="w-full px-3 py-2 bg-muted rounded-lg text-muted-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Restore Source</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={restoreSource === "file"}
                      onChange={() => setRestoreSource("file")}
                    />
                    <span className="text-sm">From File</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={restoreSource === "content"}
                      onChange={() => setRestoreSource("content")}
                    />
                    <span className="text-sm">From SQL Content</span>
                  </label>
                </div>
              </div>

              {restoreSource === "file" ? (
                <div>
                  <label className="block text-sm font-medium mb-2">Backup File Path</label>
                  <input
                    type="text"
                    value={restoreFilePath}
                    onChange={(e) => setRestoreFilePath(e.target.value)}
                    placeholder="/tmp/database_backup.sql.gz"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-2">SQL Content</label>
                  <textarea
                    value={restoreContent}
                    onChange={(e) => setRestoreContent(e.target.value)}
                    placeholder="Paste SQL statements here..."
                    rows={10}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                  />
                </div>
              )}

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dropExisting}
                  onChange={(e) => setDropExisting(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-red-500">
                  Drop existing tables before restore (DANGEROUS)
                </span>
              </label>

              <button
                onClick={handleRestore}
                disabled={isLoading || !database}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Restore Database
              </button>
            </div>
          </div>
        )}

        {/* Files Tab */}
        {activeTab === "files" && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  value={backupDirectory}
                  onChange={(e) => setBackupDirectory(e.target.value)}
                  placeholder="/tmp"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <button
                onClick={loadBackupFiles}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                Scan
              </button>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium">Name</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">Size</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">Modified</th>
                    <th className="px-4 py-2 text-right text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backupFiles.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                        No backup files found in this directory
                      </td>
                    </tr>
                  ) : (
                    backupFiles.map((file) => (
                      <tr key={file.path} className="border-t border-border hover:bg-muted/50">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            {file.compressed ? (
                              <FileArchive className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <HardDrive className="w-4 h-4 text-muted-foreground" />
                            )}
                            <span className="text-sm font-mono">{file.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-sm text-muted-foreground">
                          {formatFileSize(file.size)}
                        </td>
                        <td className="px-4 py-2 text-sm text-muted-foreground">
                          {new Date(file.modified_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setRestoreFilePath(file.path);
                                setRestoreSource("file");
                                setActiveTab("restore");
                              }}
                              className="p-1 hover:bg-accent rounded"
                              title="Restore from this file"
                            >
                              <Upload className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteBackupFile(file.path)}
                              className="p-1 hover:bg-red-500/10 text-red-500 rounded"
                              title="Delete file"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Backup History</h3>
              <button
                onClick={loadBackupHistory}
                className="p-2 hover:bg-accent rounded-lg"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {backupHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No backup history found
                </div>
              ) : (
                backupHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-4 border border-border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {entry.status === "success" ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className="font-medium">{entry.database}</span>
                        {entry.compressed && (
                          <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded">
                            compressed
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </div>
                    {entry.file_path && (
                      <p className="text-sm text-muted-foreground font-mono">
                        {entry.file_path}
                      </p>
                    )}
                    {entry.file_size && (
                      <p className="text-sm text-muted-foreground">
                        Size: {formatFileSize(entry.file_size)}
                      </p>
                    )}
                    {entry.error && (
                      <p className="text-sm text-red-500 mt-1">{entry.error}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
