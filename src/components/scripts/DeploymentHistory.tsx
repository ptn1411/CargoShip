import { useEffect, useState, useCallback } from "react";
import {
  History,
  RefreshCw,
  Loader2,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  StopCircle,
  Server,
  Calendar,
  Search,
  ChevronDown,
} from "lucide-react";
import * as Select from "@radix-ui/react-select";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import {
  Deployment,
  DeploymentStatus,
  DeploymentFilters,
} from "../../lib/tauri";

interface DeploymentHistoryProps {
  /** Callback when a deployment is selected for viewing details */
  onViewDeployment: (deployment: Deployment) => void;
}

/**
 * DeploymentHistory component - List deployments with filters and status badges
 * Requirements: 7.1, 7.2
 */
export function DeploymentHistory({ onViewDeployment }: DeploymentHistoryProps) {
  const deployments = useAppStore((state) => state.deployments);
  const servers = useAppStore((state) => state.servers);
  const scripts = useAppStore((state) => state.scripts);
  const isLoadingDeployments = useAppStore((state) => state.isLoadingDeployments);
  const deploymentError = useAppStore((state) => state.deploymentError);

  const loadDeployments = useAppStore((state) => state.loadDeployments);
  const loadScripts = useAppStore((state) => state.loadScripts);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<DeploymentFilters>({});
  const [searchTerm, setSearchTerm] = useState("");

  // Load deployments and scripts on mount
  useEffect(() => {
    loadDeployments();
    loadScripts();
  }, [loadDeployments, loadScripts]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadDeployments(filters);
    setIsRefreshing(false);
  }, [loadDeployments, filters]);

  const handleApplyFilters = useCallback(async () => {
    await loadDeployments(filters);
  }, [loadDeployments, filters]);

  const handleClearFilters = useCallback(async () => {
    setFilters({});
    setSearchTerm("");
    await loadDeployments({});
  }, [loadDeployments]);

  const handleFilterChange = (key: keyof DeploymentFilters, value: string | undefined) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
    }));
  };

  // Filter deployments by search term (client-side)
  const filteredDeployments = deployments.filter((d) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      d.script_name.toLowerCase().includes(term) ||
      d.id.toLowerCase().includes(term) ||
      d.triggered_by.toLowerCase().includes(term)
    );
  });

  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined) || searchTerm;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Deployment History</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "p-2 rounded-md border border-border hover:bg-accent",
              showFilters && "bg-accent"
            )}
            title="Toggle Filters"
          >
            <Filter className="w-4 h-4" />
          </button>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-md border border-border hover:bg-accent disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="mb-4 p-4 rounded-lg border border-border bg-secondary/30">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search deployments..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Status Filter */}
            <StatusSelect
              value={filters.status}
              onChange={(value) => handleFilterChange("status", value)}
            />

            {/* Server Filter */}
            <ServerSelect
              servers={servers}
              value={filters.server_id}
              onChange={(value) => handleFilterChange("server_id", value)}
            />

            {/* Script Filter */}
            <ScriptSelect
              scripts={scripts}
              value={filters.script_id}
              onChange={(value) => handleFilterChange("script_id", value)}
            />
          </div>

          {/* Date Range */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">From Date</label>
              <input
                type="date"
                value={filters.from_date || ""}
                onChange={(e) => handleFilterChange("from_date", e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">To Date</label>
              <input
                type="date"
                value={filters.to_date || ""}
                onChange={(e) => handleFilterChange("to_date", e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Filter Actions */}
          <div className="mt-4 flex items-center justify-end gap-2">
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent"
              >
                Clear Filters
              </button>
            )}
            <button
              onClick={handleApplyFilters}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {deploymentError && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {deploymentError}
        </div>
      )}

      {/* Loading State */}
      {isLoadingDeployments && deployments.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!isLoadingDeployments && filteredDeployments.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
            <History className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No deployments found</h3>
          <p className="text-muted-foreground">
            {hasActiveFilters
              ? "Try adjusting your filters"
              : "Run a deployment script to see history here"}
          </p>
        </div>
      )}

      {/* Deployment List */}
      {filteredDeployments.length > 0 && (
        <div className="flex-1 overflow-auto space-y-2">
          {filteredDeployments.map((deployment) => (
            <DeploymentCard
              key={deployment.id}
              deployment={deployment}
              onClick={() => onViewDeployment(deployment)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface DeploymentCardProps {
  deployment: Deployment;
  onClick: () => void;
}

function DeploymentCard({ deployment, onClick }: DeploymentCardProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null) return "In progress...";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  return (
    <button
      onClick={onClick}
      className="w-full p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/50 transition-all text-left"
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: Script info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium truncate">{deployment.script_name}</h3>
            <StatusBadge status={deployment.status} />
          </div>
          <p className="text-xs text-muted-foreground truncate">
            ID: {deployment.id}
          </p>
        </div>

        {/* Right: Metadata */}
        <div className="text-right text-xs text-muted-foreground shrink-0">
          <div className="flex items-center gap-1 justify-end">
            <Calendar className="w-3 h-3" />
            {formatDate(deployment.started_at)}
          </div>
          <div className="flex items-center gap-1 justify-end mt-1">
            <Clock className="w-3 h-3" />
            {formatDuration(deployment.duration_ms)}
          </div>
        </div>
      </div>

      {/* Bottom: Additional info */}
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Server className="w-3 h-3" />
          {deployment.server_ids.length} server{deployment.server_ids.length !== 1 ? "s" : ""}
        </span>
        <span>by {deployment.triggered_by}</span>
        {deployment.rollback_of && (
          <span className="text-orange-500">Rollback of {deployment.rollback_of.slice(0, 8)}...</span>
        )}
      </div>
    </button>
  );
}

interface StatusBadgeProps {
  status: DeploymentStatus;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const getStatusConfig = (status: DeploymentStatus) => {
    switch (status) {
      case "success":
        return {
          icon: CheckCircle,
          label: "Success",
          className: "bg-green-500/10 text-green-500",
        };
      case "failed":
        return {
          icon: XCircle,
          label: "Failed",
          className: "bg-destructive/10 text-destructive",
        };
      case "running":
        return {
          icon: Loader2,
          label: "Running",
          className: "bg-primary/10 text-primary",
          animate: true,
        };
      case "pending":
        return {
          icon: Clock,
          label: "Pending",
          className: "bg-secondary text-muted-foreground",
        };
      case "cancelled":
        return {
          icon: StopCircle,
          label: "Cancelled",
          className: "bg-yellow-500/10 text-yellow-500",
        };
      case "partial":
        return {
          icon: AlertTriangle,
          label: "Partial",
          className: "bg-yellow-500/10 text-yellow-500",
        };
      case "rolled_back":
        return {
          icon: AlertTriangle,
          label: "Rolled Back",
          className: "bg-orange-500/10 text-orange-500",
        };
      case "rollback_failed":
        return {
          icon: XCircle,
          label: "Rollback Failed",
          className: "bg-destructive/10 text-destructive",
        };
      default:
        return {
          icon: Clock,
          label: status,
          className: "bg-secondary text-muted-foreground",
        };
    }
  };

  const config = getStatusConfig(status);
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        config.className
      )}
    >
      <Icon
        className={cn(
          size === "sm" ? "w-3 h-3" : "w-4 h-4",
          (config as { animate?: boolean }).animate && "animate-spin"
        )}
      />
      {config.label}
    </span>
  );
}

// ============================================================================
// Filter Select Components
// ============================================================================

interface StatusSelectProps {
  value: DeploymentStatus | undefined;
  onChange: (value: string | undefined) => void;
}

function StatusSelect({ value, onChange }: StatusSelectProps) {
  const statuses: { value: DeploymentStatus; label: string }[] = [
    { value: "success", label: "Success" },
    { value: "failed", label: "Failed" },
    { value: "running", label: "Running" },
    { value: "pending", label: "Pending" },
    { value: "cancelled", label: "Cancelled" },
    { value: "partial", label: "Partial" },
    { value: "rolled_back", label: "Rolled Back" },
    { value: "rollback_failed", label: "Rollback Failed" },
  ];

  return (
    <Select.Root value={value || ""} onValueChange={(v) => onChange(v || undefined)}>
      <Select.Trigger className="flex items-center justify-between w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
        <Select.Value placeholder="All Statuses" />
        <Select.Icon>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden">
          <Select.Viewport className="p-1">
            <Select.Item
              value=""
              className="flex items-center px-3 py-2 text-sm rounded cursor-pointer outline-none hover:bg-accent data-[highlighted]:bg-accent"
            >
              <Select.ItemText>All Statuses</Select.ItemText>
            </Select.Item>
            {statuses.map((status) => (
              <Select.Item
                key={status.value}
                value={status.value}
                className="flex items-center px-3 py-2 text-sm rounded cursor-pointer outline-none hover:bg-accent data-[highlighted]:bg-accent"
              >
                <Select.ItemText>{status.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

interface ServerSelectProps {
  servers: { id: string; name: string }[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

function ServerSelect({ servers, value, onChange }: ServerSelectProps) {
  return (
    <Select.Root value={value || ""} onValueChange={(v) => onChange(v || undefined)}>
      <Select.Trigger className="flex items-center justify-between w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
        <Select.Value placeholder="All Servers" />
        <Select.Icon>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden">
          <Select.Viewport className="p-1">
            <Select.Item
              value=""
              className="flex items-center px-3 py-2 text-sm rounded cursor-pointer outline-none hover:bg-accent data-[highlighted]:bg-accent"
            >
              <Select.ItemText>All Servers</Select.ItemText>
            </Select.Item>
            {servers.map((server) => (
              <Select.Item
                key={server.id}
                value={server.id}
                className="flex items-center px-3 py-2 text-sm rounded cursor-pointer outline-none hover:bg-accent data-[highlighted]:bg-accent"
              >
                <Select.ItemText>{server.name}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

interface ScriptSelectProps {
  scripts: { id: string; name: string }[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

function ScriptSelect({ scripts, value, onChange }: ScriptSelectProps) {
  return (
    <Select.Root value={value || ""} onValueChange={(v) => onChange(v || undefined)}>
      <Select.Trigger className="flex items-center justify-between w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
        <Select.Value placeholder="All Scripts" />
        <Select.Icon>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden">
          <Select.Viewport className="p-1">
            <Select.Item
              value=""
              className="flex items-center px-3 py-2 text-sm rounded cursor-pointer outline-none hover:bg-accent data-[highlighted]:bg-accent"
            >
              <Select.ItemText>All Scripts</Select.ItemText>
            </Select.Item>
            {scripts.map((script) => (
              <Select.Item
                key={script.id}
                value={script.id}
                className="flex items-center px-3 py-2 text-sm rounded cursor-pointer outline-none hover:bg-accent data-[highlighted]:bg-accent"
              >
                <Select.ItemText>{script.name}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
