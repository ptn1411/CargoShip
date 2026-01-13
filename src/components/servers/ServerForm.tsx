import { useState, useEffect } from "react";
import { X, Eye, EyeOff, Loader2, FolderOpen } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { cn } from "../../lib/utils";
import { Server, CreateServerInput, UpdateServerInput, serverApi } from "../../lib/tauri";

interface ServerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server?: Server | null;
  onSubmit: (input: CreateServerInput | UpdateServerInput, credential?: string, keyPassphrase?: string) => Promise<void>;
}

const environments = [
  { value: "dev" as const, label: "Development" },
  { value: "staging" as const, label: "Staging" },
  { value: "prod" as const, label: "Production" },
];

const authMethods = [
  { value: "password" as const, label: "Password" },
  { value: "ssh_key" as const, label: "SSH Key" },
];

export function ServerForm({ open, onOpenChange, server, onSubmit }: ServerFormProps) {
  const isEditing = !!server;
  
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [authMethod, setAuthMethod] = useState<"password" | "ssh_key">("password");
  const [credential, setCredential] = useState("");
  const [keyPassphrase, setKeyPassphrase] = useState("");
  const [showCredential, setShowCredential] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [environment, setEnvironment] = useState<"dev" | "staging" | "prod">("dev");
  const [tags, setTags] = useState("");
  const [useSudo, setUseSudo] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Reset form when dialog opens/closes or server changes
  useEffect(() => {
    if (open) {
      if (server) {
        setName(server.name);
        setHost(server.host);
        setPort(String(server.port));
        setUsername(server.username);
        setAuthMethod(server.auth_method);
        setEnvironment(server.environment);
        setTags(server.tags.join(", "));
        setUseSudo(server.use_sudo || false);
        setCredential("");
        setKeyPassphrase("");
      } else {
        setName("");
        setHost("");
        setPort("22");
        setUsername("");
        setAuthMethod("password");
        setEnvironment("dev");
        setTags("");
        setUseSudo(false);
        setCredential("");
        setKeyPassphrase("");
      }
      setError(null);
      setDuplicateWarning(null);
    }
  }, [open, server]);

  // Check for duplicates when host/port/username changes
  useEffect(() => {
    const checkDuplicate = async () => {
      if (!host || !port || !username) {
        setDuplicateWarning(null);
        return;
      }
      
      try {
        const isDuplicate = await serverApi.checkDuplicate(
          host,
          parseInt(port, 10),
          username,
          server?.id
        );
        if (isDuplicate) {
          setDuplicateWarning("A server with this host, port, and username already exists.");
        } else {
          setDuplicateWarning(null);
        }
      } catch {
        // Ignore errors during duplicate check
      }
    };

    const timeoutId = setTimeout(checkDuplicate, 500);
    return () => clearTimeout(timeoutId);
  }, [host, port, username, server?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const portNum = parseInt(port, 10);
      
      // Validation
      if (!name.trim()) {
        throw new Error("Name is required");
      }
      if (!host.trim()) {
        throw new Error("Host is required");
      }
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        throw new Error("Port must be between 1 and 65535");
      }
      if (!username.trim()) {
        throw new Error("Username is required");
      }
      if (!isEditing && !credential.trim()) {
        throw new Error(authMethod === "password" ? "Password is required" : "SSH key path is required");
      }

      const parsedTags = tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      if (isEditing) {
        const input: UpdateServerInput = {
          name: name.trim(),
          host: host.trim(),
          port: portNum,
          username: username.trim(),
          auth_method: authMethod,
          environment,
          tags: parsedTags,
          use_sudo: useSudo,
        };
        await onSubmit(input, credential.trim() || undefined, keyPassphrase || undefined);
      } else {
        const input: CreateServerInput = {
          name: name.trim(),
          host: host.trim(),
          port: portNum,
          username: username.trim(),
          auth_method: authMethod,
          environment,
          tags: parsedTags,
          use_sudo: useSudo,
        };
        await onSubmit(input, credential.trim(), keyPassphrase || undefined);
      }

      onOpenChange(false);
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
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-background border border-border rounded-lg shadow-lg z-50 p-6">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">
              {isEditing ? "Edit Server" : "Add Server"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-secondary">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="My Server"
              />
            </div>

            {/* Host and Port */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Host</label>
                <input
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="192.168.1.1 or example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Port</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  min="1"
                  max="65535"
                />
              </div>
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-medium mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="root"
              />
            </div>

            {/* Auth Method */}
            <div>
              <label className="block text-sm font-medium mb-1">Authentication</label>
              <div className="flex gap-2">
                {authMethods.map((method) => (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => setAuthMethod(method.value)}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-md border text-sm transition-colors",
                      authMethod === method.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input hover:bg-accent"
                    )}
                  >
                    {method.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Credential */}
            <div>
              <label className="block text-sm font-medium mb-1">
                {authMethod === "password" ? "Password" : "SSH Key Path"}
                {isEditing && <span className="text-muted-foreground ml-1">(leave empty to keep current)</span>}
              </label>
              <div className="relative flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={authMethod === "password" ? (showCredential ? "text" : "password") : "text"}
                    value={credential}
                    onChange={(e) => setCredential(e.target.value)}
                    className="w-full px-3 py-2 pr-10 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder={authMethod === "password" ? "••••••••" : "/home/user/.ssh/id_rsa"}
                  />
                  {authMethod === "password" && (
                    <button
                      type="button"
                      onClick={() => setShowCredential(!showCredential)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    >
                      {showCredential ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                {authMethod === "ssh_key" && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const selected = await openFileDialog({
                          multiple: false,
                          directory: false,
                          title: "Select SSH Key",
                          filters: [{
                            name: "SSH Keys",
                            extensions: ["pem", "pub", "key", "*"]
                          }]
                        });
                        if (selected && typeof selected === "string") {
                          setCredential(selected);
                        }
                      } catch (err) {
                        console.error("Failed to open file dialog:", err);
                      }
                    }}
                    className="px-3 py-2 rounded-md border border-input bg-background text-sm hover:bg-accent flex items-center gap-2"
                    title="Browse for SSH key file"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Browse
                  </button>
                )}
              </div>
            </div>

            {/* SSH Key Passphrase (only shown for SSH key auth) */}
            {authMethod === "ssh_key" && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Key Passphrase
                  <span className="text-muted-foreground ml-1">(optional, leave empty if key has no passphrase)</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassphrase ? "text" : "password"}
                    value={keyPassphrase}
                    onChange={(e) => setKeyPassphrase(e.target.value)}
                    className="w-full px-3 py-2 pr-10 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassphrase(!showPassphrase)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Environment */}
            <div>
              <label className="block text-sm font-medium mb-1">Environment</label>
              <div className="flex gap-2">
                {environments.map((env) => (
                  <button
                    key={env.value}
                    type="button"
                    onClick={() => setEnvironment(env.value)}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-md border text-sm transition-colors",
                      environment === env.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input hover:bg-accent"
                    )}
                  >
                    {env.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium mb-1">Tags</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="web, database, api (comma separated)"
              />
            </div>

            {/* Use Sudo */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useSudo}
                  onChange={(e) => setUseSudo(e.target.checked)}
                  className="w-4 h-4 rounded border-border"
                />
                <span className="text-sm font-medium">Use sudo for file operations</span>
              </label>
              <span className="text-xs text-muted-foreground">
                (requires passwordless sudo or NOPASSWD)
              </span>
            </div>

            {/* Duplicate Warning */}
            {duplicateWarning && (
              <div className="p-3 rounded-md bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-sm">
                {duplicateWarning}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
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
                {isEditing ? "Save Changes" : "Add Server"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
