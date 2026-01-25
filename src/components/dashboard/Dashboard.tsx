import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Cpu,
  HardDrive,
  LayoutDashboard,
  MemoryStick,
  RefreshCw,
  Server,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ActivityLog, ServerStatusInfo } from "../../lib/tauri";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import { Button, PageHeader, SectionHeader, SkeletonCard } from "../ui";
import { FavoritesSection, QuickActions } from "../quick-actions";

interface QuickStatProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  color?: "default" | "success" | "warning" | "danger";
}

function QuickStat({ label, value, icon, color = "default" }: QuickStatProps) {
  const colorClasses = {
    default: "bg-muted/50 text-foreground",
    success: "bg-green-500/10 text-green-500 dark:text-green-400",
    warning: "bg-amber-500/10 text-amber-500 dark:text-amber-400",
    danger: "bg-red-500/10 text-red-500 dark:text-red-400",
  };

  return (
    <div
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl border border-border",
        "bg-card transition-all duration-200",
        "hover:border-primary/30 hover:shadow-lg cursor-default"
      )}>
      <div className={cn("p-3 rounded-lg", colorClasses[color])}>{icon}</div>
      <div>
        <p className="text-2xl font-bold font-mono tabular-nums">{value}</p>
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
    ? Math.round(
        (status.metrics.memory_used / status.metrics.memory_total) * 100
      )
    : 0;
  const diskPercent = status.metrics
    ? Math.round((status.metrics.disk_used / status.metrics.disk_total) * 100)
    : 0;

  return (
    <div
      className={cn(
        "p-4 rounded-xl border border-border bg-card cursor-pointer",
        "transition-all duration-200 ease-out",
        "hover:border-primary/50 hover:shadow-lg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        !status.online && "opacity-60"
      )}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
      tabIndex={0}
      role="button"
      aria-label={`${status.server_name} - ${
        status.online ? "Online" : "Offline"
      }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Server
            className="w-4 h-4 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="font-semibold truncate">{status.server_name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {status.online ? (
            <CheckCircle className="w-4 h-4 status-online" aria-hidden="true" />
          ) : (
            <XCircle className="w-4 h-4 status-offline" aria-hidden="true" />
          )}
          <span
            className={cn(
              "text-xs font-medium",
              status.online ? "status-online" : "status-offline"
            )}>
            {status.online ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      {status.online && status.metrics && (
        <div className="space-y-2.5">
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
  const getColorClass = () => {
    if (warning) return "metric-danger";
    if (percent > 80) return "metric-warning";
    return "metric-safe";
  };

  return (
    <div className="flex items-center gap-2">
      <div className="text-muted-foreground" aria-hidden="true">
        {icon}
      </div>
      <span className="text-xs w-8 text-muted-foreground font-medium">
        {label}
      </span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            getColorClass()
          )}
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={`${label}: ${value}%`}
        />
      </div>
      <span className="text-xs w-10 text-right font-mono tabular-nums">
        {value}%
      </span>
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
        return <CheckCircle className="w-4 h-4 status-online" />;
      case "server_disconnected":
        return <XCircle className="w-4 h-4 status-offline" />;
      case "alert_triggered":
        return <AlertTriangle className="w-4 h-4 status-warning" />;
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
    <div className="flex items-start gap-3 py-3 group">
      <div className="mt-0.5" aria-hidden="true">
        {getIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium capitalize">
          {activity.action.replace(/_/g, " ")}
        </p>
        {activity.details && (
          <p className="text-xs text-muted-foreground truncate">
            {activity.details}
          </p>
        )}
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap font-mono">
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
  const avgCpu =
    onlineServers.length > 0
      ? Math.round(
          onlineServers.reduce(
            (sum, s) => sum + (s.metrics?.cpu_percent || 0),
            0
          ) / onlineServers.length
        )
      : 0;

  return (
    <div className="h-full flex flex-col p-6 overflow-auto">
      {/* Header */}
      <PageHeader
        title="Dashboard"
        description="Server monitoring overview"
        icon={<LayoutDashboard className="w-5 h-5" />}
        actions={
          <Button
            variant="secondary"
            onClick={handleRefresh}
            isLoading={isRefreshing || isLoadingMetrics}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Refresh
          </Button>
        }
      />

      {/* Quick Actions - Requirements 7.1 */}
      <section className="mb-8" aria-label="Quick Actions">
        <QuickActions />
      </section>

      {/* Favorites Section - Requirements 7.2 */}
      <section className="mb-8" aria-label="Favorites">
        <FavoritesSection maxItems={4} />
      </section>

      {/* Quick Stats */}
      <section className="mb-8" aria-label="Statistics">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickStat
            label="Total Servers"
            value={servers.length}
            icon={<Server className="w-5 h-5" aria-hidden="true" />}
          />
          <QuickStat
            label="Online"
            value={onlineCount}
            icon={<CheckCircle className="w-5 h-5" aria-hidden="true" />}
            color="success"
          />
          <QuickStat
            label="Offline"
            value={offlineCount}
            icon={<XCircle className="w-5 h-5" aria-hidden="true" />}
            color={offlineCount > 0 ? "danger" : "default"}
          />
          <QuickStat
            label="Active Alerts"
            value={alertCount}
            icon={<AlertTriangle className="w-5 h-5" aria-hidden="true" />}
            color={alertCount > 0 ? "warning" : "default"}
          />
        </div>
      </section>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Server Status Overview */}
        <section
          className="lg:col-span-2 flex flex-col"
          aria-label="Server Status">
          <SectionHeader
            title="Server Status"
            icon={<Cpu className="w-5 h-5" />}
            actions={
              avgCpu > 0 && (
                <span className="text-sm text-muted-foreground font-mono">
                  Avg CPU:{" "}
                  <span className="text-foreground font-semibold">{avgCpu}%</span>
                </span>
              )
            }
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-auto flex-1">
            {isLoadingMetrics && serverStatusList.length === 0 ? (
              <>
                {[1, 2, 3, 4].map((i) => (
                  <SkeletonCard key={i} />
                ))}
              </>
            ) : serverStatusList.length === 0 ? (
              <div className="col-span-2 flex flex-col items-center justify-center p-12 rounded-xl border border-dashed border-border bg-card/50">
                <Server
                  className="w-12 h-12 text-muted-foreground/50 mb-4"
                  aria-hidden="true"
                />
                <p className="text-muted-foreground text-center">
                  No servers configured.
                  <br />
                  <span className="text-sm">
                    Add servers to see their status.
                  </span>
                </p>
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
        </section>

        {/* Recent Activity Timeline */}
        <section className="flex flex-col" aria-label="Recent Activity">
          <SectionHeader
            title="Recent Activity"
            icon={<Activity className="w-5 h-5" />}
          />
          <div className="flex-1 overflow-auto rounded-xl border border-border bg-card p-4">
            {recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                <Clock
                  className="w-10 h-10 text-muted-foreground/50 mb-3"
                  aria-hidden="true"
                />
                <p className="text-sm">No recent activity</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentActivity.map((activity) => (
                  <ActivityItem key={activity.id} activity={activity} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
