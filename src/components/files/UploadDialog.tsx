import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, X, File, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import { parseError } from "../../lib/errorHandler";
import { fileApi, eventApi, UploadProgress } from "../../lib/tauri";
import { open } from "@tauri-apps/plugin-dialog";

interface UploadFile {
  id: string;
  name: string;
  path: string;
  size: number;
  status: "pending" | "uploading" | "completed" | "failed";
  progress: number;
  error?: string;
}

export interface UploadDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Server ID to upload to */
  serverId: string;
  /** Remote directory path */
  remotePath: string;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Callback when upload completes */
  onComplete: () => void;
}

/**
 * Upload dialog with drag-and-drop zone, file picker, and progress bars
 * 
 * Requirements: 5.1, 5.2, 5.3
 */
export function UploadDialog({
  isOpen,
  serverId,
  remotePath,
  onClose,
  onComplete,
}: UploadDialogProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  // Listen for upload progress events
  useEffect(() => {
    if (!isOpen) return;

    let unsubscribe: (() => void) | null = null;

    const setupListener = async () => {
      const unlisten = await eventApi.onUploadProgress((progress: UploadProgress) => {
        setFiles((prev) =>
          prev.map((f) => {
            if (f.name === progress.file_name) {
              const percentage = progress.total_bytes > 0
                ? Math.round((progress.bytes_uploaded / progress.total_bytes) * 100)
                : 0;
              
              let status: UploadFile["status"] = "uploading";
              let error: string | undefined;
              
              if (progress.status === "completed") {
                status = "completed";
              } else if (progress.status === "pending") {
                status = "pending";
              } else if (typeof progress.status === "object" && "failed" in progress.status) {
                status = "failed";
                error = progress.status.failed;
              }
              
              return { ...f, progress: percentage, status, error };
            }
            return f;
          })
        );
      });
      unsubscribe = unlisten;
    };

    setupListener();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [isOpen]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setFiles([]);
      setIsDragging(false);
      setIsUploading(false);
    }
  }, [isOpen]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // Note: In Tauri, we can't directly access dropped file paths from the browser
    // This would need to be handled via Tauri's drag-and-drop API
    // For now, we'll show a message to use the file picker
    showError(
      "Drag and drop not supported",
      "Please use the 'Browse Files' button to select files"
    );
  }, [showError]);

  const handleBrowseFiles = async () => {
    try {
      const selected = await open({
        multiple: true,
        title: "Select files to upload",
      });

      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        const newFiles: UploadFile[] = paths.map((path) => ({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: path.split(/[/\\]/).pop() || path,
          path,
          size: 0, // Size will be determined during upload
          status: "pending",
          progress: 0,
        }));
        setFiles((prev) => [...prev, ...newFiles]);
      }
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    }
  };

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleUpload = async () => {
    if (files.length === 0 || isUploading) return;

    setIsUploading(true);
    const localPaths = files.map((f) => f.path);

    // Set all files to uploading status
    setFiles((prev) =>
      prev.map((f) => ({ ...f, status: "uploading" as const, progress: 0 }))
    );

    try {
      await fileApi.uploadFiles(serverId, remotePath, localPaths);
      
      // Mark all as completed if no progress events were received
      setFiles((prev) =>
        prev.map((f) => 
          f.status === "uploading" 
            ? { ...f, status: "completed" as const, progress: 100 }
            : f
        )
      );
      
      showSuccess("Upload complete", `${files.length} file(s) uploaded`);
      
      // Wait a moment to show completion status, then close
      setTimeout(() => {
        onComplete();
      }, 1000);
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
      
      // Mark remaining uploading files as failed
      setFiles((prev) =>
        prev.map((f) =>
          f.status === "uploading"
            ? { ...f, status: "failed" as const, error: parsed.message }
            : f
        )
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetryFailed = () => {
    // Reset failed files to pending
    setFiles((prev) =>
      prev.map((f) =>
        f.status === "failed"
          ? { ...f, status: "pending" as const, progress: 0, error: undefined }
          : f
      )
    );
  };

  const totalProgress = files.length > 0
    ? Math.round(files.reduce((sum, f) => sum + f.progress, 0) / files.length)
    : 0;

  const hasFailedFiles = files.some((f) => f.status === "failed");
  const allCompleted = files.length > 0 && files.every((f) => f.status === "completed");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className={cn(
          "relative bg-background border border-border rounded-lg shadow-xl",
          "max-w-lg w-full mx-4 animate-in fade-in zoom-in-95 duration-200"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Upload Files</h2>
            <p className="text-sm text-muted-foreground">
              Upload to: {remotePath}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="p-1 rounded hover:bg-secondary transition-colors disabled:opacity-50"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Drop Zone */}
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50",
              isUploading && "opacity-50 pointer-events-none"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-3">
              Drag and drop files here, or
            </p>
            <button
              onClick={handleBrowseFiles}
              disabled={isUploading}
              className={cn(
                "px-4 py-2 text-sm rounded-lg",
                "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              Browse Files
            </button>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-auto">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg"
                >
                  {/* Status Icon */}
                  <div className="shrink-0">
                    {file.status === "completed" ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : file.status === "failed" ? (
                      <AlertCircle className="w-5 h-5 text-destructive" />
                    ) : file.status === "uploading" ? (
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    ) : (
                      <File className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    {file.error ? (
                      <p className="text-xs text-destructive truncate">{file.error}</p>
                    ) : file.status === "uploading" ? (
                      <div className="mt-1">
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {file.progress}%
                        </p>
                      </div>
                    ) : file.status === "completed" ? (
                      <p className="text-xs text-green-500">Uploaded</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Ready to upload</p>
                    )}
                  </div>

                  {/* Remove Button */}
                  {file.status === "pending" && (
                    <button
                      onClick={() => handleRemoveFile(file.id)}
                      className="p-1 rounded hover:bg-secondary transition-colors"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Total Progress */}
          {isUploading && files.length > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Progress</span>
                <span className="font-medium">{totalProgress}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${totalProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-2 p-4 border-t border-border bg-secondary/30">
          <div className="text-sm text-muted-foreground">
            {files.length > 0 && `${files.length} file(s) selected`}
          </div>
          <div className="flex gap-2">
            {hasFailedFiles && !isUploading && (
              <button
                onClick={handleRetryFailed}
                className={cn(
                  "px-4 py-2 text-sm rounded-lg",
                  "bg-secondary hover:bg-secondary/80 transition-colors"
                )}
              >
                Retry Failed
              </button>
            )}
            <button
              onClick={onClose}
              disabled={isUploading}
              className={cn(
                "px-4 py-2 text-sm rounded-lg",
                "bg-secondary hover:bg-secondary/80 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {allCompleted ? "Close" : "Cancel"}
            </button>
            {!allCompleted && (
              <button
                onClick={handleUpload}
                disabled={files.length === 0 || isUploading}
                className={cn(
                  "px-4 py-2 text-sm rounded-lg",
                  "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 inline animate-spin" />
                    Uploading...
                  </>
                ) : (
                  "Upload"
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input for fallback */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
      />
    </div>
  );
}
