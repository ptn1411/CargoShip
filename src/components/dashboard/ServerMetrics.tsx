import { useEffect, useState } from "react";
import {
  Cpu,
  HardDrive,
  MemoryStick,
  Clock,
  Activity,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import { MetricPoint } from "../../lib/tauri";

interface GaugeProps {
  value: number;
  max: number;
  label: string;
  icon: React.ReactNode;
  unit?: string;
  warning?: number;
  danger?: number;
}

function Gauge({ value, max, label, icon, unit = "%", warning = 70, danger = 90 }: GaugeProps) {
  const percent = Math.min((value / max) * 100, 100);
  const displayValue = Math.round(percent);
  
  const getColor = () => {
    if (percent >= danger) return "text-red-500";
    if (percent >= warning) return "text-yellow-500";
    return "text-green-500";
  };

  const getStrokeColor = () => {
    if (percent >= danger) return "#ef4444";
    if (percent >= warning) return "#eab308";
    return "#22c55e";
  };

  // SVG circle parameters
  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="flex flex-col items-center p-4 rounded-lg border border-border bg-card">
      <div className="relative">
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-secondary"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={getStrokeColor()}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={cn("mb-1", getColor())}>{icon}</div>
          <span className={cn("text-2xl font-bold", getColor())}>{displayValue}{unit}</span>
        </div>
      </div>
      <span className="mt-2 text-sm font-medium">{label}</span>
      {percent >= danger && (
        <div className="flex items-center gap-1 mt-1 text-xs text-red-500">
          <AlertTriangle className="w-3 h-3" />
          Critical
        </div>
      )}
    </div>
  );
}

interface MetricsChartProps {
  data: MetricPoint[];
  label: string;
  color?: string;
}

