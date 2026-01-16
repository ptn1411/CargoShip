// ============================================================================
// Core Types - Shared across modules
// ============================================================================

export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_method: "password" | "ssh_key";
  ssh_key_id: string | null;
  tags: string[];
  environment: "dev" | "staging" | "prod";
  use_sudo: boolean;
  created_at: string;
  updated_at: string;
  last_connected: string | null;
}

export interface CreateServerInput {
  name: string;
  host: string;
  port: number;
  username: string;
  auth_method: "password" | "ssh_key";
  ssh_key_id?: string;
  tags?: string[];
  environment: "dev" | "staging" | "prod";
  use_sudo?: boolean;
}

export interface UpdateServerInput {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  auth_method?: "password" | "ssh_key";
  ssh_key_id?: string;
  tags?: string[];
  environment?: "dev" | "staging" | "prod";
  use_sudo?: boolean;
}

export interface ConnectionStatus {
  connected: boolean;
  server_info: ServerInfo | null;
  error: string | null;
  latency_ms: number | null;
}

export interface ServerInfo {
  os: string;
  hostname: string;
  kernel: string;
}

export interface CommandOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}
