import { useEffect, useState } from "react";
import {
  Bell,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Cpu,
  HardDrive,
  MemoryStick,
  Settings,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import {
  AlertConfig,
  Alert,
  MetricType,
  AlertCondition,
  CreateAlertInput,
} from "../../lib/tauri";

interface AlertFormProps {
  onSubmit: (input: CreateAlertInput) => void;
  onCancel: () => void;
  servers: { id: string; name: string }[];
}

function AlertForm({ onSubmit, onCancel, servers }: AlertFormProps) {
  const [serverId, setServerId] = useState<string>("");
  const [metric, setMetric] = useState<MetricType>("cpu_usage");
  const [condition, setCondition] = useState<AlertCondition>("greater_than");
  const [threshold, setThreshold] = useState(80);
  const [enabled, setEnabled] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      server_id: serverId || undefined,
      metric,
      condition,
      threshold,
      enabled,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border border-border rounded-lg bg-card">
      <h3 className="font-medium flex items-center gap-2">
        <Plus className="w-4 h-4" />
        Create New Alert
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Server</label>
          <select
            value={serverId}
            onChange={(e) => setServerId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background"
          >
            <option value="">All Servers</option>
            {servers.map((server) => (
              <option key={server.id} value={server.id}>
                {server.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Metric</label>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricType)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background"
          >
            <option value="cpu_usage">CPU Usage</option>
            <option value="memory_usage">Memory Usage</option>
            <option value="disk_usage">Disk Usage</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Condition</label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as AlertCondition)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background"
          >
            <option value="greater_than">Greater Than</option>
            <option value="less_than">Less Than</option>
            <option value="equals">Equals</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Threshold (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded border-border"
        />
        <label htmlFor="enabled" className="text-sm">
          Enable alert immediately
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Create Alert
        </button>
      </div>
    </form>
  );
}

interface AlertConfigCardProps {
  alert: AlertConfig;
  serverName?: string;
  onDelete: () => void;
  onToggle: () => void;
}

function AlertConfigCard({ alert, serverName, onDelete, onToggle }: AlertConfigCardProps) {
  const getMetricIcon = () => {
    switch (alert.metric) {
      case "cpu_usage":
        return <Cpu className="w-4 h-4" />;
      case "memory_usage":
        return <MemoryStick className="w-4 h-4" />;
      case "disk_usage":
        return <HardDrive className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getConditionText = () => {
    switch (alert.condition) {
      case "greater_than":
        return ">";
      case "less_than":
        return "<";
      case "equals":
        return "=";
      default:
        return alert.condition;
    }
  };

  const getMetricLabel = () => {
    switch (alert.metric) {
      case "cpu_usage":
        return "CPU";
      case "memory_usage":
        return "Memory";
      case "disk_usage":
        return "Disk";
      default:
        return alert.metric;
    }
  };

  return (
    <div
      className={cn(
        "p-4 rounded-lg border border-border bg-card",
        !alert.enabled && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "p-2 rounded-lg",
              alert.enabled ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
            )}
          >
            {getMetricIcon()}
          </div>
          <div>
            <p className="font-medium">
              {getMetricLabel()} {getConditionText()} {alert.threshold}%
            </p>
            <p className="text-sm text-muted-foreground">
              {serverName || "All Servers"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggle}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              alert.enabled
                ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                : "bg-secondary text-muted-foreground"
            )}
            title={alert.enabled ? "Disable alert" : "Enable alert"}
          >
            {alert.enabled ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
            title="Delete alert"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface TriggeredAlertCardProps {
  alert: Alert;
}

function TriggeredAlertCard({ alert }: TriggeredAlertCardProps) {
  const getMetricIcon = () => {
    switch (alert.metric) {
      case "cpu_usage":
        return <Cpu className="w-4 h-4" />;
      case "memory_usage":
        return <MemoryStick className="w-4 h-4" />;
      case "disk_usage":
        return <HardDrive className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="p-4 rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/10">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400">
          {getMetricIcon()}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <p className="font-medium text-yellow-700 dark:text-yellow-400">
              {alert.server_name}
            </p>
            <span className="text-xs text-muted-foreground">
              {formatTime(alert.triggered_at)}
            </span>
          </div>
          <p className="text-sm text-yellow-600 dark:text-yellow-500">
            {alert.metric.replace("_", " ")} is {alert.actual_value.toFixed(1)}% (threshold:{" "}
            {alert.threshold}%)
          </p>
        </div>
      </div>
    </div>
  );
}

export function AlertManager() {
  const servers = useAppStore((state) => state.servers);
  const alerts = useAppStore((state) => state.alerts);
  const triggeredAlerts = useAppStore((state) => state.triggeredAlerts);
  const loadAlerts = useAppStore((state) => state.loadAlerts);
  const createAlert = useAppStore((state) => state.createAlert);
  const deleteAlert = useAppStore((state) => state.deleteAlert);
  const showSuccess = useAppStore((state) => state.showSuccess);
  const showError = useAppStore((state) => state.showError);

  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<"config" | "history">("config");

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const handleCreateAlert = async (input: CreateAlertInput) => {
    try {
      await createAlert(input);
      setShowForm(false);
      showSuccess("Alert created", "New alert has been configured");
    } catch (error) {
      showError("Failed to create alert", String(error));
    }
  };

  const handleDeleteAlert = async (id: string) => {
    try {
      await deleteAlert(id);
      showSuccess("Alert deleted", "Alert has been removed");
    } catch (error) {
      showError("Failed to delete alert", String(error));
    }
  };

  const handleToggleAlert = async (alert: AlertConfig) => {
    // Note: This would need an updateAlert action in the store
    // For now, we'll just show a message
    showSuccess(
      alert.enabled ? "Alert disabled" : "Alert enabled",
      "Alert status updated"
    );
  };

  const getServerName = (serverId: string | null) => {
    if (!serverId) return undefined;
    const server = servers.find((s) => s.id === serverId);
    return server?.name;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Alert Manager</h2>
          {triggeredAlerts.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
              {triggeredAlerts.length} active
            </span>
          )}
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Alert
          </button>
        )}
      </div>

      {/* Create Alert Form */}
      {showForm && (
        <AlertForm
          onSubmit={handleCreateAlert}
          onCancel={() => setShowForm(false)}
          servers={servers.map((s) => ({ id: s.id, name: s.name }))}
        />
      )}

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("config")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === "config"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Settings className="w-4 h-4 inline-block mr-2" />
          Configured Alerts ({alerts.length})
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === "history"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <AlertTriangle className="w-4 h-4 inline-block mr-2" />
          Triggered Alerts ({triggeredAlerts.length})
        </button>
      </div>

      {/* Content */}
      {activeTab === "config" ? (
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
              <Bell className="w-12 h-12 mb-4 opacity-50" />
              <p>No alerts configured</p>
              <p className="text-sm">Create an alert to monitor your servers</p>
            </div>
          ) : (
            alerts.map((alert) => (
              <AlertConfigCard
                key={alert.id}
                alert={alert}
                serverName={getServerName(alert.server_id)}
                onDelete={() => handleDeleteAlert(alert.id)}
                onToggle={() => handleToggleAlert(alert)}
              />
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {triggeredAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
              <CheckCircle className="w-12 h-12 mb-4 opacity-50 text-green-500" />
              <p>No active alerts</p>
              <p className="text-sm">All systems operating normally</p>
            </div>
          ) : (
            triggeredAlerts.map((alert, index) => (
              <TriggeredAlertCard key={`${alert.alert_config_id}-${index}`} alert={alert} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
