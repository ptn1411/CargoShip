import { useCallback, useEffect, useRef } from "react";
import { FileCode, Save } from "lucide-react";
import { useOpenFiles, useActiveFile, useEditorActions, useIsSavingFile, useConflicts, useEditorSettings } from "../../store";
import { EditorTabs } from "./EditorTabs";
import { MonacoEditor } from "./MonacoEditor";
import { ConflictDialog } from "./ConflictDialog";

// Conflict check interval in milliseconds (30 seconds)
const CONFLICT_CHECK_INTERVAL = 30 * 1000;

/**
 * FileEditor component - Main editor container
 * Combines EditorTabs and MonacoEditor with conflict handling and auto-save
 * 
 * Requirements: 2.1 - Double-click file opens in editor
 * Requirements: 3.4 - Auto-save with configurable interval
 * Requirements: 6.1, 6.2 - Periodic conflict check every 30 seconds
 */
export function FileEditor() {
  const openFiles = useOpenFiles();
  const activeFile = useActiveFile();
  const conflicts = useConflicts();
  const isSaving = useIsSavingFile();
  const settings = useEditorSettings();
  const { updateFileContent, saveFile, saveAllFiles, checkFileConflict, resolveConflict, clearConflict } = useEditorActions();
  
  // Auto-save timer ref
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Conflict check timer ref
  const conflictCheckTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle content change
  const handleContentChange = useCallback((content: string) => {
    if (activeFile) {
      updateFileContent(activeFile.id, content);
    }
  }, [activeFile, updateFileContent]);

  // Handle keyboard shortcuts (Ctrl+S to save)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (activeFile && activeFile.isModified) {
          saveFile(activeFile.id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeFile, saveFile]);

  // Auto-save implementation (Requirements: 3.4)
  useEffect(() => {
    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    // Only set up auto-save if enabled
    if (!settings.autoSave) {
      return;
    }

    // Set up auto-save interval (convert seconds to milliseconds)
    const intervalMs = settings.autoSaveInterval * 1000;
    
    autoSaveTimerRef.current = setInterval(() => {
      // Check if there are any modified files
      const hasModifiedFiles = openFiles.some((f) => f.isModified);
      if (hasModifiedFiles) {
        saveAllFiles();
      }
    }, intervalMs);

    // Cleanup on unmount or when settings change
    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [settings.autoSave, settings.autoSaveInterval, openFiles, saveAllFiles]);

  // Periodic conflict check implementation (Requirements: 6.1, 6.2)
  useEffect(() => {
    // Clear existing timer
    if (conflictCheckTimerRef.current) {
      clearInterval(conflictCheckTimerRef.current);
      conflictCheckTimerRef.current = null;
    }

    // Only set up conflict check if there are open files
    if (openFiles.length === 0) {
      return;
    }

    // Check conflicts for all open files
    const checkAllConflicts = async () => {
      for (const file of openFiles) {
        // Skip files that already have a conflict detected
        if (conflicts[file.id]) {
          continue;
        }
        
        try {
          await checkFileConflict(file.id);
        } catch (error) {
          // Silently ignore errors during background conflict check
          console.debug("Conflict check failed for", file.remotePath, error);
        }
      }
    };

    // Set up periodic conflict check (every 30 seconds)
    conflictCheckTimerRef.current = setInterval(checkAllConflicts, CONFLICT_CHECK_INTERVAL);

    // Cleanup on unmount or when open files change
    return () => {
      if (conflictCheckTimerRef.current) {
        clearInterval(conflictCheckTimerRef.current);
        conflictCheckTimerRef.current = null;
      }
    };
  }, [openFiles, conflicts, checkFileConflict]);

  // Get conflict for active file
  const activeConflict = activeFile ? conflicts[activeFile.id] : null;

  // Handle conflict resolution
  const handleResolveConflict = useCallback(async (resolution: "keep_local" | "use_remote") => {
    if (activeFile) {
      await resolveConflict(activeFile.id, resolution);
    }
  }, [activeFile, resolveConflict]);

  const handleDismissConflict = useCallback(() => {
    if (activeFile) {
      clearConflict(activeFile.id);
    }
  }, [activeFile, clearConflict]);

  // Empty state - no files open
  if (openFiles.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center bg-secondary/10 rounded-lg">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
          <FileCode className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No files open</h3>
        <p className="text-muted-foreground text-sm max-w-xs">
          Double-click a file in the File Browser to open it for editing
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <EditorTabs />
      
      {/* Editor area */}
      <div className="flex-1 relative">
        {activeFile ? (
          <>
            <MonacoEditor
              filePath={activeFile.remotePath}
              content={activeFile.content}
              onChange={handleContentChange}
              language={activeFile.language}
            />
            
            {/* Saving indicator */}
            {isSaving && (
              <div className="absolute top-2 right-2 flex items-center gap-2 px-3 py-1.5 bg-primary/90 text-primary-foreground rounded-md text-sm">
                <Save className="w-4 h-4 animate-pulse" />
                Saving...
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            Select a tab to view file content
          </div>
        )}
      </div>

      {/* Conflict Dialog */}
      {activeConflict && (
        <ConflictDialog
          open={true}
          onOpenChange={(open) => !open && handleDismissConflict()}
          filePath={activeFile?.remotePath || ""}
          serverId={activeFile?.serverId || ""}
          onResolve={handleResolveConflict}
        />
      )}
    </div>
  );
}
