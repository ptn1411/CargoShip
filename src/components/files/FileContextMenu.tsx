import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  Upload,
  FileEdit,
  Shield,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { FileEntry } from "../../lib/tauri";

export interface FileContextMenuProps {
  /** The file entry being right-clicked (null for empty space) */
  entry: FileEntry | null;
  /** Children to wrap with context menu */
  children: React.ReactNode;
  /** Callback for Open File action */
  onOpenFile?: (entry: FileEntry) => void;
  /** Callback for New File action */
  onNewFile: () => void;
  /** Callback for New Folder action */
  onNewFolder: () => void;
  /** Callback for Rename action */
  onRename: (entry: FileEntry) => void;
  /** Callback for Delete action */
  onDelete: (entry: FileEntry) => void;
  /** Callback for Upload action */
  onUpload: () => void;
  /** Callback for Change Permissions action */
  onChangePermissions?: (entry: FileEntry) => void;
}

/**
 * Context menu for file browser operations
 * Provides: Open, New File, New Folder, Rename, Delete, Change Permissions options
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
export function FileContextMenu({
  entry,
  children,
  onOpenFile,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onUpload,
  onChangePermissions,
}: FileContextMenuProps) {
  const isFile = entry?.file_type === "file";

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        {children}
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content
          className={cn(
            "min-w-[180px] bg-popover border border-border rounded-md p-1 shadow-lg z-50",
            "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
          )}
        >
          {/* Open File (only for files) */}
          {entry && isFile && onOpenFile && (
            <>
              <ContextMenu.Item
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none font-medium",
                  "hover:bg-accent focus:bg-accent"
                )}
                onClick={() => onOpenFile(entry)}
              >
                <FileEdit className="w-4 h-4" />
                Open
              </ContextMenu.Item>
              <ContextMenu.Separator className="h-px my-1 bg-border" />
            </>
          )}

          {/* New File */}
          <ContextMenu.Item
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none",
              "hover:bg-accent focus:bg-accent"
            )}
            onClick={onNewFile}
          >
            <FilePlus className="w-4 h-4" />
            New File
          </ContextMenu.Item>

          {/* New Folder */}
          <ContextMenu.Item
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none",
              "hover:bg-accent focus:bg-accent"
            )}
            onClick={onNewFolder}
          >
            <FolderPlus className="w-4 h-4" />
            New Folder
          </ContextMenu.Item>

          <ContextMenu.Separator className="h-px my-1 bg-border" />

          {/* Upload */}
          <ContextMenu.Item
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none",
              "hover:bg-accent focus:bg-accent"
            )}
            onClick={onUpload}
          >
            <Upload className="w-4 h-4" />
            Upload Files...
          </ContextMenu.Item>

          {/* Entry-specific actions (only show when right-clicking on a file/folder) */}
          {entry && (
            <>
              <ContextMenu.Separator className="h-px my-1 bg-border" />

              {/* Rename */}
              <ContextMenu.Item
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none",
                  "hover:bg-accent focus:bg-accent"
                )}
                onClick={() => onRename(entry)}
              >
                <Pencil className="w-4 h-4" />
                Rename
              </ContextMenu.Item>

              {/* Change Permissions */}
              {onChangePermissions && (
                <ContextMenu.Item
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none",
                    "hover:bg-accent focus:bg-accent"
                  )}
                  onClick={() => onChangePermissions(entry)}
                >
                  <Shield className="w-4 h-4" />
                  Change Permissions
                </ContextMenu.Item>
              )}

              {/* Delete */}
              <ContextMenu.Item
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none",
                  "hover:bg-accent focus:bg-accent text-destructive",
                  "hover:text-destructive focus:text-destructive"
                )}
                onClick={() => onDelete(entry)}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </ContextMenu.Item>
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
