import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

// ============================================================================
// Script Types
// ============================================================================

export type VariableType = "string" | "number" | "boolean" | "secret";

export interface Variable {
  name: string;
  description: string;
  default_value: string | null;
  required: boolean;
  var_type: VariableType;
}

export type OnError = "abort" | "continue" | "rollback";

export interface Step {
  id: string;
  name: string;
  commands: string[];
  working_dir: string | null;
  env: Record<string, string>;
  condition: string | null;
  on_error: OnError;
  timeout: number | null;
}

export interface DeploymentScript {
  id: string;
  name: string;
  description: string;
  variables: Variable[];
  steps: Step[];
  rollback_steps: Step[];
  tags: string[];
  is_template: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateScriptInput {
  name: string;
  description?: string;
  variables?: Variable[];
  steps?: Step[];
  rollback_steps?: Step[];
  tags?: string[];
  is_template?: boolean;
}

export interface UpdateScriptInput {
  name?: string;
  description?: string;
  variables?: Variable[];
  steps?: Step[];
  rollback_steps?: Step[];
  tags?: string[];
  is_template?: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export interface TemplateInfo {
  name: string;
  description: string;
  category: string;
  variables: Variable[];
}

// ============================================================================
// Deployment Types
// ============================================================================

export type DeploymentStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "partial"
  | "cancelled"
  | "rolled_back"
  | "rollback_failed";

export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface DeploymentLog {
  id: string;
  deployment_id: string;
  step_id: string;
  step_name: string;
  server_id: string;
  server_name: string;
  output: string;
  stderr: string;
  exit_code: number | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  status: StepStatus;
}

export interface Deployment {
  id: string;
  script_id: string;
  script_name: string;
  server_ids: string[];
  variables: Record<string, string>;
  status: DeploymentStatus;
  logs: DeploymentLog[];
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  triggered_by: string;
  rollback_of: string | null;
}

export interface DeploymentFilters {
  server_id?: string;
  script_id?: string;
  status?: DeploymentStatus;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

export interface ExecutionConfig {
  script_id: string;
  server_ids: string[];
  variables: Record<string, string>;
  parallel?: boolean;
  dry_run?: boolean;
  sudo_password?: string;
  validate_prerequisites?: boolean;
}

export interface DryRunStep {
  step_id: string;
  step_name: string;
  commands: string[];
  working_dir: string | null;
  condition: string | null;
  condition_result: boolean | null;
  will_execute: boolean;
  skip_reason: string | null;
  warnings: string[];
}

export interface DryRunServer {
  server_id: string;
  server_name: string;
  steps: DryRunStep[];
  warnings: string[];
  ssh_reachable: boolean | null;
}

export interface DryRunResult {
  script_name: string;
  servers: DryRunServer[];
  total_steps: number;
  validated: boolean;
}

export interface RollbackInfo {
  deployment_id: string;
  can_rollback: boolean;
  has_rollback_steps: boolean;
  rollback_step_count: number;
  rollback_step_names: string[];
  reason_cannot_rollback: string | null;
}

// ============================================================================
// Deployment Event Payloads
// ============================================================================

export interface DeploymentStartedPayload {
  deployment_id: string;
  script_name: string;
  server_count: number;
}

export interface StepStartedPayload {
  deployment_id: string;
  step_id: string;
  step_name: string;
  server_id: string;
}

export interface StepOutputPayload {
  deployment_id: string;
  step_id: string;
  server_id: string;
  output: string;
}

export interface StepCompletedPayload {
  deployment_id: string;
  step_id: string;
  server_id: string;
  status: string;
  exit_code: number | null;
}

export interface DeploymentCompletedPayload {
  deployment_id: string;
  status: string;
  duration_ms: number;
}

// ============================================================================
// Script Management API
// ============================================================================

export const scriptApi = {
  list: () => invoke<DeploymentScript[]>("list_scripts"),
  get: (id: string) => invoke<DeploymentScript>("get_script", { id }),
  create: (input: CreateScriptInput) => invoke<DeploymentScript>("create_script", { input }),
  update: (id: string, input: UpdateScriptInput) => invoke<DeploymentScript>("update_script", { id, input }),
  delete: (id: string) => invoke<void>("delete_script", { id }),
  duplicate: (id: string) => invoke<DeploymentScript>("duplicate_script", { id }),
  export: (id: string) => invoke<string>("export_script", { id }),
  import: (yaml: string) => invoke<DeploymentScript>("import_script", { yaml }),
  validate: (script: DeploymentScript) => invoke<ValidationResult>("validate_script", { script }),
};

// ============================================================================
// Template Library API
// ============================================================================

export const templateApi = {
  list: () => invoke<TemplateInfo[]>("list_templates"),
  get: (name: string) => invoke<DeploymentScript>("get_template", { name }),
  createFromTemplate: (templateName: string) => invoke<DeploymentScript>("create_from_template", { templateName }),
};

// ============================================================================
// Deployment Execution API
// ============================================================================

export const deploymentApi = {
  start: (config: ExecutionConfig) => invoke<Deployment>("start_deployment", { config }),
  cancel: (deploymentId: string) => invoke<void>("cancel_deployment", { deploymentId }),
  dryRun: (config: ExecutionConfig) => invoke<DryRunResult>("dry_run_deployment", { config }),
  list: (filters: DeploymentFilters) => invoke<Deployment[]>("list_deployments", { filters }),
  get: (id: string) => invoke<Deployment>("get_deployment", { id }),
  getLogs: (deploymentId: string) => invoke<DeploymentLog[]>("get_deployment_logs", { deploymentId }),
  exportLogs: (deploymentId: string, format: string) => invoke<string>("export_deployment_logs", { deploymentId, format }),
  searchLogs: (deploymentId: string, searchTerm: string) => invoke<DeploymentLog[]>("search_deployment_logs", { deploymentId, searchTerm }),
};

// ============================================================================
// Rollback API
// ============================================================================

export const rollbackApi = {
  execute: (deploymentId: string) => invoke<Deployment>("rollback_deployment", { deploymentId }),
  canRollback: (deploymentId: string) => invoke<boolean>("can_rollback_deployment", { deploymentId }),
  getInfo: (deploymentId: string) => invoke<RollbackInfo>("get_rollback_info", { deploymentId }),
};

// ============================================================================
// Deployment Event Listeners
// ============================================================================

export const deploymentEventApi = {
  onDeploymentStarted: (callback: (payload: DeploymentStartedPayload) => void): Promise<UnlistenFn> =>
    listen<DeploymentStartedPayload>("deployment-started", (event) => callback(event.payload)),
  
  onStepStarted: (callback: (payload: StepStartedPayload) => void): Promise<UnlistenFn> =>
    listen<StepStartedPayload>("step-started", (event) => callback(event.payload)),
  
  onStepOutput: (callback: (payload: StepOutputPayload) => void): Promise<UnlistenFn> =>
    listen<StepOutputPayload>("step-output", (event) => callback(event.payload)),
  
  onStepCompleted: (callback: (payload: StepCompletedPayload) => void): Promise<UnlistenFn> =>
    listen<StepCompletedPayload>("step-completed", (event) => callback(event.payload)),
  
  onDeploymentCompleted: (callback: (payload: DeploymentCompletedPayload) => void): Promise<UnlistenFn> =>
    listen<DeploymentCompletedPayload>("deployment-completed", (event) => callback(event.payload)),
};
