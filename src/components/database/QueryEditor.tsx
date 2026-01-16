import { useState, useRef, useEffect } from "react";
import {
  Play,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  Copy,
  Download,
  Trash2,
  Database,
} from "lucide-react";
import { DatabaseConnection, QueryResult, DatabaseInfo, databaseApi } from "../../lib/tauri";
import { useAppStore } from "../../store";
import { cn } from "../../lib/utils";

interface QueryEditorProps {
  connection: DatabaseConnection;
  database: string | null;
}

interface QueryHistory {
  query: string;
  database: string;
  timestamp: Date;
  success: boolean;
  executionTime: number;
}

const SQL_SNIPPETS = [
  { label: "Select All", query: "SELECT * FROM table_name LIMIT 100;" },
  { label: "Count Rows", query: "SELECT COUNT(*) FROM table_name;" },
  { label: "Show Tables", query: "SHOW TABLES;" },
  { label: "Describe Table", query: "DESCRIBE table_name;" },
  { label: "Show Databases", query: "SHOW DATABASES;" },
  { label: "Create Table", query: `CREATE TABLE table_name (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);` },
  { label: "Insert Row", query: "INSERT INTO table_name (column1, column2) VALUES ('value1', 'value2');" },
  { label: "Update Row", query: "UPDATE table_name SET column1 = 'new_value' WHERE id = 1;" },
  { label: "Delete Row", query: "DELETE FROM table_name WHERE id = 1;" },
];

