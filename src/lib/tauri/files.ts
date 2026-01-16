import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// File Types
// ============================================================================

export interface FileEntry {
  name: string;
  path: string;
  file_type: "file" | "directory" | "symlink";
  size: number;
  permissions: string;
  modified_at: string;
}

export interface Breadcrumb {
  name: string;
  path: string;
}

export interface FileContent {
  path: string;
  content: string;
  size: number;
  modified_at: number;
  permissions: string;
  encoding: string;
}

export interface ConflictStatus {
  type: "no_conflict" | "remote_modified" | "local_only" | "remote_only";
  remote_time?: number;
  local_time?: number;
}

export interface FileDiff {
  local_content: string;
  remote_content: string;
  changes: DiffChange[];
}

export interface DiffChange {
  change_type: "added" | "removed" | "unchanged";
  old_line: number | null;
  new_line: number | null;
  content: string;
}

export type ConflictResolution = 
  | "keep_local"
  | "use_remote"
  | { merge_content: string };

export interface EditorSettings {
  tab_size: number;
  font_size: number;
  font_family: string;
  word_wrap: boolean;
  auto_save: boolean;
  auto_save_interval: number;
  theme: "vs" | "vs-dark" | "hc-black";
}

// ============================================================================
// File Operations API
// ============================================================================

export const fileApi = {
  listDirectory: (serverId: string, path: string) => 
    invoke<FileEntry[]>("list_remote_files", { serverId, path }),
  search: (serverId: string, path: string, pattern: string) =>
    invoke<FileEntry[]>("search_files", { serverId, path, pattern }),
  getFileInfo: (serverId: string, path: string) =>
    invoke<FileEntry>("get_file_info", { serverId, path }),
  getBreadcrumbs: (path: string) =>
    invoke<Breadcrumb[]>("get_breadcrumbs", { path }),
  downloadFile: (serverId: string, remotePath: string) =>
    invoke<FileContent>("download_file", { serverId, remotePath }),
  saveFile: (serverId: string, remotePath: string, content: string) =>
    invoke<void>("save_file", { serverId, remotePath, content }),
  createFile: (serverId: string, remotePath: string) =>
    invoke<void>("create_file", { serverId, remotePath }),
  createDirectory: (serverId: string, remotePath: string) =>
    invoke<void>("create_directory", { serverId, remotePath }),
  deleteFile: (serverId: string, remotePath: string) =>
    invoke<void>("delete_remote_file", { serverId, remotePath }),
  renameFile: (serverId: string, oldPath: string, newPath: string) =>
    invoke<void>("rename_file", { serverId, oldPath, newPath }),
  uploadFiles: (serverId: string, remoteDir: string, localPaths: string[]) =>
    invoke<void>("upload_files", { serverId, remoteDir, localPaths }),
  changePermissions: (serverId: string, remotePath: string, mode: string) =>
    invoke<void>("change_permissions", { serverId, remotePath, mode }),
};

// ============================================================================
// Sync API
// ============================================================================

export const syncApi = {
  checkConflict: (serverId: string, remotePath: string) =>
    invoke<ConflictStatus>("check_file_conflict", { serverId, remotePath }),
  getDiff: (serverId: string, remotePath: string) =>
    invoke<FileDiff>("get_file_diff", { serverId, remotePath }),
  resolveConflict: (serverId: string, remotePath: string, resolution: ConflictResolution) =>
    invoke<void>("resolve_conflict", { serverId, remotePath, resolution }),
};

// ============================================================================
// Editor Settings API
// ============================================================================

export const editorSettingsApi = {
  get: () => invoke<EditorSettings>("get_editor_settings"),
  update: (settings: EditorSettings) => invoke<void>("update_editor_settings", { settings }),
};
