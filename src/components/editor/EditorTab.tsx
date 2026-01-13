import { X, FileText } from "lucide-react";
import { cn } from "../../lib/utils";
import { OpenFile } from "../../store";

interface EditorTabProps {
  file: OpenFile;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}

/**
 * Single editor tab component
 * Displays file name with unsaved indicator and close button
 * 
 * Requirements: 1.5
 */
export function EditorTab({ file, isActive, onSelect, onClose }: EditorTabProps) {
  // Extract filename from path
  const fileName = file.remotePath.split("/").pop() || file.remotePath;

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  const handleMiddleClick = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 border-r border-border cursor-pointer transition-colors group min-w-0",
        isActive
          ? "bg-background text-foreground"
          : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
      onClick={onSelect}
      onMouseDown={handleMiddleClick}
      title={file.remotePath}
    >
      <FileText className="w-4 h-4 shrink-0" />
      <span className="text-sm truncate max-w-[120px]">{fileName}</span>
      
      {/* Unsaved indicator (dot) for modified files */}
      {file.isModified && (
        <span 
          className="w-2 h-2 rounded-full bg-amber-500 shrink-0" 
          title="Unsaved changes"
        />
      )}
      
      <button
        onClick={handleClose}
        className={cn(
          "p-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-colors shrink-0",
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        title="Close file"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
