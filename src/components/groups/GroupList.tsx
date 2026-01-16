import { useEffect, useState } from "react";
import { Plus, Grid, List, RefreshCw, Loader2, FolderOpen } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import { ServerGroup, CreateGroupInput, UpdateGroupInput } from "../../lib/tauri";
import { parseError } from "../../lib/errorHandler";
import { GroupCard } from "./GroupCard";
import { GroupEditor } from "./GroupEditor";

type ViewMode = "grid" | "list";

export function GroupList() {
  const groups = useAppStore((state) => state.groups);
  const servers = useAppStore((state) => state.servers);
  const selectedGroupId = useAppStore((state) => state.selectedGroupId);
  const isLoadingGroups = useAppStore((state) => state.isLoadingGroups);
  const groupError = useAppStore((state) => state.groupError);

  const loadGroups = useAppStore((state) => state.loadGroups);
  const loadServers = useAppStore((state) => state.loadServers);
  const createGroup = useAppStore((state) => state.createGroup);
  const updateGroup = useAppStore((state) => state.updateGroup);
  const deleteGroup = useAppStore((state) => state.deleteGroup);
  const selectGroup = useAppStore((state) => state.selectGroup);
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ServerGroup | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load groups and servers on mount
  useEffect(() => {
    loadGroups();
    loadServers();
  }, [loadGroups, loadServers]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadGroups(), loadServers()]);
    setIsRefreshing(false);
  };

  const handleAddGroup = () => {
    setEditingGroup(null);
    setIsFormOpen(true);
  };

  const handleEditGroup = (group: ServerGroup) => {
    setEditingGroup(group);
    setIsFormOpen(true);
  };

  const handleDeleteGroup = async (group: ServerGroup) => {
    if (window.confirm(`Are you sure you want to delete "${group.name}"? Servers will not be deleted.`)) {
      try {
        await deleteGroup(group.id);
        showSuccess("Group Deleted", `"${group.name}" has been removed.`);
      } catch (error) {
        const parsed = parseError(error);
        showError(parsed.title, parsed.message);
      }
    }
  };

  const handleFormSubmit = async (
    input: CreateGroupInput | UpdateGroupInput
  ) => {
    try {
      if (editingGroup) {
        await updateGroup(editingGroup.id, input as UpdateGroupInput);
        showSuccess("Group Updated", `"${(input as UpdateGroupInput).name || editingGroup.name}" has been updated.`);
      } else {
        const group = await createGroup(input as CreateGroupInput);
        showSuccess("Group Created", `"${group.name}" has been created.`);
      }
      setIsFormOpen(false);
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
      throw error;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Server Groups</h2>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center border border-border rounded-md">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-2 rounded-l-md transition-colors",
                viewMode === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
              title="Grid view"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-2 rounded-r-md transition-colors",
                viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-md border border-border hover:bg-accent disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          </button>

          {/* Add Group Button */}
          <button
            onClick={handleAddGroup}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Add Group
          </button>
        </div>
      </div>

      {/* Error Message */}
      {groupError && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {groupError}
        </div>
      )}

      {/* Loading State */}
      {isLoadingGroups && groups.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!isLoadingGroups && groups.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
            <FolderOpen className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No groups created</h3>
          <p className="text-muted-foreground mb-4">
            Create groups to organize servers for batch operations
          </p>
          <button
            onClick={handleAddGroup}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Create Group
          </button>
        </div>
      )}

      {/* Group Grid/List */}
      {groups.length > 0 && (
        <div
          className={cn(
            "flex-1 overflow-auto",
            viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 content-start"
              : "flex flex-col gap-2"
          )}
        >
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              isSelected={selectedGroupId === group.id}
              onSelect={() => selectGroup(group.id)}
              onEdit={() => handleEditGroup(group)}
              onDelete={() => handleDeleteGroup(group)}
            />
          ))}
        </div>
      )}

      {/* Group Editor Dialog */}
      <GroupEditor
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        group={editingGroup}
        servers={servers}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
