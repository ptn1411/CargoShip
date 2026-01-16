import { useState, useEffect } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { dockerApi, DockerContainer } from "../../lib/tauri";
import { useAppStore } from "../../store";
import { ContainerCard } from "./ContainerCard";
import { CreateContainerForm } from "./CreateContainerForm";
import { LoadingSpinner } from "../ui";

interface ContainerListProps {
  serverId: string;
  onRefresh?: () => void;
}

export function ContainerList({ serverId, onRefresh }: ContainerListProps) {
  const showError = useAppStore((state) => state.showError);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAll, setShowAll] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const loadContainers = async () => {
    setIsLoading(true);
    try {
      const list = await dockerApi.listContainers(serverId, showAll);
      setContainers(list);
    } catch (err) {
      showError("Failed to load containers", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadContainers();
  }, [serverId, showAll]);

  const handleRefresh = () => {
    loadContainers();
    onRefresh?.();
  };

  const filteredContainers = containers.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.image.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (showCreateForm) {
    return (
      <CreateContainerForm
        serverId={serverId}
        onClose={() => setShowCreateForm(false)}
        onCreated={() => {
          setShowCreateForm(false);
          handleRefresh();
        }}
      />
    );
  }

  return (
    <div className="p-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search containers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm w-64"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="rounded"
            />
            Show all
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Create Container
          </button>
          <button onClick={handleRefresh} className="p-2 hover:bg-accent rounded-lg">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Container List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : filteredContainers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {searchQuery ? "No containers match your search" : "No containers found"}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredContainers.map((container) => (
            <ContainerCard
              key={container.id}
              container={container}
              serverId={serverId}
              onAction={handleRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}
