import { useState, useEffect } from "react";
import {
  Database,
  Table,
  RefreshCw,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Loader2,
  Key,
  Hash,
  Info,
  MoreVertical,
} from "lucide-react";
import { TableViewer } from "./TableViewer";
import { CreateTableForm } from "./CreateTableForm";
import {
  DatabaseConnection,
  DatabaseInfo,
  TableInfo,
  ColumnInfo,
  IndexInfo,
  databaseApi,
} from "../../lib/tauri";
import { useAppStore } from "../../store";
import { cn } from "../../lib/utils";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

interface DatabaseBrowserProps {
  connection: DatabaseConnection;
  selectedDatabase: string | null;
  onSelectDatabase: (db: string | null) => void;
}

export function DatabaseBrowser({
  connection,
  selectedDatabase,
  onSelectDatabase,
}: DatabaseBrowserProps) {
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set());
  const [tableColumns, setTableColumns] = useState<Record<string, ColumnInfo[]>>({});
  const [tableIndexes, setTableIndexes] = useState<Record<string, IndexInfo[]>>({});
  const [isLoadingDbs, setIsLoadingDbs] = useState(false);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [showCreateDb, setShowCreateDb] = useState(false);
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [newDbName, setNewDbName] = useState("");
  const [showTableInfo, setShowTableInfo] = useState(false);

  useEffect(() => {
    loadDatabases();
  }, [connection.id]);

  useEffect(() => {
    if (selectedDatabase) {
      loadTables(selectedDatabase);
    } else {
      setTables([]);
      setSelectedTable(null);
    }
  }, [selectedDatabase]);

  const loadDatabases = async () => {
    setIsLoadingDbs(true);
    try {
      const dbs = await databaseApi.listDatabases(connection.id);
      setDatabases(dbs);
    } catch (error) {
      showError("Failed to load databases", String(error));
    } finally {
      setIsLoadingDbs(false);
    }
  };

  const loadTables = async (database: string) => {
    setIsLoadingTables(true);
    try {
      const tbls = await databaseApi.listTables(connection.id, database);
      setTables(tbls);
    } catch (error) {
      showError("Failed to load tables", String(error));
    } finally {
      setIsLoadingTables(false);
    }
  };

  const loadTableColumns = async (database: string, table: string) => {
    try {
      const [cols, indexes] = await Promise.all([
        databaseApi.getColumns(connection.id, database, table),
        databaseApi.getIndexes(connection.id, database, table),
      ]);
      setTableColumns((prev) => ({ ...prev, [`${database}.${table}`]: cols }));
      setTableIndexes((prev) => ({ ...prev, [`${database}.${table}`]: indexes }));
    } catch (error) {
      showError("Failed to load table info", String(error));
    }
  };

  const handleToggleDb = (dbName: string) => {
    const newExpanded = new Set(expandedDbs);
    if (newExpanded.has(dbName)) {
      newExpanded.delete(dbName);
    } else {
      newExpanded.add(dbName);
      onSelectDatabase(dbName);
    }
    setExpandedDbs(newExpanded);
  };

  const handleSelectTable = (table: string) => {
    setSelectedTable(table);
    if (selectedDatabase && !tableColumns[`${selectedDatabase}.${table}`]) {
      loadTableColumns(selectedDatabase, table);
    }
  };

  const handleCreateDatabase = async () => {
    if (!newDbName.trim()) return;
    try {
      await databaseApi.createDatabase({
        connection_id: connection.id,
        name: newDbName.trim(),
      });
      showSuccess("Database created", newDbName);
      setNewDbName("");
      setShowCreateDb(false);
      loadDatabases();
    } catch (error) {
      showError("Failed to create database", String(error));
    }
  };

  const handleDropDatabase = async (dbName: string) => {
    if (!confirm(`Are you sure you want to drop database "${dbName}"? This cannot be undone.`)) {
      return;
    }
    try {
      await databaseApi.dropDatabase(connection.id, dbName);
      showSuccess("Database dropped", dbName);
      if (selectedDatabase === dbName) {
        onSelectDatabase(null);
      }
      loadDatabases();
    } catch (error) {
      showError("Failed to drop database", String(error));
    }
  };

  const handleDropTable = async (tableName: string) => {
    if (!selectedDatabase) return;
    if (!confirm(`Are you sure you want to drop table "${tableName}"? This cannot be undone.`)) {
      return;
    }
    try {
      await databaseApi.dropTable(connection.id, selectedDatabase, tableName);
      showSuccess("Table dropped", tableName);
      if (selectedTable === tableName) {
        setSelectedTable(null);
      }
      loadTables(selectedDatabase);
    } catch (error) {
      showError("Failed to drop table", String(error));
    }
  };

  const handleTruncateTable = async (tableName: string) => {
    if (!selectedDatabase) return;
    if (!confirm(`Are you sure you want to truncate table "${tableName}"? All data will be deleted.`)) {
      return;
    }
    try {
      await databaseApi.truncateTable(connection.id, selectedDatabase, tableName);
      showSuccess("Table truncated", tableName);
      // Refresh table data if viewing this table
      if (selectedTable === tableName) {
        setSelectedTable(null);
        setTimeout(() => setSelectedTable(tableName), 100);
      }
    } catch (error) {
      showError("Failed to truncate table", String(error));
    }
  };

  return (
    <div className="h-full flex">
      {/* Database Tree */}
      <div className="w-64 border-r border-border flex flex-col">
        <div className="p-2 border-b border-border flex items-center justify-between">
          <span className="text-sm font-medium">Databases</span>
          <div className="flex items-center gap-1">
            <button
              onClick={loadDatabases}
              disabled={isLoadingDbs}
              className="p-1 rounded hover:bg-accent text-muted-foreground"
              title="Refresh"
            >
              <RefreshCw className={cn("w-4 h-4", isLoadingDbs && "animate-spin")} />
            </button>
            <button
              onClick={() => setShowCreateDb(true)}
              className="p-1 rounded hover:bg-accent text-muted-foreground"
              title="Create database"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Create Database Form */}
        {showCreateDb && (
          <div className="p-2 border-b border-border bg-accent/50">
            <input
              type="text"
              value={newDbName}
              onChange={(e) => setNewDbName(e.target.value)}
              placeholder="Database name"
              className="w-full px-2 py-1 text-sm rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateDatabase();
                if (e.key === "Escape") setShowCreateDb(false);
              }}
            />
            <div className="flex justify-end gap-1 mt-2">
              <button
                onClick={() => setShowCreateDb(false)}
                className="px-2 py-1 text-xs rounded hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDatabase}
                className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Create
              </button>
            </div>
          </div>
        )}

        {/* Database List */}
        <div className="flex-1 overflow-y-auto">
          {isLoadingDbs ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : databases.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No databases found
            </div>
          ) : (
            databases.map((db) => (
              <div key={db.name}>
                <div
                  className={cn(
                    "flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-accent/50 group",
                    selectedDatabase === db.name && "bg-accent"
                  )}
                  onClick={() => handleToggleDb(db.name)}
                >
                  {expandedDbs.has(db.name) ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                  <Database className="w-4 h-4 text-primary" />
                  <span className="flex-1 text-sm truncate">{db.name}</span>
                  {db.size && (
                    <span className="text-xs text-muted-foreground">{db.size}</span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDropDatabase(db.name);
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    title="Drop database"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {/* Tables */}
                {expandedDbs.has(db.name) && selectedDatabase === db.name && (
                  <div className="ml-4 border-l border-border">
                    {/* Create Table Button */}
                    <div
                      className="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-accent/50 text-primary"
                      onClick={() => setShowCreateTable(true)}
                    >
                      <Plus className="w-4 h-4" />
                      <span className="text-sm">Create Table</span>
                    </div>
                    
                    {isLoadingTables ? (
                      <div className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Loading tables...
                      </div>
                    ) : tables.length === 0 ? (
                      <div className="px-2 py-1 text-xs text-muted-foreground">
                        No tables
                      </div>
                    ) : (
                      tables.map((table) => (
                        <div
                          key={table.name}
                          className={cn(
                            "flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-accent/50 group",
                            selectedTable === table.name && "bg-accent"
                          )}
                          onClick={() => handleSelectTable(table.name)}
                        >
                          <Table className="w-4 h-4 text-muted-foreground" />
                          <span className="flex-1 text-sm truncate">{table.name}</span>
                          {table.rows !== null && (
                            <span className="text-xs text-muted-foreground">
                              {table.rows.toLocaleString()}
                            </span>
                          )}
                          
                          {/* Table Actions Menu */}
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                              <button
                                onClick={(e) => e.stopPropagation()}
                                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent"
                              >
                                <MoreVertical className="w-3 h-3" />
                              </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content
                                className="min-w-[120px] bg-popover border border-border rounded-md p-1 shadow-md z-50"
                                sideOffset={5}
                              >
                                <DropdownMenu.Item
                                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTruncateTable(table.name);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Truncate
                                </DropdownMenu.Item>
                                <DropdownMenu.Item
                                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-destructive/10 text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDropTable(table.name);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Drop Table
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Table Viewer */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedDatabase && selectedTable ? (
          <>
            {/* Table Info */}
            <div className="p-2 border-b border-border bg-accent/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Table className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{selectedTable}</span>
                  <span className="text-xs text-muted-foreground">
                    in {selectedDatabase}
                  </span>
                </div>
                <button
                  onClick={() => setShowTableInfo(!showTableInfo)}
                  className={cn(
                    "p-1 rounded hover:bg-accent",
                    showTableInfo && "bg-accent"
                  )}
                  title="Table structure"
                >
                  <Info className="w-4 h-4" />
                </button>
              </div>
              
              {/* Column Preview */}
              {!showTableInfo && tableColumns[`${selectedDatabase}.${selectedTable}`] && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {tableColumns[`${selectedDatabase}.${selectedTable}`].slice(0, 8).map((col) => (
                    <span
                      key={col.name}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-secondary"
                    >
                      {col.is_primary_key && <Key className="w-3 h-3 text-yellow-500" />}
                      {col.is_auto_increment && <Hash className="w-3 h-3 text-blue-500" />}
                      {col.name}
                      <span className="text-muted-foreground">{col.data_type}</span>
                    </span>
                  ))}
                  {tableColumns[`${selectedDatabase}.${selectedTable}`].length > 8 && (
                    <span className="text-xs text-muted-foreground">
                      +{tableColumns[`${selectedDatabase}.${selectedTable}`].length - 8} more
                    </span>
                  )}
                </div>
              )}

              {/* Full Table Structure */}
              {showTableInfo && tableColumns[`${selectedDatabase}.${selectedTable}`] && (
                <div className="mt-3 space-y-3">
                  {/* Columns */}
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">Columns</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-1 px-2">Name</th>
                            <th className="text-left py-1 px-2">Type</th>
                            <th className="text-left py-1 px-2">Nullable</th>
                            <th className="text-left py-1 px-2">Default</th>
                            <th className="text-left py-1 px-2">Extra</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableColumns[`${selectedDatabase}.${selectedTable}`].map((col) => (
                            <tr key={col.name} className="border-b border-border/50">
                              <td className="py-1 px-2 font-medium">
                                <span className="flex items-center gap-1">
                                  {col.is_primary_key && <Key className="w-3 h-3 text-yellow-500" />}
                                  {col.name}
                                </span>
                              </td>
                              <td className="py-1 px-2 text-muted-foreground">{col.data_type}</td>
                              <td className="py-1 px-2">{col.is_nullable ? "YES" : "NO"}</td>
                              <td className="py-1 px-2 text-muted-foreground">{col.column_default || "-"}</td>
                              <td className="py-1 px-2">
                                {col.is_auto_increment && <span className="text-blue-500">AUTO_INCREMENT</span>}
                                {col.is_unique && !col.is_primary_key && <span className="text-green-500">UNIQUE</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Indexes */}
                  {tableIndexes[`${selectedDatabase}.${selectedTable}`]?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-2">Indexes</h4>
                      <div className="space-y-1">
                        {tableIndexes[`${selectedDatabase}.${selectedTable}`].map((idx) => (
                          <div
                            key={idx.name}
                            className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-secondary/50"
                          >
                            <span className="font-medium">{idx.name}</span>
                            {idx.is_primary && (
                              <span className="px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-600">PRIMARY</span>
                            )}
                            {idx.is_unique && !idx.is_primary && (
                              <span className="px-1 py-0.5 rounded bg-green-500/20 text-green-600">UNIQUE</span>
                            )}
                            <span className="text-muted-foreground">({idx.columns.join(", ")})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Table Data */}
            <TableViewer
              connection={connection}
              database={selectedDatabase}
              table={selectedTable}
              columns={tableColumns[`${selectedDatabase}.${selectedTable}`] || []}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Table className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Select a table to view data</p>
            </div>
          </div>
        )}
      </div>

      {/* Create Table Modal */}
      {showCreateTable && selectedDatabase && (
        <CreateTableForm
          connectionId={connection.id}
          database={selectedDatabase}
          dbType={connection.db_type}
          onClose={() => setShowCreateTable(false)}
          onCreated={() => loadTables(selectedDatabase)}
        />
      )}
    </div>
  );
}
