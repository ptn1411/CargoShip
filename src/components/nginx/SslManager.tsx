import { useState, useEffect } from "react";
import { Shield, RefreshCw, Plus, AlertTriangle, Clock } from "lucide-react";
import { nginxApi, NginxDomain, SslCertificate } from "../../lib/tauri";
import { useAppStore } from "../../store";

interface Props {
  serverId: string;
  domains: NginxDomain[];
  onDomainUpdated: (domain: NginxDomain) => void;
}

export function SslManager({ serverId, domains }: Props) {
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [certificates, setCertificates] = useState<SslCertificate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [issuingDomain, setIssuingDomain] = useState<string | null>(null);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueFormData, setIssueFormData] = useState({
    domain: "",
    email: "",
  });

  useEffect(() => {
    loadCertificates();
  }, [serverId]);

  const loadCertificates = async () => {
    setIsLoading(true);
    try {
      const certs = await nginxApi.listSslCertificates(serverId);
      setCertificates(certs);
    } catch (error) {
      // Certbot might not be installed
      console.error("Failed to load certificates:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleIssueSsl = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!issueFormData.domain || !issueFormData.email) {
      showError("Validation Error", "Domain and email are required");
      return;
    }

    setIssuingDomain(issueFormData.domain);
    try {
      const result = await nginxApi.issueSsl(serverId, issueFormData.domain, issueFormData.email);
      
      if (result.success) {
        showSuccess("SSL Certificate Issued", result.message);
        loadCertificates();
        setShowIssueForm(false);
        setIssueFormData({ domain: "", email: "" });
      } else {
        showError("SSL Issuance Failed", result.message);
      }
    } catch (error) {
      showError("Failed to issue SSL", String(error));
    } finally {
      setIssuingDomain(null);
    }
  };

  const handleRenewAll = async () => {
    setIsLoading(true);
    try {
      await nginxApi.renewSsl(serverId);
      showSuccess("SSL Renewal", "Certificates renewed successfully");
      loadCertificates();
    } catch (error) {
      showError("Failed to renew certificates", String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const domainsWithoutSsl = domains.filter(d => !d.ssl_enabled);

  const getCertStatus = (cert: SslCertificate) => {
    if (cert.days_remaining <= 0) {
      return { color: "text-red-500", bg: "bg-red-500/10", label: "Expired" };
    }
    if (cert.days_remaining <= 7) {
      return { color: "text-red-500", bg: "bg-red-500/10", label: "Expiring Soon" };
    }
    if (cert.days_remaining <= 30) {
      return { color: "text-yellow-500", bg: "bg-yellow-500/10", label: "Renew Soon" };
    }
    return { color: "text-green-500", bg: "bg-green-500/10", label: "Valid" };
  };

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-medium">SSL Certificates</h3>
          <p className="text-sm text-muted-foreground">
            Manage Let's Encrypt SSL certificates with Certbot
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRenewAll}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            Renew All
          </button>
          <button
            onClick={() => setShowIssueForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Issue Certificate
          </button>
        </div>
      </div>

      {/* Certificates List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : certificates.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <Shield className="w-12 h-12 mb-3 opacity-50" />
          <p>No SSL certificates found</p>
          <p className="text-sm">Issue a certificate to enable HTTPS</p>
        </div>
      ) : (
        <div className="space-y-3">
          {certificates.map((cert) => {
            const status = getCertStatus(cert);
            return (
              <div
                key={cert.domain}
                className="p-4 bg-card border border-border rounded-lg"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className={`w-5 h-5 ${status.color}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{cert.domain}</span>
                        <span className={`px-2 py-0.5 text-xs rounded ${status.bg} ${status.color}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Issued by: {cert.issuer}
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      {cert.days_remaining} days remaining
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Expires: {cert.valid_until}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Domains without SSL */}
      {domainsWithoutSsl.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            Domains without SSL ({domainsWithoutSsl.length})
          </h4>
          <div className="space-y-2">
            {domainsWithoutSsl.map((domain) => (
              <div
                key={domain.id}
                className="flex items-center justify-between p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg"
              >
                <span>{domain.domain}</span>
                <button
                  onClick={() => {
                    setIssueFormData({ ...issueFormData, domain: domain.domain });
                    setShowIssueForm(true);
                  }}
                  disabled={issuingDomain === domain.domain}
                  className="text-sm text-primary hover:underline disabled:opacity-50"
                >
                  {issuingDomain === domain.domain ? "Issuing..." : "Issue SSL"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Issue SSL Form Modal */}
      {showIssueForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg w-full max-w-md">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold">Issue SSL Certificate</h3>
              <p className="text-sm text-muted-foreground">
                Using Let's Encrypt via Certbot
              </p>
            </div>

            <form onSubmit={handleIssueSsl} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Domain *</label>
                <select
                  value={issueFormData.domain}
                  onChange={(e) => setIssueFormData({ ...issueFormData, domain: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
                  required
                >
                  <option value="">Select domain</option>
                  {domains.map((d) => (
                    <option key={d.id} value={d.domain}>
                      {d.domain} {d.ssl_enabled ? "(has SSL)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Email *</label>
                <input
                  type="email"
                  value={issueFormData.email}
                  onChange={(e) => setIssueFormData({ ...issueFormData, email: e.target.value })}
                  placeholder="admin@example.com"
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Used for certificate expiration notifications
                </p>
              </div>

              <div className="p-3 bg-muted/50 rounded-md text-sm">
                <p className="font-medium mb-1">Requirements:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>Domain must point to this server</li>
                  <li>Port 80 must be accessible</li>
                  <li>Certbot must be installed on the server</li>
                </ul>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowIssueForm(false)}
                  className="px-4 py-2 text-sm border border-border rounded-md hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!!issuingDomain}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                  {issuingDomain ? "Issuing..." : "Issue Certificate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
