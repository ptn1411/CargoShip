import { FileEntry } from "../../lib/tauri";
import { FileEntryRow } from "./FileEntryRow";
import { FileContextMenu } from "./FileContextMenu";
import { Loader2, FolderOpen } from "lucide-react";

interface FileTreeProps {
  entries: FileEntry[];
  isLoading: boolean;
  onNavigate: (path: string) => void;
  onOpenFile?: (entry: FileEntry) => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onUpload: () => void;
  onChangePermissions?: (entry: FileEntry) => void;
}

export function FileTree({
  entries,
  isLoading,
  onNavigate,
  onOpenFile,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onUpload,
  onChangePermissions,
}: FileTreeProps) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <FileContextMenu
        entry={null}
        onOpenFile={onOpenFile}
        onNewFile={onNewFile}
        onNewFolder={onNewFolder}
        onRename={() => {}}
        onDelete={() => {}}
        onUpload={onUpload}
        onChangePermissions={onChangePermissions}
      >
        <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
          <FolderOpen className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">This directory is empty</p>
          <p className="text-sm text-muted-foreground mt-2">
            Right-click to create a new file or folder
          </p>
        </div>
      </FileContextMenu>
    );
  }

  // Sort entries: directories first, then files, alphabetically
  const sortedEntries = [...entries].sort((a, b) => {
    if (a.file_type === "directory" && b.file_type !== "directory") return -1;
    if (a.file_type !== "directory" && b.file_type === "directory") return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <FileContextMenu
      entry={null}
      onOpenFile={onOpenFile}
      onNewFile={onNewFile}
      onNewFolder={onNewFolder}
      onRename={() => {}}
      onDelete={() => {}}
      onUpload={onUpload}
      onChangePermissions={onChangePermissions}
    >
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-border text-sm font-medium text-muted-foreground sticky top-0 bg-background">
          <div className="w-5 shrink-0" /> {/* Icon space */}
          <div className="flex-1">Name</div>
          <div className="w-24 text-right shrink-0">Size</div>
          <div className="w-24 shrink-0 hidden md:block">Permissions</div>
          <div className="w-40 shrink-0 hidden lg:block">Modified</div>
          <div className="w-4 shrink-0" /> {/* Arrow space */}
        </div>

        {/* Entries */}
        <div className="divide-y divide-border/50">
          {sortedEntries.map((entry) => (
            <FileEntryRow
              key={entry.path}
              entry={entry}
              onNavigate={onNavigate}
              onOpenFile={onOpenFile}
              onNewFile={onNewFile}
              onNewFolder={onNewFolder}
              onRename={onRename}
              onDelete={onDelete}
              onUpload={onUpload}
              onChangePermissions={onChangePermissions}
            />
          ))}
        </div>
      </div>
    </FileContextMenu>
  );
}
