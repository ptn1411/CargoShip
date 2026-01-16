import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { dockerApi, CreateContainerInput, PortMappingInput } from "../../lib/tauri";
import { useAppStore } from "../../store";

interface CreateContainerFormProps {
  serverId: string;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateContainerForm({ serverId, onClose, onCreated }: CreateContainerFormProps) {
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);
  const [isCreating, setIsCreating] = useState(false);

  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [ports, setPorts] = useState<PortMappingInput[]>([]);
  const [envVars, setEnvVars] = useState<string[]>([]);
  const [volumes, setVolumes] = useState<string[]>([]);
  const [network, setNetwork] = useState("");
  const [restartPolicy, setRestartPolicy] = useState("no");
  const [command, setCommand] = useState("");

  const addPort = () => {
    setPorts([...ports, { container_port: 80, host_port: 8080, protocol: "tcp" }]);
  };

  const removePort = (index: number) => {
    setPorts(ports.filter((_, i) => i !== index));
  };

  const updatePort = (index: number, field: keyof PortMappingInput, value: number | string) => {
    const newPorts = [...ports];
    newPorts[index] = { ...newPorts[index], [field]: value };
    setPorts(newPorts);
  };

  const addEnvVar = () => {
    setEnvVars([...envVars, "KEY=value"]);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const addVolume = () => {
    setVolumes([...volumes, "/host/path:/container/path"]);
  };

  const removeVolume = (index: number) => {
    setVolumes(volumes.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !image) {
      showError("Validation error", "Name and image are required");
      return;
    }

    setIsCreating(true);
    try {
      const input: CreateContainerInput = {
        name,
        image,
        ports,
        env: envVars.filter((e) => e.includes("=")),
        volumes: volumes.filter((v) => v.includes(":")),
        network: network || undefined,
        restart_policy: restartPolicy !== "no" ? restartPolicy : undefined,
        command: command || undefined,
      };

      await dockerApi.createContainer(serverId, input);
      showSuccess("Container created", `Container ${name} created successfully`);
      onCreated();
    } catch (err) {
      showError("Failed to create container", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Create Container</h3>
        <button onClick={onClose} className="p-2 hover:bg-accent rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Container Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-container"
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Image *</label>
            <input
              type="text"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="nginx:latest"
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg"
              required
            />
          </div>
        </div>

        {/* Ports */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">Port Mappings</label>
            <button type="button" onClick={addPort} className="text-sm text-primary hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Port
            </button>
          </div>
          {ports.map((port, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <input
                type="number"
                value={port.host_port}
                onChange={(e) => updatePort(i, "host_port", parseInt(e.target.value))}
                placeholder="Host"
                className="w-24 px-2 py-1 bg-secondary border border-border rounded text-sm"
              />
              <span>:</span>
              <input
                type="number"
                value={port.container_port}
                onChange={(e) => updatePort(i, "container_port", parseInt(e.target.value))}
                placeholder="Container"
                className="w-24 px-2 py-1 bg-secondary border border-border rounded text-sm"
              />
              <select
                value={port.protocol || "tcp"}
                onChange={(e) => updatePort(i, "protocol", e.target.value)}
                className="px-2 py-1 bg-secondary border border-border rounded text-sm"
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </select>
              <button type="button" onClick={() => removePort(i)} className="p-1 text-destructive hover:bg-destructive/10 rounded">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Environment Variables */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">Environment Variables</label>
            <button type="button" onClick={addEnvVar} className="text-sm text-primary hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Variable
            </button>
          </div>
          {envVars.map((env, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={env}
                onChange={(e) => {
                  const newEnvs = [...envVars];
                  newEnvs[i] = e.target.value;
                  setEnvVars(newEnvs);
                }}
                placeholder="KEY=value"
                className="flex-1 px-2 py-1 bg-secondary border border-border rounded text-sm font-mono"
              />
              <button type="button" onClick={() => removeEnvVar(i)} className="p-1 text-destructive hover:bg-destructive/10 rounded">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Volumes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">Volume Mounts</label>
            <button type="button" onClick={addVolume} className="text-sm text-primary hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Volume
            </button>
          </div>
          {volumes.map((vol, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={vol}
                onChange={(e) => {
                  const newVols = [...volumes];
                  newVols[i] = e.target.value;
                  setVolumes(newVols);
                }}
                placeholder="/host/path:/container/path"
                className="flex-1 px-2 py-1 bg-secondary border border-border rounded text-sm font-mono"
              />
              <button type="button" onClick={() => removeVolume(i)} className="p-1 text-destructive hover:bg-destructive/10 rounded">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Advanced Options */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Network</label>
            <input
              type="text"
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              placeholder="bridge"
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Restart Policy</label>
            <select
              value={restartPolicy}
              onChange={(e) => setRestartPolicy(e.target.value)}
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg"
            >
              <option value="no">No</option>
              <option value="always">Always</option>
              <option value="on-failure">On Failure</option>
              <option value="unless-stopped">Unless Stopped</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Command (optional)</label>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="e.g., /bin/sh -c 'echo hello'"
            className="w-full px-3 py-2 bg-secondary border border-border rounded-lg font-mono text-sm"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-border rounded-lg hover:bg-accent">
            Cancel
          </button>
          <button
            type="submit"
            disabled={isCreating}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {isCreating ? "Creating..." : "Create Container"}
          </button>
        </div>
      </form>
    </div>
  );
}
