import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Database Management Types
// ============================================================================

export type DatabaseType = "mysql" | "postgresql";

export interface DatabaseConnection {
  id: string;
  server_id: string;
  name: string;
  db_type: DatabaseType;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateConnectionInput {
  server_id: string;
  name: string;
  db_type: DatabaseType;
  host: string;
  port: number;
  username: string;
  password: string;
  database?: string;
}

export interface UpdateConnectionInput {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
}

export interface DatabaseInfo {
  name: string;
  size: string | null;
  tables_count: number | null;
  charset: string | null;
  collation: string | null;
}

export interface TableInfo {
  name: string;
  rows: number | null;
  size: string | null;
  engine: string | null;
  collation: string | null;
  created_at: string | null;
  updated_at: string | null;
}


export interface ColumnInfo {
  name: string;
  data_type: string;
  is_nullable: boolean;
  column_default: string | null;
  is_primary_key: boolean;
  is_unique: boolean;
  is_auto_increment: boolean;
  max_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  comment: string | null;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  is_unique: boolean;
  is_primary: boolean;
  index_type: string | null;
}

export interface DatabaseUser {
  username: string;
  host: string;
  privileges: string[];
}

export interface CreateUserInput {
  username: string;
  password: string;
  host: string;
  privileges: string[];
  database?: string;
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  affected_rows: number;
  execution_time_ms: number;
  is_select: boolean;
  error: string | null;
}

export interface QueryHistoryEntry {
  id: string;
  connection_id: string;
  database: string;
  query: string;
  execution_time_ms: number;
  rows_affected: number;
  success: boolean;
  error: string | null;
  executed_at: string;
}

export interface SavedQuery {
  id: string;
  connection_id: string | null;
  name: string;
  description: string | null;
  query: string;
  database: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveQueryInput {
  connection_id?: string;
  name: string;
  description?: string;
  query: string;
  database?: string;
}

export interface ExecuteQueryInput {
  connection_id: string;
  database: string;
  query: string;
}

export interface TableData {
  columns: ColumnInfo[];
  rows: unknown[][];
  total_rows: number;
  page: number;
  page_size: number;
  primary_key_columns: string[];
}

export interface FetchTableDataInput {
  connection_id: string;
  database: string;
  table: string;
  page?: number;
  page_size?: number;
  order_by?: string;
  order_dir?: string;
  filter?: string;
}

export interface UpdateRowInput {
  connection_id: string;
  database: string;
  table: string;
  primary_key_values: Record<string, unknown>;
  updates: Record<string, unknown>;
}

export interface InsertRowInput {
  connection_id: string;
  database: string;
  table: string;
  values: Record<string, unknown>;
}

export interface DeleteRowsInput {
  connection_id: string;
  database: string;
  table: string;
  primary_key_values: Record<string, unknown>[];
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  version: string | null;
}

export interface CreateDatabaseInput {
  connection_id: string;
  name: string;
  charset?: string;
  collation?: string;
}

export interface CreateTableInput {
  connection_id: string;
  database: string;
  name: string;
  columns: CreateColumnInput[];
  primary_key?: string[];
  engine?: string;
}

export interface CreateColumnInput {
  name: string;
  data_type: string;
  length?: number;
  is_nullable: boolean;
  default_value?: string;
  is_auto_increment: boolean;
  comment?: string;
}


// ============================================================================
// Database Backup & Restore Types
// ============================================================================

export interface BackupOptions {
  connection_id: string;
  database: string;
  tables?: string[];
  include_structure: boolean;
  include_data: boolean;
  compress: boolean;
  remote_path?: string;
}

export interface BackupResult {
  success: boolean;
  file_path?: string;
  file_size?: number;
  content?: string;
  duration_ms: number;
  error?: string;
}

export interface RestoreOptions {
  connection_id: string;
  database: string;
  source: RestoreSource;
  drop_existing: boolean;
}

export type RestoreSource = 
  | { type: "RemotePath"; value: string }
  | { type: "Content"; value: string };

export interface RestoreResult {
  success: boolean;
  tables_restored: number;
  duration_ms: number;
  error?: string;
}

export interface BackupFileInfo {
  name: string;
  path: string;
  size: number;
  modified_at: string;
  compressed: boolean;
}

export interface BackupHistoryEntry {
  id: string;
  connection_id: string;
  database: string;
  file_path?: string;
  file_size?: number;
  tables?: string[];
  include_structure: boolean;
  include_data: boolean;
  compressed: boolean;
  status: string;
  error?: string;
  created_at: string;
}


// ============================================================================
// Database Management API
// ============================================================================

export const databaseApi = {
  // Connection Management
  addConnection: (input: CreateConnectionInput) =>
    invoke<DatabaseConnection>("db_add_connection", { input }),
  listConnections: () =>
    invoke<DatabaseConnection[]>("db_list_connections"),
  getConnection: (id: string) =>
    invoke<DatabaseConnection>("db_get_connection", { id }),
  removeConnection: (id: string) =>
    invoke<void>("db_remove_connection", { id }),
  testConnection: (connectionId: string) =>
    invoke<ConnectionTestResult>("db_test_connection", { connectionId }),
  testConnectionInput: (input: CreateConnectionInput) =>
    invoke<ConnectionTestResult>("db_test_connection_input", { input }),
  updateConnection: (id: string, input: UpdateConnectionInput) =>
    invoke<void>("db_update_connection", { id, input }),

  // Database Operations
  listDatabases: (connectionId: string) =>
    invoke<DatabaseInfo[]>("db_list_databases", { connectionId }),
  createDatabase: (input: CreateDatabaseInput) =>
    invoke<void>("db_create_database", { input }),
  dropDatabase: (connectionId: string, database: string) =>
    invoke<void>("db_drop_database", { connectionId, database }),

  // Table Operations
  listTables: (connectionId: string, database: string) =>
    invoke<TableInfo[]>("db_list_tables", { connectionId, database }),
  getColumns: (connectionId: string, database: string, table: string) =>
    invoke<ColumnInfo[]>("db_get_columns", { connectionId, database, table }),
  getIndexes: (connectionId: string, database: string, table: string) =>
    invoke<IndexInfo[]>("db_get_indexes", { connectionId, database, table }),
  getTableData: (input: FetchTableDataInput) =>
    invoke<TableData>("db_get_table_data", { input }),
  createTable: (input: CreateTableInput) =>
    invoke<void>("db_create_table", { input }),
  dropTable: (connectionId: string, database: string, table: string) =>
    invoke<void>("db_drop_table", { connectionId, database, table }),
  truncateTable: (connectionId: string, database: string, table: string) =>
    invoke<void>("db_truncate_table", { connectionId, database, table }),
  searchTableData: (connectionId: string, database: string, table: string, searchTerm: string, columns?: string[], page?: number, pageSize?: number) =>
    invoke<TableData>("db_search_table_data", { connectionId, database, table, searchTerm, columns: columns || [], page, pageSize }),

  // Query Execution
  executeQuery: (input: ExecuteQueryInput) =>
    invoke<QueryResult>("db_execute_query", { input }),

  // Row Operations
  updateRow: (input: UpdateRowInput) =>
    invoke<number>("db_update_row", { input }),
  insertRow: (input: InsertRowInput) =>
    invoke<number>("db_insert_row", { input }),
  deleteRows: (input: DeleteRowsInput) =>
    invoke<number>("db_delete_rows", { input }),

  // User Management
  listUsers: (connectionId: string) =>
    invoke<DatabaseUser[]>("db_list_users", { connectionId }),
  createUser: (connectionId: string, input: CreateUserInput) =>
    invoke<void>("db_create_user", { connectionId, input }),
  dropUser: (connectionId: string, username: string, host: string) =>
    invoke<void>("db_drop_user", { connectionId, username, host }),
  getUserPrivileges: (connectionId: string, username: string, host: string) =>
    invoke<string[]>("db_get_user_privileges", { connectionId, username, host }),
  grantPrivileges: (connectionId: string, username: string, host: string, privileges: string[], database?: string) =>
    invoke<void>("db_grant_privileges", { connectionId, username, host, privileges, database }),
  revokePrivileges: (connectionId: string, username: string, host: string, privileges: string[], database?: string) =>
    invoke<void>("db_revoke_privileges", { connectionId, username, host, privileges, database }),
  changeUserPassword: (connectionId: string, username: string, host: string, newPassword: string) =>
    invoke<void>("db_change_user_password", { connectionId, username, host, newPassword }),

  // Query History
  getQueryHistory: (connectionId: string, limit?: number) =>
    invoke<QueryHistoryEntry[]>("db_get_query_history", { connectionId, limit: limit || 50 }),
  clearQueryHistory: (connectionId: string) =>
    invoke<void>("db_clear_query_history", { connectionId }),

  // Saved Queries
  saveQuery: (input: SaveQueryInput) =>
    invoke<SavedQuery>("db_save_query", { input }),
  getSavedQueries: (connectionId?: string) =>
    invoke<SavedQuery[]>("db_get_saved_queries", { connectionId }),
  deleteSavedQuery: (id: string) =>
    invoke<void>("db_delete_saved_query", { id }),

  // Backup & Restore
  backupDatabase: (options: BackupOptions) =>
    invoke<BackupResult>("db_backup_database", { options }),
  restoreDatabase: (options: RestoreOptions) =>
    invoke<RestoreResult>("db_restore_database", { options }),
  listBackupFiles: (connectionId: string, directory: string) =>
    invoke<BackupFileInfo[]>("db_list_backup_files", { connectionId, directory }),
  deleteBackupFile: (connectionId: string, filePath: string) =>
    invoke<void>("db_delete_backup_file", { connectionId, filePath }),
  getBackupHistory: (connectionId?: string, limit?: number) =>
    invoke<BackupHistoryEntry[]>("db_get_backup_history", { connectionId, limit }),
  clearBackupHistory: (connectionId?: string) =>
    invoke<void>("db_clear_backup_history", { connectionId }),
};
