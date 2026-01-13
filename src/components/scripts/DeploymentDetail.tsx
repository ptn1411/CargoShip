import { useState, useEffect, useRef } from "react";
import {
  X,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Clock,
  Server,
  Download,
  RotateCcw,
  Terminal,
  Copy,
  FileText,
  AlertTriangle,
  Info,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Collapsible from "@radix-ui/react-collapsible";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import {
  Deployment,
  DeploymentLog,
  StepStatus,
  RollbackInfo,
  deploymentApi,
} from "../../lib/tauri";
import { parseError } from "../../lib/errorHandler";
import { StatusBadge } from "./DeploymentHistory";
import { ConfirmDialog } from "../files/ConfirmDialog";

interface DeploymentDetailProps {
  /** Deployment to show details for */
  deployment: Deployment | null;
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog is closed */
  onOpenChange: (open: boolean) => void;
}

/**
 * DeploymentDetail component - Full deployment logs with collapsible sections
 * - Full logs with collapsible sections
 * - Export button
 * - Rollback button
 * Requirements: 7.3, 7.4, 8.2
 */
export function DeploymentDetail({
  deployment,
  open,
  onOpenChange,
}: DeploymentDetailProps) {
  const loadDeploymentLogs = useAppStore((state) => state.loadDeploymentLogs);
  const rollbackDeployment = useAppStore((state) => state.rollbackDeployment);
  const getRollbackInfo = useAppStore((state) => state.getRollbackInfo);
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);
  const [rollbackInfo, setRollbackInfo] = useState<RollbackInfo | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Load logs and rollback info when deployment changes
  useEffect(() => {
    if (deployment && open) {
      loadDeploymentLogs(deployment.id);
      
      // Load rollback info
      getRollbackInfo(deployment.id)
        .then(setRollbackInfo)
        .catch(() => setRollbackInfo(null));

      // Expand all steps by default
      const allStepKeys = deployment.logs.map(
        (log) => `${log.step_id}-${log.server_id}`
      );
      setExpandedSteps(new Set(allStepKeys));
    }
  }, [deployment, open, loadDeploymentLogs, getRollbackInfo]);

  // Toggle step expansion
  const toggleStep = (key: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Expand/collapse all
  const expandAll = () => {
    if (!deployment) return;
    const allKeys = deployment.logs.map((log) => `${log.step_id}-${log.server_id}`);
    setExpandedSteps(new Set(allKeys));
  };

  const collapseAll = () => {
    setExpandedSteps(new Set());
  };

  // Export logs
  const handleExport = async (format: "txt" | "json") => {
    if (!deployment) return;
    
    setIsExporting(true);
    try {
      const content = await deploymentApi.exportLogs(deployment.id, format);
      
      // Create download
      const blob = new Blob([content], {
        type: format === "json" ? "application/json" : "text/plain",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deployment-${deployment.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showSuccess("Logs exported", `Downloaded as ${format.toUpperCase()}`);
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    } finally {
      setIsExporting(false);
    }
  };

  // Rollback deployment
  const handleRollback = async () => {
    if (!deployment) return;
    
    setIsRollingBack(true);
    try {
      await rollbackDeployment(deployment.id);
      showSuccess("Rollback initiated", "Rollback deployment has started");
      setShowRollbackConfirm(false);
      onOpenChange(false);
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    } finally {
      setIsRollingBack(false);
    }
  };

  // Copy deployment ID
  const copyDeploymentId = () => {
    if (!deployment) return;
    navigator.clipboard.writeText(deployment.id);
    showSuccess("Copied", "Deployment ID copied to clipboard");
  };

  // Get status icon
  const getStatusIcon = (status: StepStatus) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-destructive" />;
      case "running":
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      case "pending":
        return <Clock className="w-4 h-4 text-muted-foreground" />;
      case "skipped":
        return <ChevronRight className="w-4 h-4 text-muted-foreground" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  // Format helpers
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null) return "-";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  // Filter logs by search term
  const filteredLogs = deployment?.logs.filter((log) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.step_name.toLowerCase().includes(term) ||
      log.server_name.toLowerCase().includes(term) ||
      log.output.toLowerCase().includes(term)
    );
  }) || [];

  // Group logs by server
  const logsByServer = filteredLogs.reduce((acc, log) => {
    if (!acc[log.server_id]) {
      acc[log.server_id] = {
        serverName: log.server_name,
        logs: [],
      };
    }
    acc[log.server_id].logs.push(log);
    return acc;
  }, {} as Record<string, { serverName: string; logs: DeploymentLog[] }>);

  // Check if can rollback
  const canRollback = rollbackInfo?.can_rollback && 
    (deployment?.status === "success" || deployment?.status === "failed" || deployment?.status === "partial");

  if (!deployment) return null;

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl max-h-[90vh] bg-background border border-border rounded-lg shadow-lg z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <Terminal className="w-5 h-5 text-primary" />
                <div>
                  <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
                    {deployment.script_name}
                    <StatusBadge status={deployment.status} size="md" />
                  </Dialog.Title>
                  <Dialog.Description className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="font-mono">{deployment.id.slice(0, 8)}...</span>
                    <button
                      onClick={copyDeploymentId}
                      className="p-0.5 rounded hover:bg-secondary"
                      title="Copy full ID"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button className="p-1 rounded hover:bg-secondary">
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>

            {/* Metadata Bar */}
            <div className="px-6 py-3 border-b border-border bg-secondary/30">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-6 text-sm">
                  <span className="flex items-center gap-1.5">
                    <Server className="w-4 h-4 text-muted-foreground" />
                    {deployment.server_ids.length} server{deployment.server_ids.length !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    {formatDuration(deployment.duration_ms)}
                  </span>
                  <span className="text-muted-foreground">
                    Started: {formatDate(deployment.started_at)}
                  </span>
                  {deployment.completed_at && (
                    <span className="text-muted-foreground">
                      Completed: {formatDate(deployment.completed_at)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Export Dropdown */}
                  <div className="relative group">
                    <button
                      disabled={isExporting}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent disabled:opacity-50"
                    >
                      {isExporting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      Export
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                      <button
                        onClick={() => handleExport("txt")}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-accent"
                      >
                        <FileText className="w-4 h-4" />
                        Export as TXT
                      </button>
                      <button
                        onClick={() => handleExport("json")}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-accent"
                      >
                        <FileText className="w-4 h-4" />
                        Export as JSON
                      </button>
                    </div>
                  </div>

                  {/* Rollback Button */}
                  {canRollback && (
                    <button
                      onClick={() => setShowRollbackConfirm(true)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-orange-500 text-white text-sm hover:bg-orange-600"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Rollback
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Variables Section */}
            {Object.keys(deployment.variables).length > 0 && (
              <div className="px-6 py-3 border-b border-border">
                <Collapsible.Root>
                  <Collapsible.Trigger className="flex items-center gap-2 text-sm font-medium hover:text-primary">
                    <Info className="w-4 h-4" />
                    Variables Used ({Object.keys(deployment.variables).length})
                    <ChevronDown className="w-4 h-4" />
                  </Collapsible.Trigger>
                  <Collapsible.Content>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                      {Object.entries(deployment.variables).map(([key, value]) => (
                        <div key={key} className="p-2 rounded bg-secondary/50 text-xs">
                          <span className="font-medium text-primary">{key}:</span>{" "}
                          <span className="font-mono">{value}</span>
                        </div>
                      ))}
                    </div>
                  </Collapsible.Content>
                </Collapsible.Root>
              </div>
            )}

            {/* Search and Controls */}
            <div className="px-6 py-3 border-b border-border flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-3 pr-8 py-1.5 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-secondary"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={expandAll}
                  className="px-2 py-1 text-xs rounded border border-border hover:bg-accent"
                >
                  Expand All
                </button>
                <button
                  onClick={collapseAll}
                  className="px-2 py-1 text-xs rounded border border-border hover:bg-accent"
                >
                  Collapse All
                </button>
              </div>
            </div>

            {/* Logs Content */}
            <div className="flex-1 overflow-auto p-4">
              {Object.keys(logsByServer).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Terminal className="w-8 h-8 mb-3" />
                  <p>No logs available</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(logsByServer).map(([serverId, { serverName, logs }]) => (
                    <ServerLogsSection
                      key={serverId}
                      serverId={serverId}
                      serverName={serverName}
                      logs={logs}
                      expandedSteps={expandedSteps}
                      onToggleStep={toggleStep}
                      getStatusIcon={getStatusIcon}
                      formatDuration={formatDuration}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Rollback Info */}
            {rollbackInfo && !rollbackInfo.can_rollback && rollbackInfo.reason_cannot_rollback && (
              <div className="px-6 py-3 border-t border-border bg-yellow-500/10">
                <div className="flex items-center gap-2 text-sm text-yellow-600">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Rollback unavailable: {rollbackInfo.reason_cannot_rollback}</span>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-border">
              <div className="text-xs text-muted-foreground">
                Triggered by: {deployment.triggered_by}
                {deployment.rollback_of && (
                  <span className="ml-2 text-orange-500">
                    (Rollback of {deployment.rollback_of.slice(0, 8)}...)
                  </span>
                )}
              </div>
              <Dialog.Close asChild>
                <button className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent">
                  Close
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Rollback Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showRollbackConfirm}
        title="Rollback Deployment"
        message="Are you sure you want to rollback this deployment? This will execute the rollback steps defined in the script."
        details={rollbackInfo ? `${rollbackInfo.rollback_step_count} rollback step(s) will be executed` : undefined}
        confirmText="Rollback"
        isDestructive
        isLoading={isRollingBack}
        onConfirm={handleRollback}
        onCancel={() => setShowRollbackConfirm(false)}
      />
    </>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface ServerLogsSectionProps {
  serverId: string;
  serverName: string;
  logs: DeploymentLog[];
  expandedSteps: Set<string>;
  onToggleStep: (key: string) => void;
  getStatusIcon: (status: StepStatus) => React.ReactNode;
  formatDuration: (ms: number | null) => string;
}

function ServerLogsSection({
  serverName,
  logs,
  expandedSteps,
  onToggleStep,
  getStatusIcon,
  formatDuration,
}: ServerLogsSectionProps) {
  // Calculate server summary
  const successCount = logs.filter((l) => l.status === "success").length;
  const failedCount = logs.filter((l) => l.status === "failed").length;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Server Header */}
      <div className="px-4 py-2 bg-secondary/50 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">{serverName}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {successCount > 0 && (
            <span className="flex items-center gap-1 text-green-500">
              <CheckCircle className="w-3 h-3" />
              {successCount}
            </span>
          )}
          {failedCount > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <XCircle className="w-3 h-3" />
              {failedCount}
            </span>
          )}
          <span className="text-muted-foreground">{logs.length} steps</span>
        </div>
      </div>

      {/* Steps */}
      <div className="divide-y divide-border">
        {logs.map((log) => {
          const key = `${log.step_id}-${log.server_id}`;
          return (
            <StepLogSection
              key={key}
              log={log}
              isExpanded={expandedSteps.has(key)}
              onToggle={() => onToggleStep(key)}
              getStatusIcon={getStatusIcon}
              formatDuration={formatDuration}
            />
          );
        })}
      </div>
    </div>
  );
}

interface StepLogSectionProps {
  log: DeploymentLog;
  isExpanded: boolean;
  onToggle: () => void;
  getStatusIcon: (status: StepStatus) => React.ReactNode;
  formatDuration: (ms: number | null) => string;
}

function StepLogSection({
  log,
  isExpanded,
  onToggle,
  getStatusIcon,
  formatDuration,
}: StepLogSectionProps) {
  const logRef = useRef<HTMLPreElement>(null);

  // Copy log output
  const copyOutput = () => {
    navigator.clipboard.writeText(log.output);
  };

  return (
    <Collapsible.Root open={isExpanded} onOpenChange={onToggle}>
      <Collapsible.Trigger asChild>
        <button className="w-full px-4 py-2 flex items-center gap-3 hover:bg-accent/50 transition-colors text-left">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          {getStatusIcon(log.status)}
          <span className="flex-1 font-medium text-sm">{log.step_name}</span>
          <span className="text-xs text-muted-foreground">
            {formatDuration(log.duration_ms)}
          </span>
          {log.exit_code !== null && (
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded",
                log.exit_code === 0
                  ? "bg-green-500/10 text-green-500"
                  : "bg-destructive/10 text-destructive"
              )}
            >
              Exit: {log.exit_code}
            </span>
          )}
        </button>
      </Collapsible.Trigger>

      <Collapsible.Content>
        <div className="px-4 pb-3">
          <div className="relative">
            <pre
              ref={logRef}
              className={cn(
                "p-3 rounded-md bg-zinc-900 text-zinc-100 text-xs font-mono overflow-auto max-h-80",
                "whitespace-pre-wrap break-all"
              )}
            >
              {log.output || (
                <span className="text-zinc-500 italic">No output</span>
              )}
            </pre>
            {log.output && (
              <button
                onClick={copyOutput}
                className="absolute top-2 right-2 p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                title="Copy output"
              >
                <Copy className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
