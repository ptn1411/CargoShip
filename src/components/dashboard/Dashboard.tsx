import { useEffect, useState } from "react";
import {
  Activity,
  Server,
  Cpu,
  HardDrive,
  MemoryStick,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import { ServerStatusInfo, ActivityLog } from "../../lib/tauri";
import { QuickActions, FavoritesSection } from "../quick-actions";

interface QuickStatProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  color?: "default" | "success" | "warning" | "danger";
}

function QuickStat({ label, value, icon, color = "default" }: QuickStatProps) {
  const colorClasses = {
    default: "bg-secondary text-foreground",
    success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    danger: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
      <div className={cn("p-2 rounded-lg", colorClasses[color])}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

interface ServerStatusCardProps {
  status: ServerStatusInfo;
  onClick?: () => void;
}

function ServerStatusCard({ status, onClick }: ServerStatusCardProps) {
  const memoryPercent = status.metrics
    ? Math.round((status.metrics.memory_used / status.metrics.memory_total) * 100)
    : 0;
  const diskPercent = status.metrics
    ? Math.round((status.metrics.disk_used / status.metrics.disk_total) * 100)
    : 0;

  return (
    <div
      className={cn(
        "p-4 rounded-lg border border-border bg-card cursor-pointer transition-colors hover:bg-accent/50",
        !status.online && "opacity-60"
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium truncate">{status.server_name}</span>
        </div>
        <div className="flex items-center gap-1">
          {status.online ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : (
            <XCircle className="w-4 h-4 text-red-500" />
          )}
          <span className={cn("text-xs", status.online ? "text-green-500" : "text-red-500")}>
            {status.online ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      {status.online && status.metrics && (
        <div className="space-y-2">
          <MetricBar
            icon={<Cpu className="w-3 h-3" />}
            label="CPU"
            value={Math.round(status.metrics.cpu_percent)}
            max={100}
          />
          <MetricBar
            icon={<MemoryStick className="w-3 h-3" />}
            label="RAM"
            value={memoryPercent}
            max={100}
          />
          <MetricBar
            icon={<HardDrive className="w-3 h-3" />}
            label="Disk"
            value={diskPercent}
            max={100}
            warning={diskPercent > 90}
          />
        </div>
      )}

      {!status.online && (
        <p className="text-sm text-muted-foreground">Unable to connect</p>
      )}
    </div>
  );
}

interface MetricBarProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  max: number;
  warning?: boolean;
}

function MetricBar({ icon, label, value, max, warning }: MetricBarProps) {
  const percent = Math.min((value / max) * 100, 100);
  const getColor = () => {
    if (warning) return "bg-red-500";
    if (percent > 80) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="flex items-center gap-2">
      <div className="text-muted-foreground">{icon}</div>
      <span className="text-xs w-8 text-muted-foreground">{label}</span>
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn("h-full transition-all", getColor())}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs w-8 text-right">{value}%</span>
    </div>
  );
}

interface ActivityItemProps {
  activity: ActivityLog;
}

function ActivityItem({ activity }: ActivityItemProps) {
  const getIcon = () => {
    switch (activity.action) {
      case "deployment_started":
      case "deployment_completed":
        return <Activity className="w-4 h-4 text-blue-500" />;
      case "server_connected":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "server_disconnected":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "alert_triggered":
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5">{getIcon()}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">{activity.action.replace(/_/g, " ")}</p>
        {activity.details && (
          <p className="text-xs text-muted-foreground truncate">{activity.details}</p>
        )}
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {formatTime(activity.created_at)}
      </span>
    </div>
  );
}

export function Dashboard() {
  const servers = useAppStore((state) => state.servers);
  const serverStatusList = useAppStore((state) => state.serverStatusList);
  const recentActivity = useAppStore((state) => state.recentActivity);
  const triggeredAlerts = useAppStore((state) => state.triggeredAlerts);
  const loadServers = useAppStore((state) => state.loadServers);
  const loadAllServerStatus = useAppStore((state) => state.loadAllServerStatus);
  const loadRecentActivity = useAppStore((state) => state.loadRecentActivity);
  const isLoadingMetrics = useAppStore((state) => state.isLoadingMetrics);
  const selectServer = useAppStore((state) => state.selectServer);
  const setSidebarItem = useAppStore((state) => state.setSidebarItem);

  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadServers();
    loadAllServerStatus();
    loadRecentActivity(10);
  }, [loadServers, loadAllServerStatus, loadRecentActivity]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadAllServerStatus(), loadRecentActivity(10)]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleServerClick = (serverId: string) => {
    selectServer(serverId);
    setSidebarItem("servers");
  };

  // Calculate stats
  const onlineCount = serverStatusList.filter((s) => s.online).length;
  const offlineCount = serverStatusList.filter((s) => !s.online).length;
  const alertCount = triggeredAlerts.length;

  // Calculate average metrics
  const onlineServers = serverStatusList.filter((s) => s.online && s.metrics);
  const avgCpu = onlineServers.length > 0
    ? Math.round(onlineServers.reduce((sum, s) => sum + (s.metrics?.cpu_percent || 0), 0) / onlineServers.length)
    : 0;

  return (
    <div className="h-full flex flex-col p-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">Server monitoring overview</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing || isLoadingMetrics}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg border border-border",
            "hover:bg-accent transition-colors disabled:opacity-50"
          )}
        >
          <RefreshCw className={cn("w-4 h-4", (isRefreshing || isLoadingMetrics) && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Quick Actions - Requirements 7.1 */}
      <div className="mb-6">
        <QuickActions />
      </div>

      {/* Favorites Section - Requirements 7.2 */}
      <div className="mb-6">
        <FavoritesSection maxItems={4} />
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <QuickStat
          label="Total Servers"
          value={servers.length}
          icon={<Server className="w-5 h-5" />}
        />
        <QuickStat
          label="Online"
          value={onlineCount}
          icon={<CheckCircle className="w-5 h-5" />}
          color="success"
        />
        <QuickStat
          label="Offline"
          value={offlineCount}
          icon={<XCircle className="w-5 h-5" />}
          color={offlineCount > 0 ? "danger" : "default"}
        />
        <QuickStat
          label="Active Alerts"
          value={alertCount}
          icon={<AlertTriangle className="w-5 h-5" />}
          color={alertCount > 0 ? "warning" : "default"}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Server Status Overview */}
        <div className="lg:col-span-2 flex flex-col">
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-muted-foreground" />
            Server Status
            {avgCpu > 0 && (
              <span className="text-sm text-muted-foreground ml-auto">
                Avg CPU: {avgCpu}%
              </span>
            )}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-auto flex-1">
            {serverStatusList.length === 0 ? (
              <div className="col-span-2 flex items-center justify-center p-8 text-muted-foreground">
                <p>No servers configured. Add servers to see their status.</p>
              </div>
            ) : (
              serverStatusList.map((status) => (
                <ServerStatusCard
                  key={status.server_id}
                  status={status}
                  onClick={() => handleServerClick(status.server_id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Recent Activity Timeline */}
        <div className="flex flex-col">
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-muted-foreground" />
            Recent Activity
          </h2>
          <div className="flex-1 overflow-auto border border-border rounded-lg bg-card p-4">
            {recentActivity.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>No recent activity</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentActivity.map((activity) => (
                  <ActivityItem key={activity.id} activity={activity} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
