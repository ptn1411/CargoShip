import { useState, useEffect } from "react";
import { Plus, Trash2, RefreshCw, Search, HardDrive } from "lucide-react";
import { dockerApi, DockerVolume, CreateVolumeInput } from "../../lib/tauri";
import { useAppStore } from "../../store";
import { LoadingSpinner } from "../ui";

interface VolumeListProps {
  serverId: string;
}

export function VolumeList({ serverId }: VolumeListProps) {
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);
  const [volumes, setVolumes] = useState<DockerVolume[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newVolumeName, setNewVolumeName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const loadVolumes = async () => {
    setIsLoading(true);
    try {
      const list = await dockerApi.listVolumes(serverId);
      setVolumes(list);
    } catch (err) {
      showError("Failed to load volumes", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadVolumes();
  }, [serverId]);

  const handleCreate = async () => {
    if (!newVolumeName.trim()) return;
    setIsCreating(true);
    try {
      const input: CreateVolumeInput = { name: newVolumeName };
      await dockerApi.createVolume(serverId, input);
      showSuccess("Volume created", `Volume ${newVolumeName} created`);
      setNewVolumeName("");
      setShowCreateForm(false);
      loadVolumes();
    } catch (err) {
      showError("Failed to create volume", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRemove = async (name: string) => {
    try {
      await dockerApi.removeVolume(serverId, name, false);
      showSuccess("Volume removed");
      loadVolumes();
    } catch (err) {
      showError("Failed to remove volume", err instanceof Error ? err.message : "Unknown error");
    }
  };

  const filteredVolumes = volumes.filter((vol) =>
    vol.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search volumes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm w-64"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Create Volume
          </button>
          <button onClick={loadVolumes} className="p-2 hover:bg-accent rounded-lg">
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="mb-4 p-4 bg-secondary border border-border rounded-lg">
          <h4 className="font-medium mb-3">Create New Volume</h4>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newVolumeName}
              onChange={(e) => setNewVolumeName(e.target.value)}
              placeholder="Volume name"
              className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <button
              onClick={handleCreate}
              disabled={isCreating || !newVolumeName.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"
            >
              {isCreating ? "Creating..." : "Create"}
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Volume List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : filteredVolumes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {searchQuery ? "No volumes match your search" : "No volumes found"}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredVolumes.map((volume) => (
            <div
              key={volume.name}
              className="flex items-center justify-between p-3 bg-secondary border border-border rounded-lg"
            >
              <div className="flex items-center gap-3">
                <HardDrive className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-medium font-mono">{volume.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Driver: {volume.driver} • {volume.mountpoint}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleRemove(volume.name)}
                className="p-2 text-destructive hover:bg-destructive/10 rounded"
                title="Remove volume"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
