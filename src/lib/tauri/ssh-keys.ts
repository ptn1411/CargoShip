import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// SSH Key Management Types
// ============================================================================

export type SshKeyType = "ed25519" | "rsa";

export interface SshKey {
  id: string;
  name: string;
  key_type: string;
  public_key: string;
  fingerprint: string;
  comment: string | null;
  created_at: string;
}

export interface CreateSshKeyInput {
  name: string;
  key_type: SshKeyType;
  passphrase?: string;
  comment?: string;
  bits?: number;
}

export interface GeneratedKey {
  id: string;
  name: string;
  key_type: string;
  public_key: string;
  fingerprint: string;
}

// ============================================================================
// SSH Key Management API
// ============================================================================

export const sshKeyApi = {
  generate: (input: CreateSshKeyInput) => invoke<GeneratedKey>("generate_ssh_key", { input }),
  list: () => invoke<SshKey[]>("list_ssh_keys"),
  get: (id: string) => invoke<SshKey>("get_ssh_key", { id }),
  delete: (id: string) => invoke<void>("delete_ssh_key", { id }),
  update: (id: string, name?: string, comment?: string) => 
    invoke<SshKey>("update_ssh_key", { id, name, comment }),
  exportPublicKey: (id: string) => invoke<string>("export_ssh_public_key", { id }),
};
