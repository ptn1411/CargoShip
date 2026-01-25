import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

// ============================================================================
// Transfer Types
// ============================================================================

export interface TransferRequest {
  local_path: string;
  remote_path: string;
}

export type TransferDirection = "upload" | "download";

export type TransferState =
  | "queued"
  | "in_progress"
  | "completed"
  | { failed: string }
  | "cancelled";

export interface TransferStatus {
  id: string;
  file_name: string;
  direction: TransferDirection;
  bytes_transferred: number;
  total_bytes: number;
  speed_bps: number;
  eta_seconds: number | null;
  state: TransferState;
  server_id: string;
  local_path: string;
  remote_path: string;
  created_at: string;
  updated_at: string;
}

export interface TransferProgressPayload {
  transfer_id: string;
  bytes_transferred: number;
  total_bytes: number;
  speed_bps: number;
  eta_seconds: number | null;
}

export interface TransferCompletedPayload {
  transfer_id: string;
  success: boolean;
  error: string | null;
}

// ============================================================================
// Transfer API
// ============================================================================

export const transferApi = {
  queueUploads: (serverId: string, transfers: TransferRequest[]) =>
    invoke<string[]>("queue_uploads", { serverId, transfers }),
  queueDownloads: (serverId: string, transfers: TransferRequest[]) =>
    invoke<string[]>("queue_downloads", { serverId, transfers }),
  cancel: (transferId: string) =>
    invoke<void>("cancel_transfer", { transferId }),
  getStatus: (transferId: string) =>
    invoke<TransferStatus>("get_transfer_status", { transferId }),
  setSpeedLimit: (bytesPerSecond: number | null) =>
    invoke<void>("set_transfer_speed_limit", { bytesPerSecond }),
  listActive: () =>
    invoke<TransferStatus[]>("list_active_transfers"),
};


// ============================================================================
// Transfer Event Listeners
// ============================================================================

export const transferEventApi = {
  onTransferProgress: (callback: (payload: TransferProgressPayload) => void): Promise<UnlistenFn> =>
    listen<TransferProgressPayload>("transfer-progress", (event) => callback(event.payload)),
  
  onTransferCompleted: (callback: (payload: TransferCompletedPayload) => void): Promise<UnlistenFn> =>
    listen<TransferCompletedPayload>("transfer-completed", (event) => callback(event.payload)),
};
