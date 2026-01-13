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
  StopCircle,
  AlertTriangle,
  Terminal,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Collapsible from "@radix-ui/react-collapsible";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import {
  Deployment,
  DeploymentStatus,
  StepStatus,
  deploymentEventApi,
  StepStartedPayload,
  StepOutputPayload,
  StepCompletedPayload,
  DeploymentCompletedPayload,
} from "../../lib/tauri";
import { parseError } from "../../lib/errorHandler";

interface DeploymentProgressProps {
  /** Deployment to show progress for */
  deployment: Deployment | null;
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog is closed */
  onOpenChange: (open: boolean) => void;
}

interface LiveLog {
  stepId: string;
  serverId: string;
  output: string;
  stderr: string;
  status: StepStatus;
  exitCode: number | null;
}

/**
 * DeploymentProgress component - Real-time deployment progress viewer
 * - Real-time log streaming
 * - Step progress indicators
 * - Cancel button
 * Requirements: 6.2, 6.3, 6.5, 6.6
 */
export function DeploymentProgress({
  deployment,
  open,
  onOpenChange,
}: DeploymentProgressProps) {
  const cancelDeployment = useAppStore((state) => state.cancelDeployment);
  const showError = useAppStore((state) => state.showError);
  const showWarning = useAppStore((state) => state.showWarning);

  const [liveLogs, setLiveLogs] = useState<Record<string, LiveLog>>({});
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [isCancelling, setIsCancelling] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<DeploymentStatus | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Initialize state when deployment changes
  useEffect(() => {
    if (deployment) {
      setCurrentStatus(deployment.status);
      // Expand all steps by default
      const allStepKeys = deployment.logs.map(
        (log) => `${log.step_id}-${log.server_id}`
      );
      setExpandedSteps(new Set(allStepKeys));
      
      // Initialize live logs from existing logs
      const initialLogs: Record<string, LiveLog> = {};
      deployment.logs.forEach((log) => {
        const key = `${log.step_id}-${log.server_id}`;
        initialLogs[key] = {
          stepId: log.step_id,
          serverId: log.server_id,
          output: log.output,
          stderr: log.stderr || "",
          status: log.status,
          exitCode: log.exit_code,
        };
      });
      setLiveLogs(initialLogs);
    }
  }, [deployment]);

  // Subscribe to deployment events
  useEffect(() => {
    if (!deployment || !open) return;

    const unsubscribers: (() => void)[] = [];

    const setupListeners = async () => {
      // Step started
      const unsubStepStarted = await deploymentEventApi.onStepStarted(
        (payload: StepStartedPayload) => {
          if (payload.deployment_id !== deployment.id) return;
          
          const key = `${payload.step_id}-${payload.server_id}`;
          setLiveLogs((prev) => ({
            ...prev,
            [key]: {
              stepId: payload.step_id,
              serverId: payload.server_id,
              output: "",
              stderr: "",
              status: "running",
              exitCode: null,
            },
          }));
          setExpandedSteps((prev) => new Set([...prev, key]));
        }
      );
      unsubscribers.push(unsubStepStarted);

      // Step output
      const unsubStepOutput = await deploymentEventApi.onStepOutput(
        (payload: StepOutputPayload) => {
          if (payload.deployment_id !== deployment.id) return;
          
          const key = `${payload.step_id}-${payload.server_id}`;
          setLiveLogs((prev) => ({
            ...prev,
            [key]: {
              ...prev[key],
              output: (prev[key]?.output || "") + payload.output,
            },
          }));
        }
      );
      unsubscribers.push(unsubStepOutput);

      // Step completed
      const unsubStepCompleted = await deploymentEventApi.onStepCompleted(
        (payload: StepCompletedPayload) => {
          if (payload.deployment_id !== deployment.id) return;
          
          const key = `${payload.step_id}-${payload.server_id}`;
          setLiveLogs((prev) => ({
            ...prev,
            [key]: {
              ...prev[key],
              status: payload.status as StepStatus,
              exitCode: payload.exit_code,
            },
          }));
        }
      );
      unsubscribers.push(unsubStepCompleted);

      // Deployment completed
      const unsubDeploymentCompleted = await deploymentEventApi.onDeploymentCompleted(
        (payload: DeploymentCompletedPayload) => {
          if (payload.deployment_id !== deployment.id) return;
          setCurrentStatus(payload.status as DeploymentStatus);
        }
      );
      unsubscribers.push(unsubDeploymentCompleted);
    };

    setupListeners();

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [deployment, open]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveLogs]);

  // Handle cancel deployment
  const handleCancel = async () => {
    if (!deployment) return;
    
    setIsCancelling(true);
    try {
      await cancelDeployment(deployment.id);
      showWarning("Deployment cancelled");
      setCurrentStatus("cancelled");
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    } finally {
      setIsCancelling(false);
    }
  };

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

  // Get status icon
  const getStatusIcon = (status: StepStatus | DeploymentStatus) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "failed":
      case "rollback_failed":
        return <XCircle className="w-4 h-4 text-destructive" />;
      case "running":
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      case "pending":
        return <Clock className="w-4 h-4 text-muted-foreground" />;
      case "skipped":
        return <ChevronRight className="w-4 h-4 text-muted-foreground" />;
      case "cancelled":
        return <StopCircle className="w-4 h-4 text-yellow-500" />;
      case "partial":
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case "rolled_back":
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  // Get status color
  const getStatusColor = (status: DeploymentStatus) => {
    switch (status) {
      case "success":
        return "text-green-500 bg-green-500/10";
      case "failed":
      case "rollback_failed":
        return "text-destructive bg-destructive/10";
      case "running":
        return "text-primary bg-primary/10";
      case "cancelled":
        return "text-yellow-500 bg-yellow-500/10";
      case "partial":
        return "text-yellow-500 bg-yellow-500/10";
      case "rolled_back":
        return "text-orange-500 bg-orange-500/10";
      default:
        return "text-muted-foreground bg-secondary";
    }
  };

  // Check if deployment is still running
  const isRunning = currentStatus === "running" || currentStatus === "pending";

  // Group logs by server
  const logsByServer = Object.entries(liveLogs).reduce((acc, [key, log]) => {
    if (!acc[log.serverId]) {
      acc[log.serverId] = [];
    }
    acc[log.serverId].push({ key, ...log });
    return acc;
  }, {} as Record<string, (LiveLog & { key: string })[]>);

  if (!deployment) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl max-h-[85vh] bg-background border border-border rounded-lg shadow-lg z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <Terminal className="w-5 h-5 text-primary" />
              <div>
                <Dialog.Title className="text-lg font-semibold">
                  {deployment.script_name}
                </Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  Deployment Progress
                </Dialog.Description>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Status Badge */}
              <span
                className={cn(
                  "px-3 py-1 rounded-full text-sm font-medium",
                  getStatusColor(currentStatus || deployment.status)
                )}
              >
                {(currentStatus || deployment.status).replace("_", " ")}
              </span>
              <Dialog.Close asChild>
                <button className="p-1 rounded hover:bg-secondary">
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Progress Overview */}
          <div className="px-6 py-3 border-b border-border bg-secondary/30">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <Server className="w-4 h-4" />
                  {deployment.server_ids.length} server
                  {deployment.server_ids.length !== 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  {deployment.duration_ms
                    ? `${(deployment.duration_ms / 1000).toFixed(1)}s`
                    : "In progress..."}
                </span>
              </div>
              {isRunning && (
                <button
                  onClick={handleCancel}
                  disabled={isCancelling}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground text-sm hover:bg-destructive/90 disabled:opacity-50"
                >
                  {isCancelling ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <StopCircle className="w-4 h-4" />
                  )}
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* Logs Content */}
          <div className="flex-1 overflow-auto p-4">
            {Object.keys(logsByServer).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin mb-3" />
                <p>Waiting for deployment to start...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(logsByServer).map(([serverId, logs]) => (
                  <ServerLogs
                    key={serverId}
                    serverName={
                      deployment.logs.find((l) => l.server_id === serverId)
                        ?.server_name || serverId
                    }
                    logs={logs}
                    expandedSteps={expandedSteps}
                    onToggleStep={toggleStep}
                    getStatusIcon={getStatusIcon}
                  />
                ))}
              </div>
            )}
            <div ref={logEndRef} />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-6 py-4 border-t border-border">
            <Dialog.Close asChild>
              <button className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent">
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}


