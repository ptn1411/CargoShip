import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { transferEventApi } from './transfer';
import { batchEventApi } from './batch';

// ============================================================================
// Monitoring Types
// ============================================================================

export interface ServerMetrics {
  cpu_percent: number;
  memory_used: number;
  memory_total: number;
  disk_used: number;
  disk_total: number;
  load_average: [number, number, number];
  uptime_seconds: number;
  collected_at: string;
}

export interface ServerStatusInfo {
  server_id: string;
  server_name: string;
  online: boolean;
  metrics: ServerMetrics | null;
  last_checked: string;
}

export type MetricType = "cpu_usage" | "memory_usage" | "disk_usage";
export type AlertCondition = "greater_than" | "less_than" | "equals";

export interface AlertConfig {
  id: string;
  server_id: string | null;
  metric: MetricType;
  condition: AlertCondition;
  threshold: number;
  enabled: boolean;
  created_at: string;
}

export interface Alert {
  alert_config_id: string;
  server_id: string;
  server_name: string;
  metric: MetricType;
  condition: AlertCondition;
  threshold: number;
  actual_value: number;
  triggered_at: string;
}

export interface MetricPoint {
  timestamp: string;
  value: number;
}

export interface CreateAlertInput {
  server_id?: string;
  metric: MetricType;
  condition: AlertCondition;
  threshold: number;
  enabled: boolean;
}

export interface UpdateAlertInput {
  server_id?: string;
  metric?: MetricType;
  condition?: AlertCondition;
  threshold?: number;
  enabled?: boolean;
}


// ============================================================================
// Event Payloads
// ============================================================================

export interface MetricsUpdatedPayload {
  server_id: string;
  metrics: ServerMetrics;
}

export interface AlertTriggeredPayload {
  alert_id: string;
  server_id: string;
  metric: string;
  value: number;
  threshold: number;
}

// ============================================================================
// Monitoring API
// ============================================================================

export const monitorApi = {
  getServerMetrics: (serverId: string) =>
    invoke<ServerMetrics>("get_server_metrics", { serverId }),
  getAllServerStatus: () =>
    invoke<ServerStatusInfo[]>("get_all_server_status"),
  getMetricsHistory: (serverId: string, metric: string, hours: number) =>
    invoke<MetricPoint[]>("get_metrics_history", { serverId, metric, hours }),
  setAlert: (alert: CreateAlertInput) =>
    invoke<AlertConfig>("set_alert", { alert }),
  updateAlert: (id: string, input: UpdateAlertInput) =>
    invoke<AlertConfig>("update_alert", { id, input }),
  deleteAlert: (id: string) =>
    invoke<void>("delete_alert", { id }),
  listAlerts: () =>
    invoke<AlertConfig[]>("list_alerts"),
  checkAlerts: () =>
    invoke<Alert[]>("check_alerts"),
  startMonitoring: (intervalSeconds: number) =>
    invoke<void>("start_monitoring", { intervalSeconds }),
  stopMonitoring: () =>
    invoke<void>("stop_monitoring"),
};

// ============================================================================
// Monitor Event Listeners
// ============================================================================

export const monitorEventApi = {
  onMetricsUpdated: (callback: (payload: MetricsUpdatedPayload) => void): Promise<UnlistenFn> =>
    listen<MetricsUpdatedPayload>("metrics-updated", (event) => callback(event.payload)),
  
  onAlertTriggered: (callback: (payload: AlertTriggeredPayload) => void): Promise<UnlistenFn> =>
    listen<AlertTriggeredPayload>("alert-triggered", (event) => callback(event.payload)),
};


// Alias for backward compatibility
export const phase4EventApi = {
  ...monitorEventApi,
  ...transferEventApi,
  ...batchEventApi,
};
