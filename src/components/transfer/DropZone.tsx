import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, FileUp } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";

interface DropZoneProps {
  /** Current remote path */
  remotePath: string;
  /** Children to render inside the drop zone */
  children: React.ReactNode;
  /** Callback when files are dropped */
  onFilesDropped?: (files: File[]) => void;
  /** Whether the drop zone is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * DropZone component - Enables drag-and-drop file uploads
 * - Drop zone in FileBrowser
 * - Visual feedback when dragging
 * Requirements: 3.1, 3.2
 */
export function DropZone({
  remotePath,
  children,
  onFilesDropped,
  disabled = false,
  className,
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  // dragCounter tracks nested drag events to properly detect when drag leaves the component
  const [, setDragCounter] = useState(0);
  const dropRef = useRef<HTMLDivElement>(null);

  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  // Handle drag enter
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (disabled) return;
    
    setDragCounter((prev) => prev + 1);
    
    // Check if files are being dragged
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, [disabled]);

  // Handle drag leave
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setDragCounter((prev) => {
      const newCount = prev - 1;
      if (newCount === 0) {
        setIsDragging(false);
      }
      return newCount;
    });
  }, []);

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (disabled) return;
    
    // Set the drop effect
    e.dataTransfer.dropEffect = "copy";
  }, [disabled]);

  // Handle drop
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(false);
    setDragCounter(0);
    
    if (disabled) return;
    
    const files = Array.from(e.dataTransfer.files);
    
    if (files.length === 0) {
      return;
    }

    // Queue uploads
    try {
      // Call the callback if provided
      if (onFilesDropped) {
        onFilesDropped(files);
      }

      showSuccess(
        "Files ready for upload",
        `${files.length} file(s) selected. Use the upload dialog for actual transfer.`
      );
    } catch (error) {
      showError(
        "Upload failed",
        error instanceof Error ? error.message : String(error)
      );
    }
  }, [disabled, onFilesDropped, showSuccess, showError]);

  // Reset drag state when component unmounts or disabled changes
  useEffect(() => {
    if (disabled) {
      setIsDragging(false);
      setDragCounter(0);
    }
  }, [disabled]);

  return (
    <div
      ref={dropRef}
      className={cn("relative", className)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      
      {/* Drop Overlay */}
      {isDragging && !disabled && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-primary">
            <div className="p-4 rounded-full bg-primary/20">
              <Upload className="w-8 h-8" />
            </div>
            <div className="text-center">
              <p className="text-lg font-medium">Drop files here</p>
              <p className="text-sm text-muted-foreground">
                Files will be uploaded to {remotePath}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * DraggableFile component - Makes a file entry draggable for download
 * Requirements: 3.2
 */
interface DraggableFileProps {
  /** File name */
  fileName: string;
  /** Remote file path */
  remotePath: string;
  /** Server ID */
  serverId: string;
  /** Children to render */
  children: React.ReactNode;
  /** Whether dragging is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

export function DraggableFile({
  fileName,
  remotePath,
  serverId,
  children,
  disabled = false,
  className,
}: DraggableFileProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (disabled) {
      e.preventDefault();
      return;
    }

    setIsDragging(true);
    
    // Set drag data
    e.dataTransfer.setData("application/json", JSON.stringify({
      type: "remote-file",
      fileName,
      remotePath,
      serverId,
    }));
    
    e.dataTransfer.effectAllowed = "copy";
  }, [disabled, fileName, remotePath, serverId]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      draggable={!disabled}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={cn(
        "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * UploadDropIndicator - A small indicator component for upload areas
 */
interface UploadDropIndicatorProps {
  isActive: boolean;
  className?: string;
}

export function UploadDropIndicator({ isActive, className }: UploadDropIndicatorProps) {
  if (!isActive) return null;

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 text-primary text-sm",
      className
    )}>
      <FileUp className="w-4 h-4" />
      <span>Drop files to upload</span>
    </div>
  );
}

export default DropZone;
