import { invoke } from "@tauri-apps/api/core";
import type { Server } from './types';

// ============================================================================
// Server Groups Types
// ============================================================================

export interface ServerGroup {
  id: string;
  name: string;
  description: string | null;
  server_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateGroupInput {
  name: string;
  description?: string;
  server_ids?: string[];
}

export interface UpdateGroupInput {
  name?: string;
  description?: string;
  server_ids?: string[];
}

// ============================================================================
// Server Groups API
// ============================================================================

export const groupApi = {
  create: (input: CreateGroupInput) => invoke<ServerGroup>("create_group", { input }),
  list: () => invoke<ServerGroup[]>("list_groups"),
  get: (id: string) => invoke<ServerGroup>("get_group", { id }),
  update: (id: string, input: UpdateGroupInput) => invoke<ServerGroup>("update_group", { id, input }),
  delete: (id: string) => invoke<void>("delete_group", { id }),
  addServer: (groupId: string, serverId: string) => invoke<void>("add_server_to_group", { groupId, serverId }),
  removeServer: (groupId: string, serverId: string) => invoke<void>("remove_server_from_group", { groupId, serverId }),
  getServers: (groupId: string) => invoke<Server[]>("get_servers_in_group", { groupId }),
};
