import { useState } from "react";
import { X, Database, Loader2 } from "lucide-react";
import { Server, CreateConnectionInput, DatabaseType, databaseApi } from "../../lib/tauri";

interface ConnectionFormProps {
  servers: Server[];
  onSubmit: (input: CreateConnectionInput) => void;
  onClose: () => void;
}

export function ConnectionForm({ servers, onSubmit, onClose }: ConnectionFormProps) {
  const [formData, setFormData] = useState<CreateConnectionInput>({
    server_id: servers[0]?.id || "",
    name: "",
    db_type: "mysql",
    host: "localhost",
    port: 3306,
    username: "root",
    password: "",
    database: undefined,
  });
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleDbTypeChange = (dbType: DatabaseType) => {
    setFormData((prev) => ({
      ...prev,
      db_type: dbType,
      port: dbType === "mysql" ? 3306 : 5432,
    }));
    setTestResult(null);
  };

  const handleTest = async () => {
    if (!formData.server_id || !formData.username) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      // Create temporary connection for testing
      const tempConn = await databaseApi.addConnection(formData);
      const result = await databaseApi.testConnection(tempConn.id);
      await databaseApi.removeConnection(tempConn.id);

      setTestResult({
        success: result.success,
        message: result.success
          ? `Connected! ${result.version || ""}`
          : result.message,
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: String(error),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg shadow-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Add Database Connection</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Server Selection */}
          <div>
            <label className="block text-sm font-medium mb-1">VPS Server</label>
            <select
              value={formData.server_id}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, server_id: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              required
            >
              <option value="">Select a server</option>
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name} ({server.host})
                </option>
              ))}
            </select>
          </div>

          {/* Connection Name */}
          <div>
            <label className="block text-sm font-medium mb-1">Connection Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="My Database"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          {/* Database Type */}
          <div>
            <label className="block text-sm font-medium mb-1">Database Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleDbTypeChange("mysql")}
                className={`flex-1 px-3 py-2 rounded-lg border transition-colors ${
                  formData.db_type === "mysql"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-accent"
                }`}
              >
                MySQL
              </button>
              <button
                type="button"
                onClick={() => handleDbTypeChange("postgresql")}
                className={`flex-1 px-3 py-2 rounded-lg border transition-colors ${
                  formData.db_type === "postgresql"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-accent"
                }`}
              >
                PostgreSQL
              </button>
            </div>
          </div>

          {/* Host & Port */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Host</label>
              <input
                type="text"
                value={formData.host}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, host: e.target.value }))
                }
                placeholder="localhost"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Port</label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, port: parseInt(e.target.value) || 3306 }))
                }
                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
          </div>

          {/* Username & Password */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium mb-1">Username</label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, username: e.target.value }))
                }
                placeholder="root"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Default Database */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Default Database <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              type="text"
              value={formData.database || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  database: e.target.value || undefined,
                }))
              }
              placeholder="database_name"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className={`p-3 rounded-lg text-sm ${
                testResult.success
                  ? "bg-green-500/10 text-green-500 border border-green-500/20"
                  : "bg-red-500/10 text-red-500 border border-red-500/20"
              }`}
            >
              {testResult.message}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting || !formData.server_id}
              className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isTesting && <Loader2 className="w-4 h-4 animate-spin" />}
              Test Connection
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Add Connection
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
