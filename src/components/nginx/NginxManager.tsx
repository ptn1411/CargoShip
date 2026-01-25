import { useState, useEffect } from "react";
import { Globe, Plus, RefreshCw, Shield, Settings } from "lucide-react";
import { useAppStore } from "../../store";
import { nginxApi, NginxDomain, NginxStatus as NginxStatusType } from "../../lib/tauri";
import { DomainList } from "./DomainList";
import { DomainForm } from "./DomainForm";
import { ConfigEditor } from "./ConfigEditor";
import { SslManager } from "./SslManager";
import { NginxStatus } from "./NginxStatus";
import { Button, EmptyState } from "../ui";

type Tab = "domains" | "ssl" | "config";

export function NginxManager() {
  const servers = useAppStore((state) => state.servers);
  const loadServers = useAppStore((state) => state.loadServers);
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("domains");
  const [domains, setDomains] = useState<NginxDomain[]>([]);
  const [status, setStatus] = useState<NginxStatusType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDomainForm, setShowDomainForm] = useState(false);
  const [editingDomain, setEditingDomain] = useState<NginxDomain | null>(null);
  const [configDomain, setConfigDomain] = useState<NginxDomain | null>(null);

  useEffect(() => {
    if (servers.length === 0) {
      loadServers();
    }
  }, [servers.length, loadServers]);

  useEffect(() => {
    if (selectedServerId) {
      loadNginxData();
    }
  }, [selectedServerId]);

  const loadNginxData = async () => {
    if (!selectedServerId) return;
    
    setIsLoading(true);
    try {
      const [statusData, domainsData] = await Promise.all([
        nginxApi.getStatus(selectedServerId),
        nginxApi.listDomains(selectedServerId),
      ]);
      setStatus(statusData);
      setDomains(domainsData);
    } catch (error) {
      showError("Failed to load Nginx data", String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    loadNginxData();
  };

  const handleDomainCreated = (domain: NginxDomain) => {
    setDomains([...domains, domain]);
    setShowDomainForm(false);
    showSuccess("Domain created", domain.domain);
  };

  const handleDomainUpdated = (domain: NginxDomain) => {
    setDomains(domains.map(d => d.id === domain.id ? domain : d));
    setEditingDomain(null);
    showSuccess("Domain updated", domain.domain);
  };

  const handleDomainDeleted = (domainName: string) => {
    setDomains(domains.filter(d => d.domain !== domainName));
    showSuccess("Domain deleted", domainName);
  };

  const handleToggleDomain = async (domain: NginxDomain) => {
    if (!selectedServerId) return;
    
    try {
      await nginxApi.toggleDomain(selectedServerId, domain.domain, !domain.enabled);
      setDomains(domains.map(d => 
        d.id === domain.id ? { ...d, enabled: !d.enabled } : d
      ));
      showSuccess(
        domain.enabled ? "Domain disabled" : "Domain enabled",
        domain.domain
      );
    } catch (error) {
      showError("Failed to toggle domain", String(error));
    }
  };

  const handleEditConfig = (domain: NginxDomain) => {
    setConfigDomain(domain);
    setActiveTab("config");
  };

  const selectedServer = servers.find(s => s.id === selectedServerId);
  // selectedServer can be used for additional features later
  void selectedServer;

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Globe className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-semibold">Nginx Manager</h2>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Server Selector */}
          <select
            value={selectedServerId || ""}
            onChange={(e) => setSelectedServerId(e.target.value || null)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Select Server</option>
            {servers.map((server) => (
              <option key={server.id} value={server.id}>
                {server.name} ({server.host})
              </option>
            ))}
          </select>

          {selectedServerId && (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                isLoading={isLoading}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              
              <Button
                onClick={() => setShowDomainForm(true)}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Add Domain
              </Button>
            </>
          )}
        </div>
      </div>

      {!selectedServerId ? (
        <EmptyState
          icon={<Globe className="w-8 h-8" />}
          title="Select a server"
          description="Choose a server to manage Nginx configuration"
          className="flex-1"
        />
      ) : (
        <>
          {/* Status Bar */}
          {status && <NginxStatus status={status} serverId={selectedServerId} onRefresh={handleRefresh} />}

          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab("domains")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "domains"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Globe className="w-4 h-4 inline mr-2" />
              Domains ({domains.length})
            </button>
            <button
              onClick={() => setActiveTab("ssl")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "ssl"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Shield className="w-4 h-4 inline mr-2" />
              SSL Certificates
            </button>
            <button
              onClick={() => setActiveTab("config")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "config"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Settings className="w-4 h-4 inline mr-2" />
              Config Editor
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto">
            {activeTab === "domains" && (
              <DomainList
                domains={domains}
                isLoading={isLoading}
                onEdit={setEditingDomain}
                onDelete={handleDomainDeleted}
                onToggle={handleToggleDomain}
                onEditConfig={handleEditConfig}
                serverId={selectedServerId}
              />
            )}
            {activeTab === "ssl" && (
              <SslManager
                serverId={selectedServerId}
                domains={domains}
                onDomainUpdated={handleDomainUpdated}
              />
            )}
            {activeTab === "config" && (
              <ConfigEditor
                serverId={selectedServerId}
                domain={configDomain}
                domains={domains}
                onDomainSelect={setConfigDomain}
              />
            )}
          </div>
        </>
      )}

      {/* Domain Form Modal */}
      {(showDomainForm || editingDomain) && selectedServerId && (
        <DomainForm
          serverId={selectedServerId}
          domain={editingDomain}
          onClose={() => {
            setShowDomainForm(false);
            setEditingDomain(null);
          }}
          onCreated={handleDomainCreated}
          onUpdated={handleDomainUpdated}
        />
      )}
    </div>
  );
}
