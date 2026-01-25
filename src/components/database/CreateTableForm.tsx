import { useState } from "react";
import { X, Plus, Trash2, Loader2, Table, Key } from "lucide-react";
import { CreateTableInput, CreateColumnInput, databaseApi, DatabaseType } from "../../lib/tauri";
import { useAppStore } from "../../store";
import { cn } from "../../lib/utils";

interface CreateTableFormProps {
  connectionId: string;
  database: string;
  dbType: DatabaseType;
  onClose: () => void;
  onCreated: () => void;
}

const MYSQL_DATA_TYPES = [
  "INT", "BIGINT", "SMALLINT", "TINYINT", "MEDIUMINT",
  "DECIMAL", "FLOAT", "DOUBLE",
  "VARCHAR", "CHAR", "TEXT", "MEDIUMTEXT", "LONGTEXT",
  "DATE", "DATETIME", "TIMESTAMP", "TIME", "YEAR",
  "BOOLEAN", "ENUM", "SET",
  "BLOB", "MEDIUMBLOB", "LONGBLOB",
  "JSON",
];

const POSTGRES_DATA_TYPES = [
  "INTEGER", "BIGINT", "SMALLINT", "SERIAL", "BIGSERIAL",
  "DECIMAL", "NUMERIC", "REAL", "DOUBLE PRECISION",
  "VARCHAR", "CHAR", "TEXT",
  "DATE", "TIMESTAMP", "TIMESTAMPTZ", "TIME", "TIMETZ", "INTERVAL",
  "BOOLEAN",
  "BYTEA",
  "JSON", "JSONB",
  "UUID", "INET", "CIDR", "MACADDR",
  "ARRAY",
];

const MYSQL_ENGINES = ["InnoDB", "MyISAM", "MEMORY", "CSV", "ARCHIVE"];

export function CreateTableForm({
  connectionId,
  database,
  dbType,
  onClose,
  onCreated,
}: CreateTableFormProps) {
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [tableName, setTableName] = useState("");
  const [engine, setEngine] = useState("InnoDB");
  const [columns, setColumns] = useState<CreateColumnInput[]>([
    {
      name: "id",
      data_type: dbType === "mysql" ? "INT" : "SERIAL",
      length: undefined,
      is_nullable: false,
      default_value: undefined,
      is_auto_increment: dbType === "mysql",
      comment: undefined,
    },
  ]);
  const [primaryKey, setPrimaryKey] = useState<string[]>(["id"]);
  const [isCreating, setIsCreating] = useState(false);

  const dataTypes = dbType === "mysql" ? MYSQL_DATA_TYPES : POSTGRES_DATA_TYPES;

  const addColumn = () => {
    setColumns([
      ...columns,
      {
        name: "",
        data_type: dbType === "mysql" ? "VARCHAR" : "VARCHAR",
        length: 255,
        is_nullable: true,
        default_value: undefined,
        is_auto_increment: false,
        comment: undefined,
      },
    ]);
  };

  const removeColumn = (index: number) => {
    const col = columns[index];
    setColumns(columns.filter((_, i) => i !== index));
    setPrimaryKey(primaryKey.filter((pk) => pk !== col.name));
  };

  const updateColumn = (index: number, updates: Partial<CreateColumnInput>) => {
    setColumns(
      columns.map((col, i) => (i === index ? { ...col, ...updates } : col))
    );
  };

  const togglePrimaryKey = (columnName: string) => {
    if (primaryKey.includes(columnName)) {
      setPrimaryKey(primaryKey.filter((pk) => pk !== columnName));
    } else {
      setPrimaryKey([...primaryKey, columnName]);
    }
  };

  const handleCreate = async () => {
    if (!tableName.trim()) {
      showError("Validation error", "Table name is required");
      return;
    }

    if (columns.length === 0) {
      showError("Validation error", "At least one column is required");
      return;
    }

    const invalidColumns = columns.filter((col) => !col.name.trim());
    if (invalidColumns.length > 0) {
      showError("Validation error", "All columns must have a name");
      return;
    }

    setIsCreating(true);
    try {
      const input: CreateTableInput = {
        connection_id: connectionId,
        database,
        name: tableName.trim(),
        columns,
        primary_key: primaryKey.length > 0 ? primaryKey : undefined,
        engine: dbType === "mysql" ? engine : undefined,
      };

      await databaseApi.createTable(input);
      showSuccess("Table created", tableName);
      onCreated();
      onClose();
    } catch (error) {
      showError("Failed to create table", String(error));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Table className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Create Table in {database}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Table Name & Engine */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Table Name</label>
              <input
                type="text"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="my_table"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {dbType === "mysql" && (
              <div>
                <label className="block text-sm font-medium mb-1">Engine</label>
                <select
                  value={engine}
                  onChange={(e) => setEngine(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {MYSQL_ENGINES.map((eng) => (
                    <option key={eng} value={eng}>
                      {eng}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Columns */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Columns</label>
              <button
                onClick={addColumn}
                className="flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-accent"
              >
                <Plus className="w-4 h-4" />
                Add Column
              </button>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary">
                  <tr>
                    <th className="px-3 py-2 text-left w-8">PK</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left w-20">Length</th>
                    <th className="px-3 py-2 text-left w-20">Nullable</th>
                    <th className="px-3 py-2 text-left w-20">Auto Inc</th>
                    <th className="px-3 py-2 text-left">Default</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((col, index) => (
                    <tr key={index} className="border-t border-border">
                      <td className="px-3 py-2">
                        <button
                          onClick={() => col.name && togglePrimaryKey(col.name)}
                          disabled={!col.name}
                          className={cn(
                            "p-1 rounded",
                            primaryKey.includes(col.name)
                              ? "text-yellow-500"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          title="Primary Key"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          value={col.name}
                          onChange={(e) =>
                            updateColumn(index, { name: e.target.value })
                          }
                          placeholder="column_name"
                          className="w-full px-2 py-1 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <select
                          value={col.data_type}
                          onChange={(e) =>
                            updateColumn(index, { data_type: e.target.value })
                          }
                          className="w-full px-2 py-1 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          {dataTypes.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          value={col.length || ""}
                          onChange={(e) =>
                            updateColumn(index, {
                              length: e.target.value
                                ? parseInt(e.target.value)
                                : undefined,
                            })
                          }
                          placeholder="-"
                          className="w-full px-2 py-1 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={col.is_nullable}
                          onChange={(e) =>
                            updateColumn(index, { is_nullable: e.target.checked })
                          }
                          className="rounded"
                        />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={col.is_auto_increment}
                          onChange={(e) =>
                            updateColumn(index, {
                              is_auto_increment: e.target.checked,
                            })
                          }
                          className="rounded"
                          disabled={dbType === "postgresql"}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          value={col.default_value || ""}
                          onChange={(e) =>
                            updateColumn(index, {
                              default_value: e.target.value || undefined,
                            })
                          }
                          placeholder="NULL"
                          className="w-full px-2 py-1 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <button
                          onClick={() => removeColumn(index)}
                          disabled={columns.length === 1}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {primaryKey.length > 0 && (
              <div className="mt-2 text-sm text-muted-foreground">
                Primary Key: <span className="font-mono">{primaryKey.join(", ")}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating || !tableName.trim() || columns.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
            Create Table
          </button>
        </div>
      </div>
    </div>
  );
}