// ============================================================================
// Sub-components
// ============================================================================

interface ServerLogsProps {
  serverName: string;
  logs: (LiveLog & { key: string })[];
  expandedSteps: Set<string>;
  onToggleStep: (key: string) => void;
  getStatusIcon: (status: StepStatus) => React.ReactNode;
}

function ServerLogs({
  serverName,
  logs,
  expandedSteps,
  onToggleStep,
  getStatusIcon,
}: ServerLogsProps) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Server Header */}
      <div className="px-4 py-2 bg-secondary/50 border-b border-border flex items-center gap-2">
        <Server className="w-4 h-4 text-muted-foreground" />
        <span className="font-medium">{serverName}</span>
      </div>

      {/* Steps */}
      <div className="divide-y divide-border">
        {logs.map((log) => (
          <StepLog
            key={log.key}
            stepId={log.stepId}
            output={log.output}
            stderr={log.stderr}
            status={log.status}
            exitCode={log.exitCode}
            isExpanded={expandedSteps.has(log.key)}
            onToggle={() => onToggleStep(log.key)}
            getStatusIcon={getStatusIcon}
          />
        ))}
      </div>
    </div>
  );
}

interface StepLogProps {
  stepId: string;
  output: string;
  stderr: string;
  status: StepStatus;
  exitCode: number | null;
  isExpanded: boolean;
  onToggle: () => void;
  getStatusIcon: (status: StepStatus) => React.ReactNode;
}

