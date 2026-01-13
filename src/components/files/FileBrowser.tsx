import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, X, Server, ChevronDown, Upload, FilePlus, FolderPlus } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import { parseError } from "../../lib/errorHandler";
import { Breadcrumb } from "./Breadcrumb";
import { FileTree } from "./FileTree";
import { InputDialog } from "./InputDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { UploadDialog } from "./UploadDialog";
import { SudoPasswordDialog } from "./SudoPasswordDialog";
import { FileEntry, fileApi, credentialApi } from "../../lib/tauri";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

// Dialog state types
type DialogType = "newFile" | "newFolder" | "rename" | "delete" | "upload" | null;

// Pending operation for sudo retry
interface PendingOperation {
  type: "createFile" | "createFolder" | "delete" | "rename" | "openFile";
  params: Record<string, unknown>;
}

interface FileBrowserProps {
  onOpenFileFullscreen?: () => void;
}

export function FileBrowser({ onOpenFileFullscreen }: FileBrowserProps) {
  const servers = useAppStore((state) => state.servers);
  const currentServerId = useAppStore((state) => state.currentServerId);
  const currentPath = useAppStore((state) => state.currentPath);
  const fileEntries = useAppStore((state) => state.fileEntries);
  const breadcrumbs = useAppStore((state) => state.breadcrumbs);
  const isLoadingFiles = useAppStore((state) => state.isLoadingFiles);
  const fileError = useAppStore((state) => state.fileError);
  const searchPattern = useAppStore((state) => state.searchPattern);
  const serverStatus = useAppStore((state) => state.serverStatus);

  const navigateToPath = useAppStore((state) => state.navigateToPath);
  const refreshDirectory = useAppStore((state) => state.refreshDirectory);
  const searchFiles = useAppStore((state) => state.searchFiles);
  const clearSearch = useAppStore((state) => state.clearSearch);
  const setFileBrowserServer = useAppStore((state) => state.setFileBrowserServer);
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);
  const openFile = useAppStore((state) => state.openFile);

  const [searchInput, setSearchInput] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dialog state
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);
  const [selectedEntry, setSelectedEntry] = useState<FileEntry | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // Sudo password dialog state
  const [showSudoDialog, setShowSudoDialog] = useState(false);
  const [sudoError, setSudoError] = useState<string | null>(null);
  const [isSudoLoading, setIsSudoLoading] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<PendingOperation | null>(null);

  const currentServer = servers.find((s) => s.id === currentServerId);
  const onlineServers = servers.filter((s) => serverStatus[s.id] === "online");

  // Check if error is sudo password required
  const isSudoPasswordError = (error: unknown): boolean => {
    const errorStr = String(error);
    return errorStr.includes("SUDO_PASSWORD_REQUIRED") || 
           (errorStr.includes("sudo:") && (errorStr.includes("password") || errorStr.includes("terminal")));
  };

  // Sync search input with store
  useEffect(() => {
    setSearchInput(searchPattern);
  }, [searchPattern]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshDirectory();
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message, {
        label: "Retry",
        onClick: handleRefresh,
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      try {
        await searchFiles(searchInput.trim());
      } catch (error) {
        const parsed = parseError(error);
        showError(parsed.title, parsed.message);
      }
    }
  };

  const handleClearSearch = () => {
    setSearchInput("");
    clearSearch();
  };

  const handleNavigate = async (path: string) => {
    if (currentServerId) {
      try {
        await navigateToPath(currentServerId, path);
      } catch (error) {
        const parsed = parseError(error);
        showError(parsed.title, parsed.message);
      }
    }
  };

  const handleServerSelect = async (serverId: string) => {
    try {
      setFileBrowserServer(serverId);
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    }
  };

  // File operation handlers
  const handleOpenFile = async (entry: FileEntry) => {
    if (currentServerId && entry.file_type === "file") {
      try {
        await openFile(currentServerId, entry.path);
        // Open fullscreen modal after file is loaded
        if (onOpenFileFullscreen) {
          onOpenFileFullscreen();
        }
      } catch (error) {
        if (isSudoPasswordError(error)) {
          setPendingOperation({ type: "openFile", params: { entry } });
          setShowSudoDialog(true);
        } else {
          const parsed = parseError(error);
          showError(parsed.title, parsed.message);
        }
      }
    }
  };

  const handleNewFile = () => {
    setSelectedEntry(null);
    setDialogError(null);
    setActiveDialog("newFile");
  };

  const handleNewFolder = () => {
    setSelectedEntry(null);
    setDialogError(null);
    setActiveDialog("newFolder");
  };

  const handleRename = (entry: FileEntry) => {
    setSelectedEntry(entry);
    setDialogError(null);
    setActiveDialog("rename");
  };

  const handleDelete = (entry: FileEntry) => {
    setSelectedEntry(entry);
    setDialogError(null);
    setActiveDialog("delete");
  };

  const handleUpload = () => {
    setDialogError(null);
    setActiveDialog("upload");
  };

  const closeDialog = () => {
    setActiveDialog(null);
    setSelectedEntry(null);
    setDialogError(null);
    setIsProcessing(false);
  };

  // Sudo password handlers
  const handleSudoPasswordSubmit = useCallback(async (password: string) => {
    if (!currentServerId || !pendingOperation) return;
    
    setIsSudoLoading(true);
    setSudoError(null);
    
    try {
      // Store sudo password
      await credentialApi.setSudoPassword(currentServerId, password);
      
      // Retry the pending operation
      const op = pendingOperation;
      setPendingOperation(null);
      setShowSudoDialog(false);
      
      switch (op.type) {
        case "createFile":
          await handleCreateFile(op.params.name as string);
          break;
        case "createFolder":
          await handleCreateFolder(op.params.name as string);
          break;
        case "delete":
          await handleDeleteConfirm();
          break;
        case "rename":
          await handleRenameSubmit(op.params.newName as string);
          break;
        case "openFile":
          if (op.params.entry) {
            await handleOpenFile(op.params.entry as FileEntry);
          }
          break;
      }
    } catch (error) {
      if (isSudoPasswordError(error)) {
        setSudoError("Incorrect password. Please try again.");
      } else {
        const parsed = parseError(error);
        showError(parsed.title, parsed.message);
        setShowSudoDialog(false);
      }
    } finally {
      setIsSudoLoading(false);
    }
  }, [currentServerId, pendingOperation, showError]);

  const handleSudoCancelDialog = useCallback(() => {
    setShowSudoDialog(false);
    setSudoError(null);
    setPendingOperation(null);
  }, []);

  // File operation implementations
  const handleCreateFile = async (name: string) => {
    if (!currentServerId) return;
    
    setIsProcessing(true);
    setDialogError(null);
    
    try {
      const newPath = currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
      await fileApi.createFile(currentServerId, newPath);
      showSuccess("File created", name);
      closeDialog();
      await refreshDirectory();
      // Open the newly created file in editor
      await openFile(currentServerId, newPath);
    } catch (error) {
      if (isSudoPasswordError(error)) {
        setPendingOperation({ type: "createFile", params: { name } });
        setShowSudoDialog(true);
        closeDialog();
      } else {
        const parsed = parseError(error);
        setDialogError(parsed.message);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateFolder = async (name: string) => {
    if (!currentServerId) return;
    
    setIsProcessing(true);
    setDialogError(null);
    
    try {
      const newPath = currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
      await fileApi.createDirectory(currentServerId, newPath);
      showSuccess("Folder created", name);
      closeDialog();
      await refreshDirectory();
    } catch (error) {
      if (isSudoPasswordError(error)) {
        setPendingOperation({ type: "createFolder", params: { name } });
        setShowSudoDialog(true);
        closeDialog();
      } else {
        const parsed = parseError(error);
        setDialogError(parsed.message);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRenameSubmit = async (newName: string) => {
    if (!currentServerId || !selectedEntry) return;
    
    setIsProcessing(true);
    setDialogError(null);
    
    try {
      const parentPath = selectedEntry.path.substring(0, selectedEntry.path.lastIndexOf("/")) || "/";
      const newPath = parentPath === "/" ? `/${newName}` : `${parentPath}/${newName}`;
      
      await fileApi.renameFile(currentServerId, selectedEntry.path, newPath);
      showSuccess("Renamed", `${selectedEntry.name} → ${newName}`);
      closeDialog();
      await refreshDirectory();
    } catch (error) {
      if (isSudoPasswordError(error)) {
        setPendingOperation({ type: "rename", params: { newName } });
        setShowSudoDialog(true);
        closeDialog();
      } else {
        const parsed = parseError(error);
        setDialogError(parsed.message);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!currentServerId || !selectedEntry) return;
    
    setIsProcessing(true);
    setDialogError(null);
    
    try {
      await fileApi.deleteFile(currentServerId, selectedEntry.path);
      showSuccess("Deleted", selectedEntry.name);
      closeDialog();
      await refreshDirectory();
    } catch (error) {
      if (isSudoPasswordError(error)) {
        setPendingOperation({ type: "delete", params: {} });
        setShowSudoDialog(true);
        closeDialog();
      } else {
        const parsed = parseError(error);
        setDialogError(parsed.message);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Validation functions
  const validateFileName = (name: string): string | null => {
    if (!name.trim()) {
      return "Name cannot be empty";
    }
    if (name.includes("/") || name.includes("\\")) {
      return "Name cannot contain slashes";
    }
    if (name === "." || name === "..") {
      return "Invalid name";
    }
    const exists = fileEntries.some(
      (e) => e.name.toLowerCase() === name.toLowerCase() && e !== selectedEntry
    );
    if (exists) {
      return "A file or folder with this name already exists";
    }
    return null;
  };

  // No server selected state
  if (!currentServerId) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">File Browser</h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
            <Server className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">Select a server</h3>
          <p className="text-muted-foreground mb-4">
            Choose a connected server to browse its files
          </p>
          {onlineServers.length > 0 ? (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
                  Select Server
                  <ChevronDown className="w-4 h-4" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="min-w-[200px] bg-popover border border-border rounded-md p-1 shadow-md z-50"
                  sideOffset={5}
                >
                  {onlineServers.map((server) => (
                    <DropdownMenu.Item
                      key={server.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                      onClick={() => handleServerSelect(server.id)}
                    >
                      <Server className="w-4 h-4" />
                      {server.name}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : (
            <p className="text-sm text-muted-foreground">
              No connected servers. Test a connection first.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">File Browser</h2>
          {/* Server Selector */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent">
                <Server className="w-4 h-4" />
                {currentServer?.name || "Select Server"}
                <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[200px] bg-popover border border-border rounded-md p-1 shadow-md z-50"
                sideOffset={5}
              >
                {servers.map((server) => (
                  <DropdownMenu.Item
                    key={server.id}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none hover:bg-accent",
                      server.id === currentServerId && "bg-accent"
                    )}
                    onClick={() => handleServerSelect(server.id)}
                  >
                    <Server className="w-4 h-4" />
                    {server.name}
                    {serverStatus[server.id] === "online" && (
                      <span className="ml-auto w-2 h-2 rounded-full bg-green-500" />
                    )}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
        <div className="flex items-center gap-2">
          {/* Quick Actions */}
          <button
            onClick={handleNewFile}
            className="p-2 rounded-md border border-border hover:bg-accent"
            title="New File"
          >
            <FilePlus className="w-4 h-4" />
          </button>
          <button
            onClick={handleNewFolder}
            className="p-2 rounded-md border border-border hover:bg-accent"
            title="New Folder"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
          <button
            onClick={handleUpload}
            className="p-2 rounded-md border border-border hover:bg-accent"
            title="Upload Files"
          >
            <Upload className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-border mx-1" />
          {/* Search */}
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search files..."
              className="w-48 pl-9 pr-8 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-secondary"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </form>
          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-md border border-border hover:bg-accent disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      <div className="mb-3 pb-3 border-b border-border">
        <Breadcrumb breadcrumbs={breadcrumbs} onNavigate={handleNavigate} />
      </div>

      {/* Search indicator */}
      {searchPattern && (
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            Showing results for "{searchPattern}" in {currentPath}
          </span>
          <button
            onClick={handleClearSearch}
            className="text-primary hover:underline"
          >
            Clear search
          </button>
        </div>
      )}

      {/* Error Message */}
      {fileError && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {fileError}
        </div>
      )}

      {/* File Tree */}
      <FileTree
        entries={fileEntries}
        isLoading={isLoadingFiles}
        onNavigate={handleNavigate}
        onOpenFile={handleOpenFile}
        onNewFile={handleNewFile}
        onNewFolder={handleNewFolder}
        onRename={handleRename}
        onDelete={handleDelete}
        onUpload={handleUpload}
      />

      {/* New File Dialog */}
      <InputDialog
        isOpen={activeDialog === "newFile"}
        title="New File"
        description="Create a new file in the current directory"
        label="File name"
        placeholder="example.txt"
        submitText="Create"
        isLoading={isProcessing}
        error={dialogError}
        onSubmit={handleCreateFile}
        onClose={closeDialog}
        validate={validateFileName}
      />

      {/* New Folder Dialog */}
      <InputDialog
        isOpen={activeDialog === "newFolder"}
        title="New Folder"
        description="Create a new folder in the current directory"
        label="Folder name"
        placeholder="new-folder"
        submitText="Create"
        isLoading={isProcessing}
        error={dialogError}
        onSubmit={handleCreateFolder}
        onClose={closeDialog}
        validate={validateFileName}
      />

      {/* Rename Dialog */}
      <InputDialog
        isOpen={activeDialog === "rename"}
        title="Rename"
        description={`Rename "${selectedEntry?.name}"`}
        label="New name"
        initialValue={selectedEntry?.name || ""}
        submitText="Rename"
        isLoading={isProcessing}
        error={dialogError}
        onSubmit={handleRenameSubmit}
        onClose={closeDialog}
        validate={validateFileName}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={activeDialog === "delete"}
        title="Delete"
        message={`Are you sure you want to delete this ${selectedEntry?.file_type === "directory" ? "folder" : "file"}? This action cannot be undone.`}
        details={selectedEntry?.path}
        confirmText="Delete"
        isDestructive={true}
        isLoading={isProcessing}
        onConfirm={handleDeleteConfirm}
        onCancel={closeDialog}
      />

      {/* Upload Dialog */}
      <UploadDialog
        isOpen={activeDialog === "upload"}
        serverId={currentServerId}
        remotePath={currentPath}
        onClose={closeDialog}
        onComplete={() => {
          closeDialog();
          refreshDirectory();
        }}
      />

      {/* Sudo Password Dialog */}
      <SudoPasswordDialog
        isOpen={showSudoDialog}
        serverName={currentServer?.name || "Server"}
        onSubmit={handleSudoPasswordSubmit}
        onCancel={handleSudoCancelDialog}
        error={sudoError}
        isLoading={isSudoLoading}
      />
    </div>
  );
}
