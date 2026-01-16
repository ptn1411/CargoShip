import { useState } from "react";
import { X, Plus, Minus } from "lucide-react";
import { nginxApi, NginxDomain, CreateDomainInput, UpdateDomainInput, TemplateType } from "../../lib/tauri";
import { useAppStore } from "../../store";

interface Props {
  serverId: string;
  domain: NginxDomain | null;
  onClose: () => void;
  onCreated: (domain: NginxDomain) => void;
  onUpdated: (domain: NginxDomain) => void;
}

const templateOptions: { value: TemplateType; label: string; description: string }[] = [
  { value: "static", label: "Static HTML/CSS/JS", description: "Simple static file serving" },
  { value: "php", label: "PHP (Generic)", description: "PHP with PHP-FPM" },
  { value: "php_laravel", label: "PHP Laravel", description: "Laravel framework optimized" },
  { value: "php_wordpress", label: "PHP WordPress", description: "WordPress optimized config" },
  { value: "node_js", label: "Node.js", description: "Node.js with reverse proxy" },
  { value: "node_next_js", label: "Next.js", description: "Next.js with static optimization" },
  { value: "python", label: "Python (Generic)", description: "Python WSGI/ASGI proxy" },
  { value: "python_django", label: "Python Django", description: "Django with static/media" },
  { value: "python_flask", label: "Python Flask", description: "Flask application proxy" },
  { value: "ruby_rails", label: "Ruby on Rails", description: "Rails with ActionCable" },
  { value: "java", label: "Java (Tomcat/Spring)", description: "Java application proxy" },
  { value: "go_lang", label: "Go", description: "Go application proxy" },
  { value: "reverse_proxy", label: "Reverse Proxy", description: "Generic reverse proxy" },
  { value: "load_balancer", label: "Load Balancer", description: "Load balancer with upstream" },
  { value: "custom", label: "Custom", description: "Write your own config" },
];

export function DomainForm({ serverId, domain, onClose, onCreated, onUpdated }: Props) {
  const showError = useAppStore((state) => state.showError);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    domain: domain?.domain || "",
    aliases: domain?.aliases || [],
    rootPath: domain?.root_path || "",
    templateType: (domain?.template_type || "static") as TemplateType,
    proxyPass: domain?.proxy_pass || "",
    enableSsl: false,
  });

  const [newAlias, setNewAlias] = useState("");

  const needsProxyPass = ["node_js", "node_next_js", "python", "python_django", "python_flask", "ruby_rails", "java", "go_lang", "reverse_proxy", "load_balancer"].includes(formData.templateType);

  const handleAddAlias = () => {
    if (newAlias && !formData.aliases.includes(newAlias)) {
      setFormData({ ...formData, aliases: [...formData.aliases, newAlias] });
      setNewAlias("");
    }
  };

  const handleRemoveAlias = (alias: string) => {
    setFormData({ ...formData, aliases: formData.aliases.filter(a => a !== alias) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.domain) {
      showError("Validation Error", "Domain name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      if (domain) {
        // Update existing domain
        const input: UpdateDomainInput = {
          domain: formData.domain !== domain.domain ? formData.domain : undefined,
          aliases: formData.aliases,
          root_path: formData.rootPath || undefined,
          template_type: formData.templateType,
          proxy_pass: needsProxyPass ? formData.proxyPass : undefined,
        };
        const updated = await nginxApi.updateDomain(serverId, domain.domain, input);
        onUpdated(updated);
      } else {
        // Create new domain
        const input: CreateDomainInput = {
          server_id: serverId,
          domain: formData.domain,
          aliases: formData.aliases.length > 0 ? formData.aliases : undefined,
          root_path: formData.rootPath || undefined,
          template_type: formData.templateType,
          proxy_pass: needsProxyPass ? formData.proxyPass : undefined,
          enable_ssl: formData.enableSsl,
        };
        const created = await nginxApi.createDomain(input);
        onCreated(created);
      }
    } catch (error) {
      showError("Failed to save domain", String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">
            {domain ? "Edit Domain" : "Add New Domain"}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Domain Name */}
          <div>
            <label className="block text-sm font-medium mb-1">Domain Name *</label>
            <input
              type="text"
              value={formData.domain}
              onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              placeholder="example.com"
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
              required
            />
          </div>

          {/* Aliases */}
          <div>
            <label className="block text-sm font-medium mb-1">Aliases</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                placeholder="www.example.com"
                className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddAlias())}
              />
              <button
                type="button"
                onClick={handleAddAlias}
                className="px-3 py-2 bg-primary text-primary-foreground rounded-md"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {formData.aliases.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.aliases.map((alias) => (
                  <span
                    key={alias}
                    className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-sm"
                  >
                    {alias}
                    <button
                      type="button"
                      onClick={() => handleRemoveAlias(alias)}
                      className="hover:text-red-500"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Template Type */}
          <div>
            <label className="block text-sm font-medium mb-1">Application Type *</label>
            <select
              value={formData.templateType}
              onChange={(e) => setFormData({ ...formData, templateType: e.target.value as TemplateType })}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
            >
              {templateOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} - {opt.description}
                </option>
              ))}
            </select>
          </div>

          {/* Root Path */}
          <div>
            <label className="block text-sm font-medium mb-1">Document Root</label>
            <input
              type="text"
              value={formData.rootPath}
              onChange={(e) => setFormData({ ...formData, rootPath: e.target.value })}
              placeholder={`/var/www/${formData.domain || "example.com"}`}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Leave empty to use default: /var/www/{formData.domain || "domain"}
            </p>
          </div>

          {/* Proxy Pass (for applicable templates) */}
          {needsProxyPass && (
            <div>
              <label className="block text-sm font-medium mb-1">Proxy Pass URL *</label>
              <input
                type="text"
                value={formData.proxyPass}
                onChange={(e) => setFormData({ ...formData, proxyPass: e.target.value })}
                placeholder="http://127.0.0.1:3000"
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The backend server URL to proxy requests to
              </p>
            </div>
          )}

          {/* Enable SSL (only for new domains) */}
          {!domain && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enableSsl"
                checked={formData.enableSsl}
                onChange={(e) => setFormData({ ...formData, enableSsl: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="enableSsl" className="text-sm">
                Enable SSL with Let's Encrypt (requires valid domain pointing to this server)
              </label>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : domain ? "Update Domain" : "Create Domain"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
