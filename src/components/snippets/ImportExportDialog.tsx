import { useState } from "react";
import { X, Loader2, Download, Upload, FileJson, CheckCircle, AlertCircle } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import { parseError } from "../../lib/errorHandler";

interface ImportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * ImportExportDialog component for importing/exporting snippets
 * Requirements: 5.6, 5.7
 */
export function ImportExportDialog({ open, onOpenChange }: ImportExportDialogProps) {
  const exportSnippets = useAppStore((state) => state.exportSnippets);
  const importSnippets = useAppStore((state) => state.importSnippets);
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [activeTab, setActiveTab] = useState<"export" | "import">("export");
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const json = await exportSnippets();
      
      // Create download link
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `snippets-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showSuccess("Export successful", "Snippets exported to JSON file");
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const json = await file.text();
        setImportJson(json);
      } catch (error) {
        showError("Failed to read file", "Could not read the selected file");
      }
    };
    input.click();
  };

  const handleImport = async () => {
    if (!importJson.trim()) {
      showError("No data", "Please paste JSON or select a file to import");
      return;
    }

    setIsImporting(true);
    setImportResult(null);
    try {
      const result = await importSnippets(importJson);
      setImportResult(result);
      
      if (result.imported > 0) {
        showSuccess(
          "Import successful",
          `${result.imported} snippet${result.imported !== 1 ? "s" : ""} imported`
        );
      }
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setImportJson("");
    setImportResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-background border border-border rounded-lg shadow-lg z-50 p-6 max-h-[85vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
              <FileJson className="w-5 h-5" />
              Import / Export Snippets
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-secondary">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          <Tabs.Root value={activeTab} onValueChange={(v) => setActiveTab(v as "export" | "import")}>
            <Tabs.List className="flex border-b border-border mb-4">
              <Tabs.Trigger
                value="export"
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  activeTab === "export"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Download className="w-4 h-4" />
                Export
              </Tabs.Trigger>
              <Tabs.Trigger
                value="import"
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  activeTab === "import"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Upload className="w-4 h-4" />
                Import
              </Tabs.Trigger>
            </Tabs.List>

            {/* Export Tab */}
            <Tabs.Content value="export" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Export all your snippets to a JSON file. You can use this file to backup your snippets
                or share them with others.
              </p>
              
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {isExporting ? "Exporting..." : "Export Snippets"}
              </button>
            </Tabs.Content>

            {/* Import Tab */}
            <Tabs.Content value="import" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Import snippets from a JSON file. Existing snippets with the same name will be skipped.
              </p>

              {/* File Upload Button */}
              <button
                onClick={handleImportFile}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md border border-dashed border-border hover:bg-accent transition-colors"
              >
                <Upload className="w-4 h-4" />
                Select JSON File
              </button>

              <div className="text-center text-sm text-muted-foreground">or paste JSON below</div>

              {/* JSON Input */}
              <textarea
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                placeholder='{"version": "1.0", "snippets": [...]}'
                rows={6}
              />

              {/* Import Result */}
              {importResult && (
                <div className="p-3 rounded-md bg-secondary space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>{importResult.imported} snippet{importResult.imported !== 1 ? "s" : ""} imported</span>
                  </div>
                  {importResult.skipped > 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{importResult.skipped} skipped (already exist)</span>
                    </div>
                  )}
                  {importResult.errors.length > 0 && (
                    <div className="space-y-1">
                      {importResult.errors.map((err, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-destructive">
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          <span>{err}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Import Button */}
              <button
                onClick={handleImport}
                disabled={isImporting || !importJson.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isImporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {isImporting ? "Importing..." : "Import Snippets"}
              </button>
            </Tabs.Content>
          </Tabs.Root>

          {/* Close Button */}
          <div className="flex justify-end pt-4 mt-4 border-t border-border">
            <Dialog.Close asChild>
              <button className="px-4 py-2 rounded-md border border-input text-sm hover:bg-accent">
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
