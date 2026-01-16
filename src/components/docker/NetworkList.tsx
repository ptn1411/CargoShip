import { useState, useEffect } from "react";
import { Plus, Trash2, RefreshCw, Search, Network } from "lucide-react";
import { dockerApi, DockerNetwork, CreateNetworkInput } from "../../lib/tauri";
import { useAppStore } from "../../store";
import { LoadingSpinner } from "../ui";

interface NetworkListProps {
  serverId: string;
}

export function NetworkList({ serverId }: NetworkListProps) {
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);
  const [networks, setNetworks] = useState<DockerNetwork[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newNetworkName, setNewNetworkName] = useState("");
  const [newNetworkDriver, setNewNetworkDriver] = useState("bridge");
  const [isCreating, setIsCreating] = useState(false);

  const loadNetworks = async () => {
    setIsLoading(true);
    try {
      const list = await dockerApi.listNetworks(serverId);
      setNetworks(list);
    } catch (err) {
      showError("Failed to load networks", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNetworks();
  }, [serverId]);

  const handleCreate = async () => {
    if (!newNetworkName.trim()) return;
    setIsCreating(true);
    try {
      const input: CreateNetworkInput = {
        name: newNetworkName,
        driver: newNetworkDriver,
      };
      await dockerApi.createNetwork(serverId, input);
      showSuccess("Network created", `Network ${newNetworkName} created`);
      setNewNetworkName("");
      setShowCreateForm(false);
      loadNetworks();
    } catch (err) {
      showError("Failed to create network", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRemove = async (name: string) => {
    // Don't allow removing default networks
    if (["bridge", "host", "none"].includes(name)) {
      showError("Cannot remove", "Default networks cannot be removed");
      return;
    }
    try {
      await dockerApi.removeNetwork(serverId, name);
      showSuccess("Network removed");
      loadNetworks();
    } catch (err) {
      showError("Failed to remove network", err instanceof Error ? err.message : "Unknown error");
    }
  };

  const filteredNetworks = networks.filter((net) =>
    net.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const driverColors: Record<string, string> = {
    bridge: "bg-blue-500/20 text-blue-500",
    host: "bg-green-500/20 text-green-500",
    overlay: "bg-purple-500/20 text-purple-500",
    macvlan: "bg-orange-500/20 text-orange-500",
    none: "bg-gray-500/20 text-gray-500",
  };

  return (
    <div className="p-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search networks..."
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
            Create Network
          </button>
          <button onClick={loadNetworks} className="p-2 hover:bg-accent rounded-lg">
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="mb-4 p-4 bg-secondary border border-border rounded-lg">
          <h4 className="font-medium mb-3">Create New Network</h4>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newNetworkName}
              onChange={(e) => setNewNetworkName(e.target.value)}
              placeholder="Network name"
              className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
            />
            <select
              value={newNetworkDriver}
              onChange={(e) => setNewNetworkDriver(e.target.value)}
              className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
            >
              <option value="bridge">Bridge</option>
              <option value="overlay">Overlay</option>
              <option value="macvlan">Macvlan</option>
            </select>
            <button
              onClick={handleCreate}
              disabled={isCreating || !newNetworkName.trim()}
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

      {/* Network List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : filteredNetworks.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {searchQuery ? "No networks match your search" : "No networks found"}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredNetworks.map((network) => (
            <div
              key={network.id}
              className="flex items-center justify-between p-3 bg-secondary border border-border rounded-lg"
            >
              <div className="flex items-center gap-3">
                <Network className="w-5 h-5 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{network.name}</p>
                    <span className={`px-2 py-0.5 rounded text-xs ${driverColors[network.driver] || "bg-accent"}`}>
                      {network.driver}
                    </span>
                    {network.internal && (
                      <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-500 rounded text-xs">
                        internal
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    ID: {network.id.substring(0, 12)} • Scope: {network.scope}
                  </p>
                </div>
              </div>
              {!["bridge", "host", "none"].includes(network.name) && (
                <button
                  onClick={() => handleRemove(network.name)}
                  className="p-2 text-destructive hover:bg-destructive/10 rounded"
                  title="Remove network"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
