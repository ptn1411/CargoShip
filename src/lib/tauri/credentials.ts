import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Credentials API
// ============================================================================

export const credentialApi = {
  store: (serverId: string, credential: string, isPassword: boolean = true) =>
    invoke<void>("store_credential", { serverId, credential, isPassword }),
  storeKeyPassphrase: (serverId: string, passphrase: string) =>
    invoke<void>("store_key_passphrase", { serverId, passphrase }),
  setSudoPassword: (serverId: string, password: string) =>
    invoke<void>("set_sudo_password", { serverId, password }),
  clearSudoPassword: (serverId: string) =>
    invoke<void>("clear_sudo_password", { serverId }),
};
