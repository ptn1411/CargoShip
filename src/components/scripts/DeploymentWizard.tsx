import { useState, useEffect, useCallback } from "react";
import {
  X,
  ChevronRight,
  ChevronLeft,
  Server,
  Variable,
  Eye,
  Play,
  Loader2,
  CheckCircle,
  AlertCircle,
  Info,
  FolderOpen,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import {
  DeploymentScript,
  Variable as ScriptVariable,
  ExecutionConfig,
  DryRunResult,
  Server as ServerType,
  ServerGroup,
  Deployment,
} from "../../lib/tauri";
import { parseError } from "../../lib/errorHandler";

interface DeploymentWizardProps {
  /** Script to deploy */
  script: DeploymentScript;
  /** Whether the wizard is open */
  open: boolean;
  /** Callback when wizard is closed */
  onOpenChange: (open: boolean) => void;
  /** Callback when deployment starts - receives deployment object for showing progress */
  onDeploymentStarted?: (deploymentId: string, deployment: Deployment) => void;
}

type WizardStep = "servers" | "variables" | "review";

/**
 * DeploymentWizard component - Multi-step wizard for deployment execution
 * - Server selection
 * - Variable input form
 * - Review step
 * Requirements: 5.1
 */
export function DeploymentWizard({
  script,
  open,
  onOpenChange,
  onDeploymentStarted,
}: DeploymentWizardProps) {
  const servers = useAppStore((state) => state.servers);
  const groups = useAppStore((state) => state.groups);
  const loadServers = useAppStore((state) => state.loadServers);
  const loadGroups = useAppStore((state) => state.loadGroups);
  const startDeployment = useAppStore((state) => state.startDeployment);
  const dryRunDeployment = useAppStore((state) => state.dryRunDeployment);
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [currentStep, setCurrentStep] = useState<WizardStep>("servers");
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [parallelExecution, setParallelExecution] = useState(true);
  const [sudoPassword, setSudoPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Load servers and groups on mount
  useEffect(() => {
    if (open) {
      if (servers.length === 0) {
        loadServers();
      }
      loadGroups();
    }
  }, [open, servers.length, loadServers, loadGroups]);

  // Initialize variable values with defaults
  useEffect(() => {
    if (open && script) {
      const defaults: Record<string, string> = {};
      script.variables.forEach((v) => {
        if (v.default_value) {
          defaults[v.name] = v.default_value;
        }
      });
      setVariableValues(defaults);
      setSelectedServerIds([]);
      setCurrentStep("servers");
      setDryRunResult(null);
      setValidationErrors([]);
      setSudoPassword("");
    }
  }, [open, script]);

  // Validate current step
  const validateStep = useCallback((): boolean => {
    const errors: string[] = [];

    if (currentStep === "servers") {
      if (selectedServerIds.length === 0) {
        errors.push("Please select at least one server");
      }
    } else if (currentStep === "variables") {
      script.variables.forEach((v) => {
        if (v.required && !variableValues[v.name]?.trim()) {
          errors.push(`Variable "${v.name}" is required`);
        }
      });
    }

    setValidationErrors(errors);
    return errors.length === 0;
  }, [currentStep, selectedServerIds, variableValues, script.variables]);

  // Handle next step
  const handleNext = () => {
    if (!validateStep()) return;

    if (currentStep === "servers") {
      setCurrentStep("variables");
    } else if (currentStep === "variables") {
      setCurrentStep("review");
    }
  };

  // Handle previous step
  const handleBack = () => {
    if (currentStep === "variables") {
      setCurrentStep("servers");
    } else if (currentStep === "review") {
      setCurrentStep("variables");
    }
  };

  // Handle server selection
  const handleServerToggle = (serverId: string) => {
    setSelectedServerIds((prev) =>
      prev.includes(serverId)
        ? prev.filter((id) => id !== serverId)
        : [...prev, serverId]
    );
    setValidationErrors([]);
  };

  // Handle select all servers
  const handleSelectAll = () => {
    if (selectedServerIds.length === servers.length) {
      setSelectedServerIds([]);
    } else {
      setSelectedServerIds(servers.map((s) => s.id));
    }
  };

  // Handle group selection - select all servers in the group
  const handleGroupSelect = (group: ServerGroup) => {
    const groupServerIds = group.server_ids.filter((id) =>
      servers.some((s) => s.id === id)
    );
    
    // Check if all servers in the group are already selected
    const allSelected = groupServerIds.every((id) => selectedServerIds.includes(id));
    
    if (allSelected) {
      // Deselect all servers in the group
      setSelectedServerIds((prev) => prev.filter((id) => !groupServerIds.includes(id)));
    } else {
      // Select all servers in the group
      setSelectedServerIds((prev) => [...new Set([...prev, ...groupServerIds])]);
    }
    setValidationErrors([]);
  };

  // Handle variable change
  const handleVariableChange = (name: string, value: string) => {
    setVariableValues((prev) => ({ ...prev, [name]: value }));
    setValidationErrors([]);
  };

  // Handle dry run
  const handleDryRun = async () => {
    if (!validateStep()) return;

    setIsDryRunning(true);
    try {
      const config: ExecutionConfig = {
        script_id: script.id,
        server_ids: selectedServerIds,
        variables: variableValues,
        parallel: parallelExecution,
        dry_run: true,
      };
      const result = await dryRunDeployment(config);
      setDryRunResult(result);
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    } finally {
      setIsDryRunning(false);
    }
  };

  // Handle deployment start
  const handleStartDeployment = async () => {
    if (!validateStep()) return;

    setIsSubmitting(true);
    try {
      const config: ExecutionConfig = {
        script_id: script.id,
        server_ids: selectedServerIds,
        variables: variableValues,
        parallel: parallelExecution,
        dry_run: false,
        sudo_password: sudoPassword || undefined,
      };
      const deployment = await startDeployment(config);
      showSuccess("Deployment started", `Deploying ${script.name}`);
      onOpenChange(false);
      onDeploymentStarted?.(deployment.id, deployment);
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get selected servers
  const selectedServers = servers.filter((s) => selectedServerIds.includes(s.id));

  // Step indicator
  const steps: { key: WizardStep; label: string; icon: React.ReactNode }[] = [
    { key: "servers", label: "Servers", icon: <Server className="w-4 h-4" /> },
    { key: "variables", label: "Variables", icon: <Variable className="w-4 h-4" /> },
    { key: "review", label: "Review", icon: <Eye className="w-4 h-4" /> },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === currentStep);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[85vh] bg-background border border-border rounded-lg shadow-lg z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <Dialog.Title className="text-lg font-semibold">
                Deploy: {script.name}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                Configure and start deployment
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Step Indicator */}
          <div className="px-6 py-3 border-b border-border">
            <div className="flex items-center justify-between">
              {steps.map((step, index) => (
                <div key={step.key} className="flex items-center">
                  <div
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm",
                      index === currentStepIndex
                        ? "bg-primary text-primary-foreground"
                        : index < currentStepIndex
                        ? "bg-green-500/10 text-green-500"
                        : "bg-secondary text-muted-foreground"
                    )}
                  >
                    {index < currentStepIndex ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      step.icon
                    )}
                    <span>{step.label}</span>
                  </div>
                  {index < steps.length - 1 && (
                    <ChevronRight className="w-4 h-4 mx-2 text-muted-foreground" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <div className="flex items-center gap-2 text-destructive text-sm font-medium mb-1">
                  <AlertCircle className="w-4 h-4" />
                  Please fix the following errors:
                </div>
                <ul className="text-sm text-destructive list-disc list-inside">
                  {validationErrors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Step: Server Selection */}
            {currentStep === "servers" && (
              <ServerSelectionStep
                servers={servers}
                groups={groups}
                selectedServerIds={selectedServerIds}
                onToggle={handleServerToggle}
                onSelectAll={handleSelectAll}
                onGroupSelect={handleGroupSelect}
              />
            )}

            {/* Step: Variable Input */}
            {currentStep === "variables" && (
              <VariableInputStep
                variables={script.variables}
                values={variableValues}
                onChange={handleVariableChange}
              />
            )}

            {/* Step: Review */}
            {currentStep === "review" && (
              <ReviewStep
                script={script}
                selectedServers={selectedServers}
                variableValues={variableValues}
                parallelExecution={parallelExecution}
                onParallelChange={setParallelExecution}
                sudoPassword={sudoPassword}
                onSudoPasswordChange={setSudoPassword}
                dryRunResult={dryRunResult}
                isDryRunning={isDryRunning}
                onDryRun={handleDryRun}
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            <button
              onClick={handleBack}
              disabled={currentStep === "servers"}
              className="flex items-center gap-2 px-4 py-2 rounded-md border border-border text-sm hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            <div className="flex items-center gap-2">
              {currentStep === "review" ? (
                <button
                  onClick={handleStartDeployment}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Start Deployment
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}


// ============================================================================
// Sub-components for each wizard step
// ============================================================================

interface ServerSelectionStepProps {
  servers: ServerType[];
  groups: ServerGroup[];
  selectedServerIds: string[];
  onToggle: (serverId: string) => void;
  onSelectAll: () => void;
  onGroupSelect: (group: ServerGroup) => void;
}

function ServerSelectionStep({
  servers,
  groups,
  selectedServerIds,
  onToggle,
  onSelectAll,
  onGroupSelect,
}: ServerSelectionStepProps) {
  const [selectionMode, setSelectionMode] = useState<"servers" | "groups">("servers");
  const allSelected = selectedServerIds.length === servers.length && servers.length > 0;

  // Group servers by environment
  const serversByEnv = servers.reduce((acc, server) => {
    const env = server.environment || "dev";
    if (!acc[env]) acc[env] = [];
    acc[env].push(server);
    return acc;
  }, {} as Record<string, ServerType[]>);

  const envOrder = ["prod", "staging", "dev"];
  const envLabels: Record<string, string> = {
    prod: "Production",
    staging: "Staging",
    dev: "Development",
  };

  // Check if a group is fully selected
  const isGroupFullySelected = (group: ServerGroup) => {
    const validServerIds = group.server_ids.filter((id) =>
      servers.some((s) => s.id === id)
    );
    return validServerIds.length > 0 && validServerIds.every((id) => selectedServerIds.includes(id));
  };

  // Check if a group is partially selected
  const isGroupPartiallySelected = (group: ServerGroup) => {
    const validServerIds = group.server_ids.filter((id) =>
      servers.some((s) => s.id === id)
    );
    const selectedCount = validServerIds.filter((id) => selectedServerIds.includes(id)).length;
    return selectedCount > 0 && selectedCount < validServerIds.length;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Select Target Servers</h3>
          <p className="text-sm text-muted-foreground">
            Choose servers individually or select a group
          </p>
        </div>
        {selectionMode === "servers" && (
          <button
            onClick={onSelectAll}
            className="text-sm text-primary hover:underline"
          >
            {allSelected ? "Deselect All" : "Select All"}
          </button>
        )}
      </div>

      {/* Selection Mode Toggle */}
      {groups.length > 0 && (
        <div className="flex gap-2 p-1 bg-secondary rounded-lg">
          <button
            onClick={() => setSelectionMode("servers")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
              selectionMode === "servers"
                ? "bg-background shadow-sm"
                : "hover:bg-background/50"
            )}
          >
            <Server className="w-4 h-4" />
            Individual Servers
          </button>
          <button
            onClick={() => setSelectionMode("groups")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
              selectionMode === "groups"
                ? "bg-background shadow-sm"
                : "hover:bg-background/50"
            )}
          >
            <FolderOpen className="w-4 h-4" />
            Server Groups
          </button>
        </div>
      )}

      {servers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No servers available</p>
          <p className="text-sm">Add servers in the Servers panel first</p>
        </div>
      ) : selectionMode === "groups" ? (
        /* Group Selection Mode */
        <div className="space-y-2">
          {groups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No groups available</p>
              <p className="text-sm">Create groups to organize servers</p>
            </div>
          ) : (
            groups.map((group) => {
              const validServerCount = group.server_ids.filter((id) =>
                servers.some((s) => s.id === id)
              ).length;
              const isFullySelected = isGroupFullySelected(group);
              const isPartiallySelected = isGroupPartiallySelected(group);

              return (
                <label
                  key={group.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                    isFullySelected
                      ? "border-primary bg-primary/5"
                      : isPartiallySelected
                      ? "border-primary/50 bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isFullySelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isPartiallySelected;
                    }}
                    onChange={() => onGroupSelect(group)}
                    className="w-4 h-4 rounded border-border"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium truncate">{group.name}</span>
                    </div>
                    {group.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {group.description}
                      </p>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {validServerCount} server{validServerCount !== 1 ? "s" : ""}
                  </span>
                </label>
              );
            })
          )}
        </div>
      ) : (
        /* Individual Server Selection Mode */
        <div className="space-y-4">
          {envOrder.map((env) => {
            const envServers = serversByEnv[env];
            if (!envServers || envServers.length === 0) return null;

            return (
              <div key={env}>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  {envLabels[env]}
                </h4>
                <div className="space-y-2">
                  {envServers.map((server) => (
                    <ServerCheckbox
                      key={server.id}
                      server={server}
                      isSelected={selectedServerIds.includes(server.id)}
                      onToggle={() => onToggle(server.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedServerIds.length > 0 && (
        <div className="mt-4 p-3 rounded-md bg-secondary/50 text-sm">
          <span className="font-medium">{selectedServerIds.length}</span> server
          {selectedServerIds.length !== 1 ? "s" : ""} selected
        </div>
      )}
    </div>
  );
}

interface ServerCheckboxProps {
  server: ServerType;
  isSelected: boolean;
  onToggle: () => void;
}

function ServerCheckbox({ server, isSelected, onToggle }: ServerCheckboxProps) {
  const envColors: Record<string, string> = {
    prod: "bg-red-500/10 text-red-500 border-red-500/20",
    staging: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    dev: "bg-green-500/10 text-green-500 border-green-500/20",
  };

  return (
    <label
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50"
      )}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="w-4 h-4 rounded border-border"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{server.name}</span>
          <span
            className={cn(
              "px-2 py-0.5 rounded text-xs border",
              envColors[server.environment] || envColors.dev
            )}
          >
            {server.environment}
          </span>
        </div>
        <div className="text-sm text-muted-foreground truncate">
          {server.username}@{server.host}:{server.port}
        </div>
      </div>
    </label>
  );
}

interface VariableInputStepProps {
  variables: ScriptVariable[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
}

function VariableInputStep({
  variables,
  values,
  onChange,
}: VariableInputStepProps) {
  if (variables.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Variable className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No variables defined</p>
        <p className="text-sm">This script has no configurable variables</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">Configure Variables</h3>
        <p className="text-sm text-muted-foreground">
          Provide values for script variables
        </p>
      </div>

      <div className="space-y-4">
        {variables.map((variable) => (
          <VariableInput
            key={variable.name}
            variable={variable}
            value={values[variable.name] || ""}
            onChange={(value) => onChange(variable.name, value)}
          />
        ))}
      </div>
    </div>
  );
}

interface VariableInputProps {
  variable: ScriptVariable;
  value: string;
  onChange: (value: string) => void;
}

function VariableInput({ variable, value, onChange }: VariableInputProps) {
  const isSecret = variable.var_type === "secret";

  return (
    <div>
      <label className="block text-sm font-medium mb-1">
        {variable.name}
        {variable.required && <span className="text-destructive ml-1">*</span>}
      </label>
      {variable.description && (
        <p className="text-xs text-muted-foreground mb-1.5">
          {variable.description}
        </p>
      )}
      {variable.var_type === "boolean" ? (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
            className="w-4 h-4 rounded border-border"
          />
          <span className="text-sm text-muted-foreground">
            {value === "true" ? "Enabled" : "Disabled"}
          </span>
        </div>
      ) : (
        <input
          type={isSecret ? "password" : variable.var_type === "number" ? "number" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={variable.default_value || `Enter ${variable.name}`}
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      )}
      {variable.default_value && !value && (
        <p className="text-xs text-muted-foreground mt-1">
          Default: {isSecret ? "••••••••" : variable.default_value}
        </p>
      )}
    </div>
  );
}

interface ReviewStepProps {
  script: DeploymentScript;
  selectedServers: ServerType[];
  variableValues: Record<string, string>;
  parallelExecution: boolean;
  onParallelChange: (parallel: boolean) => void;
  sudoPassword: string;
  onSudoPasswordChange: (password: string) => void;
  dryRunResult: DryRunResult | null;
  isDryRunning: boolean;
  onDryRun: () => void;
}

function ReviewStep({
  script,
  selectedServers,
  variableValues,
  parallelExecution,
  onParallelChange,
  sudoPassword,
  onSudoPasswordChange,
  dryRunResult,
  isDryRunning,
  onDryRun,
}: ReviewStepProps) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div>
        <h3 className="font-medium mb-3">Deployment Summary</h3>
        <div className="space-y-3 p-4 rounded-lg bg-secondary/30 border border-border">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Script</span>
            <span className="font-medium">{script.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Steps</span>
            <span>{script.steps.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Target Servers</span>
            <span>{selectedServers.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Variables</span>
            <span>{Object.keys(variableValues).filter((k) => variableValues[k]).length}</span>
          </div>
        </div>
      </div>

      {/* Servers */}
      <div>
        <h4 className="text-sm font-medium mb-2">Target Servers</h4>
        <div className="flex flex-wrap gap-2">
          {selectedServers.map((server) => (
            <span
              key={server.id}
              className="px-2 py-1 rounded-md bg-secondary text-sm"
            >
              {server.name}
            </span>
          ))}
        </div>
      </div>

      {/* Variables */}
      {Object.keys(variableValues).filter((k) => variableValues[k]).length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Variable Values</h4>
          <div className="space-y-1 text-sm">
            {Object.entries(variableValues)
              .filter(([, v]) => v)
              .map(([name, value]) => {
                const variable = script.variables.find((v) => v.name === name);
                const isSecret = variable?.var_type === "secret";
                return (
                  <div key={name} className="flex justify-between">
                    <span className="text-muted-foreground">{name}</span>
                    <span className="font-mono">
                      {isSecret ? "••••••••" : value}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Execution Mode */}
      <div>
        <h4 className="text-sm font-medium mb-2">Execution Mode</h4>
        <div className="flex gap-2">
          <button
            onClick={() => onParallelChange(true)}
            className={cn(
              "flex-1 px-3 py-2 rounded-md border text-sm transition-colors",
              parallelExecution
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input hover:bg-accent"
            )}
          >
            Parallel
          </button>
          <button
            onClick={() => onParallelChange(false)}
            className={cn(
              "flex-1 px-3 py-2 rounded-md border text-sm transition-colors",
              !parallelExecution
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input hover:bg-accent"
            )}
          >
            Sequential
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {parallelExecution
            ? "Execute on all servers simultaneously"
            : "Execute on servers one at a time"}
        </p>
      </div>

      {/* Sudo Password */}
      <div>
        <h4 className="text-sm font-medium mb-2">Sudo Password (Optional)</h4>
        <input
          type="password"
          value={sudoPassword}
          onChange={(e) => onSudoPasswordChange(e.target.value)}
          placeholder="Enter sudo password if required"
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Required if script contains sudo commands and user needs password authentication
        </p>
      </div>

      {/* Dry Run */}
      <div className="p-4 rounded-lg border border-border bg-secondary/20">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-primary mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-medium">Preview Commands</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Run a dry-run to see the exact commands that will be executed
            </p>
            <button
              onClick={onDryRun}
              disabled={isDryRunning}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent disabled:opacity-50"
            >
              {isDryRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              {isDryRunning ? "Running..." : "Dry Run"}
            </button>
          </div>
        </div>

        {/* Dry Run Result */}
        {dryRunResult && (
          <div className="mt-4 pt-4 border-t border-border">
            <h5 className="text-sm font-medium mb-2">
              Dry Run Result: {dryRunResult.total_steps} steps
            </h5>
            <div className="max-h-48 overflow-auto space-y-2">
              {dryRunResult.servers.map((server) => (
                <div key={server.server_id} className="text-sm">
                  <div className="font-medium text-muted-foreground">
                    {server.server_name}
                  </div>
                  {server.steps.map((step) => (
                    <div
                      key={step.step_id}
                      className={cn(
                        "ml-4 py-1",
                        !step.will_execute && "opacity-50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {step.will_execute ? (
                          <CheckCircle className="w-3 h-3 text-green-500" />
                        ) : (
                          <AlertCircle className="w-3 h-3 text-muted-foreground" />
                        )}
                        <span>{step.step_name}</span>
                      </div>
                      {step.skip_reason && (
                        <div className="ml-5 text-xs text-muted-foreground">
                          Skip: {step.skip_reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
