import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

// ============================================================================
// Batch Operations Types
// ============================================================================

export interface BatchResult {
  server_id: string;
  server_name: string;
  success: boolean;
  output: string | null;
  error: string | null;
  duration_ms: number;
}

export interface HealthCheckResult {
  server_id: string;
  server_name: string;
  connected: boolean;
  latency_ms: number | null;
  error: string | null;
}

export interface BatchSummary {
  total: number;
  success_count: number;
  failure_count: number;
  results: BatchResult[];
}

export interface HealthCheckSummary {
  total: number;
  online_count: number;
  offline_count: number;
  results: HealthCheckResult[];
}

export interface BatchProgressPayload {
  completed: number;
  total: number;
  current_server: string;
  current_server_id: string;
}

// ============================================================================
// Batch Operations API
// ============================================================================

export const batchApi = {
  executeCommand: (serverIds: string[], command: string) =>
    invoke<BatchResult[]>("batch_execute_command", { serverIds, command }),
  executeParallel: (serverIds: string[], command: string, maxParallel: number) =>
    invoke<BatchResult[]>("batch_execute_parallel", { serverIds, command, maxParallel }),
  healthCheck: (serverIds: string[]) =>
    invoke<HealthCheckResult[]>("batch_health_check", { serverIds }),
  executeWithSummary: (serverIds: string[], command: string) =>
    invoke<BatchSummary>("batch_execute_with_summary", { serverIds, command }),
  healthCheckWithSummary: (serverIds: string[]) =>
    invoke<HealthCheckSummary>("batch_health_check_with_summary", { serverIds }),
};

// ============================================================================
// Batch Event Listeners
// ============================================================================

export const batchEventApi = {
  onBatchProgress: (callback: (payload: BatchProgressPayload) => void): Promise<UnlistenFn> =>
    listen<BatchProgressPayload>("batch-progress", (event) => callback(event.payload)),
};
