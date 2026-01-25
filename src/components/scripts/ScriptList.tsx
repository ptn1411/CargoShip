import { useEffect, useState } from "react";
import {
  Plus,
  FileCode,
  MoreVertical,
  Copy,
  Download,
  Trash2,
  Edit,
  RefreshCw,
  Loader2,
  Upload,
  Tag,
  Clock,
  Play,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import { DeploymentScript } from "../../lib/tauri";
import { parseError } from "../../lib/errorHandler";
import { ConfirmDialog } from "../files/ConfirmDialog";
import { FavoriteButton } from "../quick-actions";

interface ScriptListProps {
  onEditScript: (script: DeploymentScript) => void;
  onCreateNew: () => void;
  onRunScript?: (script: DeploymentScript) => void;
  hideHeader?: boolean;
}

/**
 * ScriptList component displays all deployment scripts with metadata
 * Actions: edit, duplicate, delete, export
 * Requirements: 1.2
 */
export function ScriptList({ onEditScript, onCreateNew, onRunScript, hideHeader = false }: ScriptListProps) {
  const scripts = useAppStore((state) => state.scripts);
  const selectedScriptId = useAppStore((state) => state.selectedScriptId);
  const isLoadingScripts = useAppStore((state) => state.isLoadingScripts);
  const scriptError = useAppStore((state) => state.scriptError);

  const loadScripts = useAppStore((state) => state.loadScripts);
  const deleteScript = useAppStore((state) => state.deleteScript);
  const duplicateScript = useAppStore((state) => state.duplicateScript);
  const exportScript = useAppStore((state) => state.exportScript);
  const importScript = useAppStore((state) => state.importScript);
  const selectScript = useAppStore((state) => state.selectScript);
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeploymentScript | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load scripts on mount
  useEffect(() => {
    loadScripts();
  }, [loadScripts]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadScripts();
    setIsRefreshing(false);
  };

  const handleSelectScript = (script: DeploymentScript) => {
    selectScript(script.id);
  };

  const handleEditScript = (script: DeploymentScript) => {
    selectScript(script.id);
    onEditScript(script);
  };

  const handleDuplicateScript = async (script: DeploymentScript) => {
    try {
      const duplicated = await duplicateScript(script.id);
      showSuccess("Script duplicated", duplicated.name);
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    }
  };

  const handleExportScript = async (script: DeploymentScript) => {
    try {
      const yaml = await exportScript(script.id);
      // Create a download link
      const blob = new Blob([yaml], { type: "text/yaml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${script.name.toLowerCase().replace(/\s+/g, "-")}.yaml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccess("Script exported", script.name);
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    }
  };

  const handleDeleteScript = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteScript(deleteTarget.id);
      showSuccess("Script deleted", deleteTarget.name);
      setDeleteTarget(null);
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleImportScript = async () => {
    // Create file input for YAML import
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".yaml,.yml";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const yaml = await file.text();
        await importScript(yaml);
        showSuccess("Script imported", file.name);
      } catch (error) {
        const parsed = parseError(error);
        showError(parsed.title, parsed.message);
      }
    };
    input.click();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Deployment Scripts</h2>
          <div className="flex items-center gap-2">
            {/* Import Button */}
            <button
              onClick={handleImportScript}
              className="p-2 rounded-md border border-border hover:bg-accent"
              title="Import Script"
            >
              <Upload className="w-4 h-4" />
            </button>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-md border border-border hover:bg-accent disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
            </button>

            {/* Create Script Button */}
            <button
              onClick={onCreateNew}
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" />
              New Script
            </button>
          </div>
        </div>
      )}

      {/* Toolbar when header is hidden */}
      {hideHeader && (
        <div className="flex items-center justify-end gap-2 mb-4">
          <button
            onClick={handleImportScript}
            className="p-2 rounded-md border border-border hover:bg-accent"
            title="Import Script"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-md border border-border hover:bg-accent disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          </button>
        </div>
      )}

      {/* Error Message */}
      {scriptError && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {scriptError}
        </div>
      )}

      {/* Loading State */}
      {isLoadingScripts && scripts.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!isLoadingScripts && scripts.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
            <FileCode className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No deployment scripts</h3>
          <p className="text-muted-foreground mb-4">
            Create your first script or import from a template
          </p>
          <button
            onClick={onCreateNew}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            New Script
          </button>
        </div>
      )}

      {/* Script List */}
      {scripts.length > 0 && (
        <div className="flex-1 overflow-auto space-y-2">
          {scripts.map((script) => (
            <ScriptCard
              key={script.id}
              script={script}
              isSelected={selectedScriptId === script.id}
              onSelect={() => handleSelectScript(script)}
              onEdit={() => handleEditScript(script)}
              onRun={onRunScript ? () => onRunScript(script) : undefined}
              onDuplicate={() => handleDuplicateScript(script)}
              onExport={() => handleExportScript(script)}
              onDelete={() => setDeleteTarget(script)}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Script"
        message="Are you sure you want to delete this script? This action cannot be undone."
        details={deleteTarget?.name}
        confirmText="Delete"
        isDestructive
        isLoading={isDeleting}
        onConfirm={handleDeleteScript}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}


interface ScriptCardProps {
  script: DeploymentScript;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRun?: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
  formatDate: (dateStr: string) => string;
}

function ScriptCard({
  script,
  isSelected,
  onSelect,
  onEdit,
  onRun,
  onDuplicate,
  onExport,
  onDelete,
  formatDate,
}: ScriptCardProps) {
  return (
    <div
      className={cn(
        "relative p-4 rounded-lg border transition-all cursor-pointer",
        isSelected
          ? "border-primary bg-accent"
          : "border-border hover:border-primary/50 hover:bg-accent/50"
      )}
      onClick={onSelect}
      onDoubleClick={onEdit}
    >
      {/* Actions Menu */}
      <div className="absolute top-3 right-3 flex items-center gap-1">
        {/* Favorite Button */}
        <FavoriteButton itemType="script" itemId={script.id} size="sm" />
        {/* Run Button */}
        {onRun && (
          <button
            className="p-1.5 rounded bg-green-500/10 hover:bg-green-500/20 text-green-500"
            onClick={(e) => {
              e.stopPropagation();
              onRun();
            }}
            title="Run Script"
          >
            <Play className="w-4 h-4" />
          </button>
        )}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="p-1 rounded hover:bg-secondary"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="w-4 h-4 text-muted-foreground" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[140px] bg-popover border border-border rounded-md p-1 shadow-md z-50"
              sideOffset={5}
            >
              {onRun && (
                <DropdownMenu.Item
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent text-green-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRun();
                  }}
                >
                  <Play className="w-4 h-4" />
                  Run
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Item
                className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Edit className="w-4 h-4" />
                Edit
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate();
                }}
              >
                <Copy className="w-4 h-4" />
                Duplicate
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  onExport();
                }}
              >
                <Download className="w-4 h-4" />
                Export YAML
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="h-px bg-border my-1" />
              <DropdownMenu.Item
                className="flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none hover:bg-accent text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* Script Info */}
      <div className="flex items-start gap-3 pr-10">
        <div className="p-2 rounded-lg bg-secondary text-primary">
          <FileCode className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{script.name}</h3>
          {script.description && (
            <p className="text-sm text-muted-foreground truncate mt-0.5">
              {script.description}
            </p>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
        {/* Steps count */}
        <span className="flex items-center gap-1">
          {script.steps.length} step{script.steps.length !== 1 ? "s" : ""}
        </span>

        {/* Variables count */}
        {script.variables.length > 0 && (
          <span className="flex items-center gap-1">
            {script.variables.length} variable{script.variables.length !== 1 ? "s" : ""}
          </span>
        )}

        {/* Updated date */}
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDate(script.updated_at)}
        </span>
      </div>

      {/* Tags */}
      {script.tags.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          <Tag className="w-3 h-3 text-muted-foreground" />
          {script.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-full text-xs bg-secondary text-muted-foreground"
            >
              {tag}
            </span>
          ))}
          {script.tags.length > 3 && (
            <span className="text-xs text-muted-foreground">
              +{script.tags.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
