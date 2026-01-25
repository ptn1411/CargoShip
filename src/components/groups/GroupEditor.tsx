import { useState, useEffect } from "react";
import { X, Loader2, Server, Check } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "../../lib/utils";
import { ServerGroup, Server as ServerType, CreateGroupInput, UpdateGroupInput } from "../../lib/tauri";

interface GroupEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group?: ServerGroup | null;
  servers: ServerType[];
  onSubmit: (input: CreateGroupInput | UpdateGroupInput) => Promise<void>;
}

export function GroupEditor({ open, onOpenChange, group, servers, onSubmit }: GroupEditorProps) {
  const isEditing = !!group;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens/closes or group changes
  useEffect(() => {
    if (open) {
      if (group) {
        setName(group.name);
        setDescription(group.description || "");
        setSelectedServerIds([...group.server_ids]);
      } else {
        setName("");
        setDescription("");
        setSelectedServerIds([]);
      }
      setSearchQuery("");
      setError(null);
    }
  }, [open, group]);

  const handleToggleServer = (serverId: string) => {
    setSelectedServerIds((prev) =>
      prev.includes(serverId)
        ? prev.filter((id) => id !== serverId)
        : [...prev, serverId]
    );
  };

  const handleSelectAll = () => {
    const filteredIds = filteredServers.map((s) => s.id);
    const allSelected = filteredIds.every((id) => selectedServerIds.includes(id));
    
    if (allSelected) {
      // Deselect all filtered servers
      setSelectedServerIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      // Select all filtered servers
      setSelectedServerIds((prev) => [...new Set([...prev, ...filteredIds])]);
    }
  };

  const filteredServers = servers.filter((server) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      server.name.toLowerCase().includes(query) ||
      server.host.toLowerCase().includes(query) ||
      server.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Validation
      if (!name.trim()) {
        throw new Error("Group name is required");
      }

      if (isEditing) {
        const input: UpdateGroupInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          server_ids: selectedServerIds,
        };
        await onSubmit(input);
      } else {
        const input: CreateGroupInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          server_ids: selectedServerIds,
        };
        await onSubmit(input);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-background border border-border rounded-lg shadow-lg z-50 p-6 max-h-[85vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">
              {isEditing ? "Edit Group" : "Create Group"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-secondary">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Production Servers"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  placeholder="Optional description for this group"
                  rows={2}
                />
              </div>

              {/* Server Selection */}
              <div className="flex flex-col flex-1 min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">
                    Servers ({selectedServerIds.length} selected)
                  </label>
                  {filteredServers.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-xs text-primary hover:underline"
                    >
                      {filteredServers.every((s) => selectedServerIds.includes(s.id))
                        ? "Deselect All"
                        : "Select All"}
                    </button>
                  )}
                </div>

                {/* Search */}
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring mb-2"
                  placeholder="Search servers..."
                />

                {/* Server List */}
                <div className="flex-1 overflow-auto border border-border rounded-md max-h-[200px]">
                  {servers.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No servers available. Add servers first.
                    </div>
                  ) : filteredServers.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No servers match your search.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {filteredServers.map((server) => (
                        <label
                          key={server.id}
                          className={cn(
                            "flex items-center gap-3 p-3 cursor-pointer hover:bg-accent transition-colors",
                            selectedServerIds.includes(server.id) && "bg-accent/50"
                          )}
                        >
                          <div
                            className={cn(
                              "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                              selectedServerIds.includes(server.id)
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-input"
                            )}
                          >
                            {selectedServerIds.includes(server.id) && (
                              <Check className="w-3 h-3" />
                            )}
                          </div>
                          <input
                            type="checkbox"
                            checked={selectedServerIds.includes(server.id)}
                            onChange={() => handleToggleServer(server.id)}
                            className="sr-only"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Server className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium truncate">{server.name}</span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {server.username}@{server.host}:{server.port}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-xs font-medium",
                              server.environment === "dev" && "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
                              server.environment === "staging" && "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
                              server.environment === "prod" && "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                            )}
                          >
                            {server.environment}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-border">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 rounded-md border border-input text-sm hover:bg-accent"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {isEditing ? "Save Changes" : "Create Group"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
