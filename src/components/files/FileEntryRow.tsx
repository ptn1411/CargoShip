import { File, Folder, Link2, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { FileEntry } from "../../lib/tauri";
import { FileContextMenu } from "./FileContextMenu";

interface FileEntryRowProps {
  entry: FileEntry;
  onNavigate: (path: string) => void;
  onOpenFile?: (entry: FileEntry) => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onUpload: () => void;
  onChangePermissions?: (entry: FileEntry) => void;
}

const fileTypeIcons = {
  file: File,
  directory: Folder,
  symlink: Link2,
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function FileEntryRow({
  entry,
  onNavigate,
  onOpenFile,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onUpload,
  onChangePermissions,
}: FileEntryRowProps) {
  const Icon = fileTypeIcons[entry.file_type];
  const isDirectory = entry.file_type === "directory";

  const handleClick = () => {
    if (isDirectory) {
      onNavigate(entry.path);
    }
  };

  const handleDoubleClick = () => {
    if (isDirectory) {
      onNavigate(entry.path);
    } else if (onOpenFile) {
      onOpenFile(entry);
    }
  };

  return (
    <FileContextMenu
      entry={entry}
      onOpenFile={onOpenFile}
      onNewFile={onNewFile}
      onNewFolder={onNewFolder}
      onRename={onRename}
      onDelete={onDelete}
      onUpload={onUpload}
      onChangePermissions={onChangePermissions}
    >
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
          isDirectory
            ? "cursor-pointer hover:bg-accent"
            : "hover:bg-accent/50 cursor-pointer"
        )}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {/* Icon */}
        <div className={cn(
          "shrink-0",
          entry.file_type === "directory" && "text-blue-500",
          entry.file_type === "symlink" && "text-purple-500",
          entry.file_type === "file" && "text-muted-foreground"
        )}>
          <Icon className="w-5 h-5" />
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <span className={cn(
            "truncate block",
            isDirectory && "font-medium"
          )}>
            {entry.name}
          </span>
        </div>

        {/* Size */}
        <div className="w-24 text-right text-sm text-muted-foreground shrink-0">
          {entry.file_type === "file" ? formatFileSize(entry.size) : "—"}
        </div>

        {/* Permissions */}
        <div className="w-24 text-sm text-muted-foreground font-mono shrink-0 hidden md:block">
          {entry.permissions}
        </div>

        {/* Modified Date */}
        <div className="w-40 text-sm text-muted-foreground shrink-0 hidden lg:block">
          {formatDate(entry.modified_at)}
        </div>

        {/* Navigate Arrow for directories */}
        {isDirectory && (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </div>
    </FileContextMenu>
  );
}