function MetricsChart({ data, label, color = "#22c55e" }: MetricsChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
        No historical data available
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 100);
  const minValue = Math.min(...data.map((d) => d.value), 0);
  const range = maxValue - minValue || 1;

  // Create SVG path
  const width = 100;
  const height = 100;
  const padding = 5;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const points = data.map((point, index) => {
    const x = padding + (index / (data.length - 1 || 1)) * chartWidth;
    const y = padding + chartHeight - ((point.value - minValue) / range) * chartHeight;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(" L ")}`;
  const areaD = `${pathD} L ${padding + chartWidth},${padding + chartHeight} L ${padding},${padding + chartHeight} Z`;

  return (
    <div className="p-4 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">
          Last {data.length} readings
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32">
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((percent) => {
          const y = padding + chartHeight - (percent / 100) * chartHeight;
          return (
            <g key={percent}>
              <line
                x1={padding}
                y1={y}
                x2={padding + chartWidth}
                y2={y}
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-border"
              />
              <text
                x={padding - 2}
                y={y}
                fontSize="3"
                fill="currentColor"
                className="text-muted-foreground"
                textAnchor="end"
                dominantBaseline="middle"
              >
                {percent}%
              </text>
            </g>
          );
        })}
        {/* Area fill */}
        <path d={areaD} fill={color} fillOpacity="0.1" />
        {/* Line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        {/* Data points */}
        {data.length <= 20 &&
          data.map((point, index) => {
            const x = padding + (index / (data.length - 1 || 1)) * chartWidth;
            const y = padding + chartHeight - ((point.value - minValue) / range) * chartHeight;
            return <circle key={index} cx={x} cy={y} r="1.5" fill={color} />;
          })}
      </svg>
    </div>
  );
}

interface ServerMetricsProps {
  serverId: string;
  serverName: string;
}

export function ServerMetrics({ serverId, serverName }: ServerMetricsProps) {
  const serverMetrics = useAppStore((state) => state.serverMetrics);
  const metricsHistory = useAppStore((state) => state.metricsHistory);
  const loadServerMetrics = useAppStore((state) => state.loadServerMetrics);
  const loadMetricsHistory = useAppStore((state) => state.loadMetricsHistory);
  const isLoadingMetrics = useAppStore((state) => state.isLoadingMetrics);

  const [selectedMetric, setSelectedMetric] = useState<"cpu" | "memory" | "disk">("cpu");
  const [historyHours, setHistoryHours] = useState(1);

  const metrics = serverMetrics[serverId];
  const historyKey = `${serverId}_${selectedMetric}_usage`;
  const history = metricsHistory[historyKey] || [];

  useEffect(() => {
    loadServerMetrics(serverId);
    loadMetricsHistory(serverId, `${selectedMetric}_usage`, historyHours);
  }, [serverId, selectedMetric, historyHours, loadServerMetrics, loadMetricsHistory]);

  const handleRefresh = () => {
    loadServerMetrics(serverId);
    loadMetricsHistory(serverId, `${selectedMetric}_usage`, historyHours);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const memoryPercent = metrics
    ? Math.round((metrics.memory_used / metrics.memory_total) * 100)
    : 0;
  const diskPercent = metrics
    ? Math.round((metrics.disk_used / metrics.disk_total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{serverName}</h2>
          <p className="text-sm text-muted-foreground">Server Metrics</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoadingMetrics}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border",
            "hover:bg-accent transition-colors disabled:opacity-50 text-sm"
          )}
        >
          <RefreshCw className={cn("w-4 h-4", isLoadingMetrics && "animate-spin")} />
          Refresh
        </button>
      </div>

      {!metrics ? (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          <p>Unable to load metrics. Server may be offline.</p>
        </div>
      ) : (
        <>
          {/* Gauges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Gauge
              value={metrics.cpu_percent}
              max={100}
              label="CPU Usage"
              icon={<Cpu className="w-5 h-5" />}
            />
            <Gauge
              value={memoryPercent}
              max={100}
              label="Memory Usage"
              icon={<MemoryStick className="w-5 h-5" />}
            />
            <Gauge
              value={diskPercent}
              max={100}
              label="Disk Usage"
              icon={<HardDrive className="w-5 h-5" />}
              warning={80}
              danger={90}
            />
          </div>

          {/* Additional Info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Activity className="w-4 h-4" />
                <span className="text-xs">Load Average</span>
              </div>
              <p className="font-medium">
                {metrics.load_average.map((l) => l.toFixed(2)).join(" / ")}
              </p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-xs">Uptime</span>
              </div>
              <p className="font-medium">{formatUptime(metrics.uptime_seconds)}</p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <MemoryStick className="w-4 h-4" />
                <span className="text-xs">Memory</span>
              </div>
              <p className="font-medium text-sm">
                {formatBytes(metrics.memory_used)} / {formatBytes(metrics.memory_total)}
              </p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <HardDrive className="w-4 h-4" />
                <span className="text-xs">Disk</span>
              </div>
              <p className="font-medium text-sm">
                {formatBytes(metrics.disk_used)} / {formatBytes(metrics.disk_total)}
              </p>
            </div>
          </div>

          {/* History Chart */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">Metrics History</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedMetric}
                  onChange={(e) => setSelectedMetric(e.target.value as "cpu" | "memory" | "disk")}
                  className="px-2 py-1 text-sm rounded border border-border bg-background"
                >
                  <option value="cpu">CPU</option>
                  <option value="memory">Memory</option>
                  <option value="disk">Disk</option>
                </select>
                <select
                  value={historyHours}
                  onChange={(e) => setHistoryHours(Number(e.target.value))}
                  className="px-2 py-1 text-sm rounded border border-border bg-background"
                >
                  <option value={1}>Last 1 hour</option>
                  <option value={6}>Last 6 hours</option>
                  <option value={24}>Last 24 hours</option>
                  <option value={168}>Last 7 days</option>
                </select>
              </div>
            </div>
            <MetricsChart
              data={history}
              label={`${selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1)} Usage`}
              color={
                selectedMetric === "cpu"
                  ? "#3b82f6"
                  : selectedMetric === "memory"
                  ? "#8b5cf6"
                  : "#22c55e"
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
