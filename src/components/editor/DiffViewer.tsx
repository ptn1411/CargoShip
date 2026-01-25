import { useCallback, useState, useEffect } from "react";
import { DiffEditor, DiffOnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { X, FileText, GitCompare, Check, RotateCcw } from "lucide-react";
import { cn } from "../../lib/utils";
import { useEditorSettings, useAppStore, useEditorActions } from "../../store";
import { syncApi, FileDiff } from "../../lib/tauri";
import { getLanguageFromPath } from "../../lib/languageMap";
import { LoadingSpinner } from "../ui";

interface DiffViewerProps {
  /** Server ID */
  serverId: string;
  /** Remote file path */
  remotePath: string;
  /** Local content (current editor content) */
  localContent: string;
  /** File ID for conflict resolution */
  fileId: string;
  /** Callback when diff viewer is closed */
  onClose: () => void;
  /** Callback when conflict is resolved */
  onResolved?: () => void;
}

/**
 * Side-by-side diff viewer component using Monaco diff editor
 * Displays local vs remote file comparison with syntax highlighting
 * 
 * Requirements: 6.4
 */
export function DiffViewer({
  serverId,
  remotePath,
  localContent,
  fileId,
  onClose,
  onResolved,
}: DiffViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remoteContent, setRemoteContent] = useState<string>("");
  const [isResolving, setIsResolving] = useState(false);
  
  const settings = useEditorSettings();
  const appTheme = useAppStore((state) => state.theme);
  const { resolveConflict } = useEditorActions();
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const diffEditorRef = React.useRef<editor.IStandaloneDiffEditor | null>(null);

  // Detect language from file path
  const language = getLanguageFromPath(remotePath);
  
  // Extract filename from path
  const fileName = remotePath.split("/").pop() || remotePath;

  // Determine Monaco theme based on app theme
  const getMonacoTheme = useCallback(() => {
    if (settings.theme !== "vs" && settings.theme !== "vs-dark" && settings.theme !== "hc-black") {
      const isDark = appTheme === "dark" || 
        (appTheme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      return isDark ? "vs-dark" : "vs";
    }
    return settings.theme;
  }, [settings.theme, appTheme]);

  // Fetch remote content for diff
  useEffect(() => {
    const fetchDiff = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const diff: FileDiff = await syncApi.getDiff(serverId, remotePath);
        setRemoteContent(diff.remote_content);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);
        showError("Failed to load diff", errorMsg);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDiff();
  }, [serverId, remotePath, showError]);

  // Handle diff editor mount
  const handleDiffMount: DiffOnMount = useCallback((editor) => {
    diffEditorRef.current = editor;
  }, []);

  // Handle keep local (overwrite remote with local)
  const handleKeepLocal = async () => {
    setIsResolving(true);
    try {
      await resolveConflict(fileId, "keep_local");
      showSuccess("Conflict resolved", "Local changes saved to server");
      onResolved?.();
      onClose();
    } catch (err) {
      showError(
        "Failed to resolve conflict",
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setIsResolving(false);
    }
  };

  // Handle use remote (discard local, use remote)
  const handleUseRemote = async () => {
    setIsResolving(true);
    try {
      await resolveConflict(fileId, "use_remote");
      showSuccess("Conflict resolved", "Remote version loaded");
      onResolved?.();
      onClose();
    } catch (err) {
      showError(
        "Failed to resolve conflict",
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setIsResolving(false);
    }
  };

  // Editor options
  const diffOptions: editor.IDiffEditorConstructionOptions = {
    readOnly: true,
    renderSideBySide: true,
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily,
    minimap: { enabled: false },
    lineNumbers: "on",
    scrollBeyondLastLine: false,
    automaticLayout: true,
    renderOverviewRuler: true,
    diffWordWrap: settings.wordWrap ? "on" : "off",
    // Highlight changes
    renderIndicators: true,
    ignoreTrimWhitespace: false,
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-3">
          <GitCompare className="w-5 h-5 text-purple-500" />
          <div>
            <h2 className="font-semibold text-foreground">Compare Changes</h2>
            <p className="text-sm text-muted-foreground" title={remotePath}>
              {fileName}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Resolution buttons */}
          <button
            onClick={handleKeepLocal}
            disabled={isLoading || isResolving}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg",
              "bg-blue-500 hover:bg-blue-600 text-white transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <Check className="w-4 h-4" />
            Keep Local
          </button>
          
          <button
            onClick={handleUseRemote}
            disabled={isLoading || isResolving}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg",
              "bg-green-500 hover:bg-green-600 text-white transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <RotateCcw className="w-4 h-4" />
            Use Remote
          </button>
          
          <button
            onClick={onClose}
            disabled={isResolving}
            className={cn(
              "p-2 rounded-lg hover:bg-secondary transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
            title="Close diff viewer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Labels */}
      <div className="flex border-b border-border bg-secondary/20">
        <div className="flex-1 px-4 py-2 border-r border-border">
          <div className="flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4 text-blue-500" />
            <span className="font-medium">Local (Your Changes)</span>
          </div>
        </div>
        <div className="flex-1 px-4 py-2">
          <div className="flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4 text-green-500" />
            <span className="font-medium">Remote (Server Version)</span>
          </div>
        </div>
      </div>

      {/* Diff Editor */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <LoadingSpinner size="lg" />
              <p className="text-sm text-muted-foreground">Loading diff...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-8">
              <p className="text-destructive font-medium mb-2">Failed to load diff</p>
              <p className="text-sm text-muted-foreground">{error}</p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 text-sm bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <DiffEditor
            height="100%"
            language={language}
            original={localContent}
            modified={remoteContent}
            theme={getMonacoTheme()}
            options={diffOptions}
            onMount={handleDiffMount}
            loading={
              <div className="flex items-center justify-center h-full bg-zinc-900">
                <LoadingSpinner size="lg" />
              </div>
            }
          />
        )}
      </div>

      {/* Footer with legend */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-secondary/30 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 bg-red-500/30 border border-red-500/50 rounded-sm" />
            <span>Removed</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 bg-green-500/30 border border-green-500/50 rounded-sm" />
            <span>Added</span>
          </div>
        </div>
        <div>
          Press <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}

// Need to import React for useRef
import React from "react";
