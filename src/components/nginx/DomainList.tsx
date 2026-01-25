import { Globe, Edit, Trash2, Settings, Shield, ShieldOff, ToggleLeft, ToggleRight, ExternalLink } from "lucide-react";
import { NginxDomain, nginxApi } from "../../lib/tauri";
import { useAppStore } from "../../store";
import { useState } from "react";

interface Props {
  domains: NginxDomain[];
  isLoading: boolean;
  serverId: string;
  onEdit: (domain: NginxDomain) => void;
  onDelete: (domainName: string) => void;
  onToggle: (domain: NginxDomain) => void;
  onEditConfig: (domain: NginxDomain) => void;
}

const templateLabels: Record<string, string> = {
  static: "Static",
  php: "PHP",
  php_laravel: "Laravel",
  php_wordpress: "WordPress",
  node_js: "Node.js",
  node_next_js: "Next.js",
  python: "Python",
  python_django: "Django",
  python_flask: "Flask",
  ruby_rails: "Rails",
  java: "Java",
  go_lang: "Go",
  reverse_proxy: "Reverse Proxy",
  load_balancer: "Load Balancer",
  custom: "Custom",
};

export function DomainList({ domains, isLoading, serverId, onEdit, onDelete, onToggle, onEditConfig }: Props) {
  const showError = useAppStore((state) => state.showError);
  const [deletingDomain, setDeletingDomain] = useState<string | null>(null);

  const handleDelete = async (domain: NginxDomain) => {
    if (!confirm(`Are you sure you want to delete ${domain.domain}?`)) {
      return;
    }

    setDeletingDomain(domain.domain);
    try {
      await nginxApi.deleteDomain(serverId, domain.domain);
      onDelete(domain.domain);
    } catch (error) {
      showError("Failed to delete domain", String(error));
    } finally {
      setDeletingDomain(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (domains.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
        <Globe className="w-12 h-12 mb-3 opacity-50" />
        <p>No domains configured</p>
        <p className="text-sm">Click "Add Domain" to create one</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="space-y-3">
        {domains.map((domain) => (
          <div
            key={domain.id}
            className={`p-4 bg-card border rounded-lg transition-colors ${
              domain.enabled ? "border-border" : "border-border/50 opacity-60"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-primary" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{domain.domain}</span>
                      {domain.ssl_enabled ? (
                        <span title="SSL Enabled">
                          <Shield className="w-4 h-4 text-green-500" />
                        </span>
                      ) : (
                        <span title="No SSL">
                          <ShieldOff className="w-4 h-4 text-muted-foreground" />
                        </span>
                      )}
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        domain.enabled 
                          ? "bg-green-500/10 text-green-500" 
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {domain.enabled ? "Enabled" : "Disabled"}
                      </span>
                      <span className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded">
                        {templateLabels[domain.template_type] || domain.template_type}
                      </span>
                    </div>
                    {domain.aliases.length > 0 && (
                      <div className="text-sm text-muted-foreground mt-1">
                        Aliases: {domain.aliases.join(", ")}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Root: </span>
                    <span className="font-mono text-xs">{domain.root_path}</span>
                  </div>
                  {domain.proxy_pass && (
                    <div>
                      <span className="text-muted-foreground">Proxy: </span>
                      <span className="font-mono text-xs">{domain.proxy_pass}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <a
                  href={`http${domain.ssl_enabled ? "s" : ""}://${domain.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 hover:bg-accent rounded-md transition-colors"
                  title="Open in browser"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  onClick={() => onToggle(domain)}
                  className="p-2 hover:bg-accent rounded-md transition-colors"
                  title={domain.enabled ? "Disable" : "Enable"}
                >
                  {domain.enabled ? (
                    <ToggleRight className="w-4 h-4 text-green-500" />
                  ) : (
                    <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
                <button
                  onClick={() => onEditConfig(domain)}
                  className="p-2 hover:bg-accent rounded-md transition-colors"
                  title="Edit Config"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onEdit(domain)}
                  className="p-2 hover:bg-accent rounded-md transition-colors"
                  title="Edit"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(domain)}
                  disabled={deletingDomain === domain.domain}
                  className="p-2 hover:bg-red-500/10 text-red-500 rounded-md transition-colors disabled:opacity-50"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