function StepLog({
  stepId,
  output,
  stderr,
  status,
  exitCode,
  isExpanded,
  onToggle,
  getStatusIcon,
}: StepLogProps) {
  const logRef = useRef<HTMLPreElement>(null);
  const [activeTab, setActiveTab] = useState<"stdout" | "stderr">("stdout");

  // Auto-scroll log content when new output arrives
  useEffect(() => {
    if (isExpanded && logRef.current && status === "running") {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [output, stderr, isExpanded, status]);

  const hasStdout = output && output.trim().length > 0;
  const hasStderr = stderr && stderr.trim().length > 0;

  return (
    <Collapsible.Root open={isExpanded} onOpenChange={onToggle}>
      <Collapsible.Trigger asChild>
        <button className="w-full px-4 py-2 flex items-center gap-3 hover:bg-accent/50 transition-colors text-left">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          {getStatusIcon(status)}
          <span className="flex-1 font-medium text-sm">{stepId}</span>
          {hasStderr && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
              stderr
            </span>
          )}
          {exitCode !== null && (
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded",
                exitCode === 0
                  ? "bg-green-500/10 text-green-500"
                  : "bg-destructive/10 text-destructive"
              )}
            >
              Exit: {exitCode}
            </span>
          )}
        </button>
      </Collapsible.Trigger>

      <Collapsible.Content>
        <div className="px-4 pb-3">
          {/* Tabs for stdout/stderr */}
          <div className="flex items-center gap-1 mb-2">
            <button
              onClick={(e) => { e.stopPropagation(); setActiveTab("stdout"); }}
              className={cn(
                "px-3 py-1 text-xs rounded-t-md transition-colors",
                activeTab === "stdout"
                  ? "bg-zinc-900 text-zinc-100"
                  : "bg-zinc-800/50 text-zinc-400 hover:text-zinc-200"
              )}
            >
              stdout {hasStdout && <span className="ml-1 text-green-400">●</span>}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setActiveTab("stderr"); }}
              className={cn(
                "px-3 py-1 text-xs rounded-t-md transition-colors",
                activeTab === "stderr"
                  ? "bg-zinc-900 text-zinc-100"
                  : "bg-zinc-800/50 text-zinc-400 hover:text-zinc-200"
              )}
            >
              stderr {hasStderr && <span className="ml-1 text-red-400">●</span>}
            </button>
          </div>

          <pre
            ref={logRef}
            className={cn(
              "p-3 rounded-md rounded-tl-none bg-zinc-900 text-xs font-mono overflow-auto max-h-64",
              "whitespace-pre-wrap break-all",
              activeTab === "stderr" ? "text-red-300" : "text-zinc-100"
            )}
          >
            {activeTab === "stdout" ? (
              hasStdout ? output : (
                <span className="text-zinc-500 italic">
                  {status === "running" ? "Waiting for output..." : "No stdout output"}
                </span>
              )
            ) : (
              hasStderr ? stderr : (
                <span className="text-zinc-500 italic">
                  {status === "running" ? "Waiting for stderr..." : "No stderr output"}
                </span>
              )
            )}
          </pre>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

// ============================================================================
// Compact Progress Indicator (for use in other components)
// ============================================================================

interface DeploymentProgressIndicatorProps {
  deployment: Deployment;
  onClick?: () => void;
}

export function DeploymentProgressIndicator({
  deployment,
  onClick,
}: DeploymentProgressIndicatorProps) {
  const isRunning = deployment.status === "running" || deployment.status === "pending";

  const getStatusColor = (status: DeploymentStatus) => {
    switch (status) {
      case "success":
        return "bg-green-500";
      case "failed":
      case "rollback_failed":
        return "bg-destructive";
      case "running":
        return "bg-primary";
      case "cancelled":
        return "bg-yellow-500";
      case "partial":
        return "bg-yellow-500";
      case "rolled_back":
        return "bg-orange-500";
      default:
        return "bg-muted-foreground";
    }
  };

  // Calculate progress percentage
  const totalSteps = deployment.logs.length;
  const completedSteps = deployment.logs.filter(
    (l) => l.status === "success" || l.status === "failed" || l.status === "skipped"
  ).length;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 rounded-md border border-border hover:bg-accent transition-colors w-full text-left"
    >
      {isRunning ? (
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
      ) : (
        <div className={cn("w-3 h-3 rounded-full", getStatusColor(deployment.status))} />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{deployment.script_name}</div>
        <div className="text-xs text-muted-foreground">
          {isRunning
            ? `${completedSteps}/${totalSteps} steps`
            : deployment.status.replace("_", " ")}
        </div>
      </div>
      {isRunning && (
        <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </button>
  );
}