export function QueryEditor({ connection, database }: QueryEditorProps) {
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [query, setQuery] = useState("");
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [selectedDb, setSelectedDb] = useState(database || "");
  const [isLoadingDbs, setIsLoadingDbs] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [history, setHistory] = useState<QueryHistory[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load databases on mount
  useEffect(() => {
    loadDatabases();
  }, [connection.id]);

  // Update selected database when prop changes
  useEffect(() => {
    if (database) {
      setSelectedDb(database);
    }
  }, [database]);

  const loadDatabases = async () => {
    setIsLoadingDbs(true);
    try {
      const dbs = await databaseApi.listDatabases(connection.id);
      setDatabases(dbs);
    } catch (error) {
      console.error("Failed to load databases:", error);
    } finally {
      setIsLoadingDbs(false);
    }
  };

  const handleExecute = async () => {
    if (!query.trim() || !selectedDb) {
      showError("Cannot execute", "Please enter a query and select a database");
      return;
    }

    setIsExecuting(true);
    setResult(null);

    try {
      const res = await databaseApi.executeQuery({
        connection_id: connection.id,
        database: selectedDb,
        query: query.trim(),
      });

      setResult(res);

      // Add to history
      setHistory((prev) => [
        {
          query: query.trim(),
          database: selectedDb,
          timestamp: new Date(),
          success: !res.error,
          executionTime: res.execution_time_ms,
        },
        ...prev.slice(0, 49), // Keep last 50 queries
      ]);

      if (res.error) {
        showError("Query failed", res.error);
      } else if (!res.is_select) {
        showSuccess("Query executed", `${res.affected_rows} row(s) affected`);
      }
    } catch (error) {
      showError("Query failed", String(error));
    } finally {
      setIsExecuting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl/Cmd + Enter to execute
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleExecute();
    }
    // Tab for indentation
    if (e.key === "Tab") {
      e.preventDefault();
      const start = textareaRef.current?.selectionStart || 0;
      const end = textareaRef.current?.selectionEnd || 0;
      setQuery(query.substring(0, start) + "  " + query.substring(end));
      setTimeout(() => {
        textareaRef.current?.setSelectionRange(start + 2, start + 2);
      }, 0);
    }
  };

  const handleCopyResults = () => {
    if (!result || result.rows.length === 0) return;

    const header = result.columns.join("\t");
    const rows = result.rows.map((row) => row.map((v) => String(v ?? "NULL")).join("\t"));
    const text = [header, ...rows].join("\n");

    navigator.clipboard.writeText(text);
    showSuccess("Copied to clipboard");
  };

  const handleExportCSV = () => {
    if (!result || result.rows.length === 0) return;

    const header = result.columns.join(",");
    const rows = result.rows.map((row) =>
      row
        .map((v) => {
          if (v === null) return "";
          const str = String(v);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",")
    );
    const csv = [header, ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `query_result_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Query Input */}
      <div className="flex-shrink-0 border-b border-border">
        <div className="flex items-center gap-2 p-2 bg-secondary/30">
          <Database className="w-4 h-4 text-muted-foreground" />
          <select
            value={selectedDb}
            onChange={(e) => setSelectedDb(e.target.value)}
            disabled={isLoadingDbs}
            className="px-2 py-1 text-sm rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary min-w-[150px]"
          >
            <option value="">Select database</option>
            {databases.map((db) => (
              <option key={db.name} value={db.name}>
                {db.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleExecute}
            disabled={isExecuting || !query.trim() || !selectedDb}
            className="flex items-center gap-1 px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 text-sm"
          >
            {isExecuting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Execute
          </button>
          <span className="text-xs text-muted-foreground">Ctrl+Enter</span>
          <div className="flex-1" />
          {/* SQL Snippets Dropdown */}
          <select
            onChange={(e) => {
              if (e.target.value) {
                setQuery(e.target.value);
                e.target.value = "";
              }
            }}
            className="px-2 py-1 text-sm rounded border border-border bg-background focus:outline-none text-muted-foreground"
            defaultValue=""
          >
            <option value="" disabled>Insert snippet...</option>
            {SQL_SNIPPETS.map((snippet, i) => (
              <option key={i} value={snippet.query}>
                {snippet.label}
              </option>
            ))}
          </select>
        </div>
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter SQL query...&#10;&#10;Examples:&#10;SELECT * FROM users LIMIT 10;&#10;SHOW TABLES;&#10;DESCRIBE table_name;"
          className="w-full h-32 p-3 font-mono text-sm bg-background resize-none focus:outline-none"
          spellCheck={false}
        />
      </div>

      {/* Results */}
      <div className="flex-1 flex overflow-hidden">
        {/* Result Table */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {result && (
            <>
              {/* Result Header */}
              <div className="flex items-center justify-between p-2 border-b border-border bg-secondary/30">
                <div className="flex items-center gap-2 text-sm">
                  {result.error ? (
                    <XCircle className="w-4 h-4 text-destructive" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  )}
                  {result.is_select ? (
                    <span>{result.rows.length} row(s) returned</span>
                  ) : (
                    <span>{result.affected_rows} row(s) affected</span>
                  )}
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {result.execution_time_ms}ms
                  </span>
                </div>
                {result.is_select && result.rows.length > 0 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleCopyResults}
                      className="p-1 rounded hover:bg-accent text-muted-foreground"
                      title="Copy to clipboard"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleExportCSV}
                      className="p-1 rounded hover:bg-accent text-muted-foreground"
                      title="Export CSV"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Result Content */}
              {result.error ? (
                <div className="p-4 text-destructive bg-destructive/10">
                  <pre className="whitespace-pre-wrap font-mono text-sm">{result.error}</pre>
                </div>
              ) : result.is_select ? (
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 bg-secondary">
                      <tr>
                        {result.columns.map((col, i) => (
                          <th
                            key={i}
                            className="px-3 py-2 text-left font-medium border-b border-border"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-accent/30">
                          {row.map((value, colIndex) => (
                            <td
                              key={colIndex}
                              className="px-3 py-1 border-b border-border"
                            >
                              <span
                                className={cn(
                                  "block truncate max-w-xs",
                                  value === null && "text-muted-foreground italic"
                                )}
                                title={formatValue(value)}
                              >
                                {formatValue(value)}
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 text-center text-muted-foreground">
                  Query executed successfully
                </div>
              )}
            </>
          )}

          {!result && (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Play className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Execute a query to see results</p>
              </div>
            </div>
          )}
        </div>

        {/* Query History */}
        <div className="w-64 border-l border-border flex flex-col">
          <div className="p-2 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium">History</span>
            {history.length > 0 && (
              <button
                onClick={() => setHistory([])}
                className="p-1 rounded hover:bg-accent text-muted-foreground"
                title="Clear history"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {history.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                No history yet
              </div>
            ) : (
              history.map((item, index) => (
                <div
                  key={index}
                  className="p-2 border-b border-border hover:bg-accent/50 cursor-pointer"
                  onClick={() => {
                    setQuery(item.query);
                    setSelectedDb(item.database);
                  }}
                >
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    {item.success ? (
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    ) : (
                      <XCircle className="w-3 h-3 text-destructive" />
                    )}
                    <span>{item.database}</span>
                    <span>•</span>
                    <span>{item.executionTime}ms</span>
                  </div>
                  <div className="text-xs font-mono truncate">{item.query}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {item.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
