import { useCallback, useEffect, useState } from "react";
import { X, Save } from "lucide-react";
import { useActiveFile, useEditorActions, useIsSavingFile } from "../../store";
import { MonacoEditor } from "./MonacoEditor";

interface EditorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * EditorModal component - Fullscreen modal editor
 * Opens file in fullscreen modal with X and Save buttons
 * Prompts for save confirmation when closing with unsaved changes
 */
export function EditorModal({ isOpen, onClose }: EditorModalProps) {
  const activeFile = useActiveFile();
  const isSaving = useIsSavingFile();
  const { updateFileContent, saveFile, closeFile } = useEditorActions();
  
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Handle content change
  const handleContentChange = useCallback((content: string) => {
    if (activeFile) {
      updateFileContent(activeFile.id, content);
    }
  }, [activeFile, updateFileContent]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (activeFile && activeFile.isModified) {
      await saveFile(activeFile.id);
    }
  }, [activeFile, saveFile]);

  // Handle close with unsaved changes check
  const handleClose = useCallback(() => {
    if (activeFile?.isModified) {
      setShowConfirmDialog(true);
    } else {
      // Close file and modal
      if (activeFile) {
        closeFile(activeFile.id);
      }
      onClose();
    }
  }, [activeFile, onClose, closeFile]);

  // Handle confirm dialog actions
  const handleSaveAndClose = useCallback(async () => {
    if (activeFile) {
      await saveFile(activeFile.id);
      closeFile(activeFile.id);
    }
    setShowConfirmDialog(false);
    onClose();
  }, [activeFile, saveFile, closeFile, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    // Close file without saving
    if (activeFile) {
      closeFile(activeFile.id);
    }
    setShowConfirmDialog(false);
    onClose();
  }, [activeFile, closeFile, onClose]);

  const handleCancelClose = useCallback(() => {
    setShowConfirmDialog(false);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      // Escape to close
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleSave, handleClose]);

  if (!isOpen || !activeFile) {
    return null;
  }

  return (
    <>
      {/* Fullscreen Modal Overlay */}
      <div 
        className="fixed inset-0 z-50 bg-background flex flex-col animate-slide-up"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
          <div className="flex items-center gap-3">
            <span className="font-medium truncate max-w-md" title={activeFile.remotePath}>
              {activeFile.remotePath}
            </span>
            {activeFile.isModified && (
              <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-600 dark:text-yellow-400">
                Unsaved
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={!activeFile.isModified || isSaving}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Save (Ctrl+S)"
            >
              <Save className="w-4 h-4" />
              {isSaving ? "Saving..." : "Save"}
            </button>
            
            {/* Close Button */}
            <button
              onClick={handleClose}
              className="p-2 rounded-md hover:bg-secondary transition-colors"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 overflow-hidden">
          <MonacoEditor
            filePath={activeFile.remotePath}
            content={activeFile.content}
            onChange={handleContentChange}
            language={activeFile.language}
          />
        </div>
      </div>

      {/* Confirm Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 animate-fade-in">
          <div className="bg-background border border-border rounded-lg shadow-lg p-6 max-w-md w-full mx-4 animate-slide-up">
            <h3 className="text-lg font-semibold mb-2">Unsaved Changes</h3>
            <p className="text-muted-foreground mb-6">
              You have unsaved changes. Do you want to save before closing?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelClose}
                className="px-4 py-2 rounded-md border border-border hover:bg-secondary transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDiscardAndClose}
                className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors text-sm"
              >
                Don't Save
              </button>
              <button
                onClick={handleSaveAndClose}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
