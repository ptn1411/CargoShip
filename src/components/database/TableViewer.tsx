import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Save,
  X,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  XCircle,
} from "lucide-react";
import {
  DatabaseConnection,
  ColumnInfo,
  TableData,
  databaseApi,
} from "../../lib/tauri";
import { useAppStore } from "../../store";
import { cn } from "../../lib/utils";

interface TableViewerProps {
  connection: DatabaseConnection;
  database: string;
  table: string;
  columns: ColumnInfo[];
}

interface EditingCell {
  rowIndex: number;
  columnName: string;
  value: unknown;
}

export function TableViewer({ connection, database, table, columns }: TableViewerProps) {
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [tableData, setTableData] = useState<TableData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [orderBy, setOrderBy] = useState<string | null>(null);
  const [orderDir, setOrderDir] = useState<"ASC" | "DESC">("ASC");
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [isInserting, setIsInserting] = useState(false);
  const [newRowValues, setNewRowValues] = useState<Record<string, unknown>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      if (searchTerm.trim()) {
        // Use search API
        const data = await databaseApi.searchTableData(
          connection.id,
          database,
          table,
          searchTerm.trim(),
          [],
          page,
          pageSize
        );
        setTableData(data);
      } else {
        // Use normal fetch
        const data = await databaseApi.getTableData({
          connection_id: connection.id,
          database,
          table,
          page,
          page_size: pageSize,
          order_by: orderBy || undefined,
          order_dir: orderDir,
        });
        setTableData(data);
      }
    } catch (error) {
      showError("Failed to load table data", String(error));
    } finally {
      setIsLoading(false);
      setIsSearching(false);
    }
  }, [connection.id, database, table, page, pageSize, orderBy, orderDir, searchTerm]);

  useEffect(() => {
    loadData();
    setSelectedRows(new Set());
    setEditingCell(null);
    setIsInserting(false);
    setSearchTerm("");
  }, [table, database, connection.id]);

  // Reload when search, page, or sort changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearch = () => {
    setIsSearching(true);
    setPage(1);
    loadData();
  };

  const clearSearch = () => {
    setSearchTerm("");
    setPage(1);
  };

  const handleSort = (columnName: string) => {
    if (orderBy === columnName) {
      setOrderDir((prev) => (prev === "ASC" ? "DESC" : "ASC"));
    } else {
      setOrderBy(columnName);
      setOrderDir("ASC");
    }
    setPage(1);
  };

  const handleCellClick = (rowIndex: number, columnName: string, value: unknown) => {
    // Don't allow editing primary key columns
    const col = columns.find((c) => c.name === columnName);
    if (col?.is_primary_key && col?.is_auto_increment) return;

    setEditingCell({ rowIndex, columnName, value });
  };

  const handleCellChange = (value: string) => {
    if (!editingCell) return;
    setEditingCell({ ...editingCell, value });
  };

  const handleCellSave = async () => {
    if (!editingCell || !tableData) return;

    const row = tableData.rows[editingCell.rowIndex];
    const pkValues: Record<string, unknown> = {};
    tableData.primary_key_columns.forEach((pk) => {
      const colIndex = columns.findIndex((c) => c.name === pk);
      if (colIndex !== -1) {
        pkValues[pk] = row[colIndex];
      }
    });

    if (Object.keys(pkValues).length === 0) {
      showError("Cannot update", "No primary key found");
      return;
    }

    setIsSaving(true);
    try {
      await databaseApi.updateRow({
        connection_id: connection.id,
        database,
        table,
        primary_key_values: pkValues,
        updates: { [editingCell.columnName]: editingCell.value },
      });
      showSuccess("Row updated");
      setEditingCell(null);
      loadData();
    } catch (error) {
      showError("Failed to update row", String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedRows.size === 0 || !tableData) return;

    if (!confirm(`Delete ${selectedRows.size} row(s)?`)) return;

    const pkValuesList: Record<string, unknown>[] = [];
    selectedRows.forEach((rowIndex) => {
      const row = tableData.rows[rowIndex];
      const pkValues: Record<string, unknown> = {};
      tableData.primary_key_columns.forEach((pk) => {
        const colIndex = columns.findIndex((c) => c.name === pk);
        if (colIndex !== -1) {
          pkValues[pk] = row[colIndex];
        }
      });
      if (Object.keys(pkValues).length > 0) {
        pkValuesList.push(pkValues);
      }
    });

    if (pkValuesList.length === 0) {
      showError("Cannot delete", "No primary key found");
      return;
    }

    setIsSaving(true);
    try {
      await databaseApi.deleteRows({
        connection_id: connection.id,
        database,
        table,
        primary_key_values: pkValuesList,
      });
      showSuccess(`Deleted ${pkValuesList.length} row(s)`);
      setSelectedRows(new Set());
      loadData();
    } catch (error) {
      showError("Failed to delete rows", String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleInsertRow = async () => {
    if (Object.keys(newRowValues).length === 0) {
      showError("Cannot insert", "No values provided");
      return;
    }

    setIsSaving(true);
    try {
      await databaseApi.insertRow({
        connection_id: connection.id,
        database,
        table,
        values: newRowValues,
      });
      showSuccess("Row inserted");
      setIsInserting(false);
      setNewRowValues({});
      loadData();
    } catch (error) {
      showError("Failed to insert row", String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const totalPages = tableData ? Math.ceil(tableData.total_rows / pageSize) : 0;

  const formatCellValue = (value: unknown): string => {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b border-border bg-secondary/30 gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground"
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </button>
          <button
            onClick={() => setIsInserting(true)}
            disabled={isInserting}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-accent text-sm"
            title="Insert row"
          >
            <Plus className="w-4 h-4" />
            Insert
          </button>
          {selectedRows.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={isSaving}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-destructive/10 text-destructive text-sm"
              title="Delete selected"
            >
              <Trash2 className="w-4 h-4" />
              Delete ({selectedRows.size})
            </button>
          )}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search in all columns..."
              className="w-full pl-8 pr-8 py-1 text-sm rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchTerm && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching || !searchTerm.trim()}
            className="px-3 py-1 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
          </button>
        </div>

        {/* Pagination */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {tableData ? `${tableData.total_rows.toLocaleString()} rows` : ""}
          </span>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isLoading}
            className="p-1 rounded hover:bg-accent disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span>
            {page} / {totalPages || 1}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isLoading}
            className="p-1 rounded hover:bg-accent disabled:opacity-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading && !tableData ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-secondary z-10">
              <tr>
                <th className="w-10 px-2 py-2 border-b border-border">
                  <input
                    type="checkbox"
                    checked={tableData?.rows.length === selectedRows.size && selectedRows.size > 0}
                    onChange={(e) => {
                      if (e.target.checked && tableData) {
                        setSelectedRows(new Set(tableData.rows.map((_, i) => i)));
                      } else {
                        setSelectedRows(new Set());
                      }
                    }}
                    className="rounded"
                  />
                </th>
                {columns.map((col) => (
                  <th
                    key={col.name}
                    className="px-3 py-2 text-left font-medium border-b border-border cursor-pointer hover:bg-accent/50"
                    onClick={() => handleSort(col.name)}
                  >
                    <div className="flex items-center gap-1">
                      <span className="truncate">{col.name}</span>
                      {orderBy === col.name ? (
                        orderDir === "ASC" ? (
                          <ArrowUp className="w-3 h-3" />
                        ) : (
                          <ArrowDown className="w-3 h-3" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-30" />
                      )}
                    </div>
                    <div className="text-xs font-normal text-muted-foreground">
                      {col.data_type}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Insert Row */}
              {isInserting && (
                <tr className="bg-primary/5">
                  <td className="px-2 py-1 border-b border-border">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleInsertRow}
                        disabled={isSaving}
                        className="p-1 rounded hover:bg-primary/20 text-primary"
                        title="Save"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setIsInserting(false);
                          setNewRowValues({});
                        }}
                        className="p-1 rounded hover:bg-accent text-muted-foreground"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  {columns.map((col) => (
                    <td key={col.name} className="px-1 py-1 border-b border-border">
                      {col.is_auto_increment ? (
                        <span className="text-muted-foreground italic">AUTO</span>
                      ) : (
                        <input
                          type="text"
                          value={String(newRowValues[col.name] ?? "")}
                          onChange={(e) =>
                            setNewRowValues((prev) => ({
                              ...prev,
                              [col.name]: e.target.value || null,
                            }))
                          }
                          placeholder={col.is_nullable ? "NULL" : "required"}
                          className="w-full px-2 py-1 text-sm rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      )}
                    </td>
                  ))}
                </tr>
              )}

              {/* Data Rows */}
              {tableData?.rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={cn(
                    "hover:bg-accent/30",
                    selectedRows.has(rowIndex) && "bg-primary/10"
                  )}
                >
                  <td className="px-2 py-1 border-b border-border">
                    <input
                      type="checkbox"
                      checked={selectedRows.has(rowIndex)}
                      onChange={(e) => {
                        const newSelected = new Set(selectedRows);
                        if (e.target.checked) {
                          newSelected.add(rowIndex);
                        } else {
                          newSelected.delete(rowIndex);
                        }
                        setSelectedRows(newSelected);
                      }}
                      className="rounded"
                    />
                  </td>
                  {columns.map((col, colIndex) => {
                    const value = row[colIndex];
                    const isEditing =
                      editingCell?.rowIndex === rowIndex &&
                      editingCell?.columnName === col.name;

                    return (
                      <td
                        key={col.name}
                        className={cn(
                          "px-3 py-1 border-b border-border",
                          !col.is_primary_key && "cursor-pointer hover:bg-accent/50"
                        )}
                        onClick={() => handleCellClick(rowIndex, col.name, value)}
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={String(editingCell.value ?? "")}
                              onChange={(e) => handleCellChange(e.target.value)}
                              className="flex-1 px-2 py-0.5 text-sm rounded border border-primary bg-background focus:outline-none"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleCellSave();
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCellSave();
                              }}
                              disabled={isSaving}
                              className="p-0.5 rounded hover:bg-primary/20 text-primary"
                            >
                              <Save className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCell(null);
                              }}
                              className="p-0.5 rounded hover:bg-accent"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span
                            className={cn(
                              "block truncate max-w-xs",
                              value === null && "text-muted-foreground italic"
                            )}
                            title={formatCellValue(value)}
                          >
                            {formatCellValue(value)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {tableData?.rows.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No data
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
