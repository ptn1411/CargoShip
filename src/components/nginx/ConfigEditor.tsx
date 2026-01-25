import { useState, useEffect } from "react";
import { Save, RotateCcw, Plus, FileCode } from "lucide-react";
import Editor from "@monaco-editor/react";
import { nginxApi, NginxDomain, ConfigSnippet } from "../../lib/tauri";
import { useAppStore } from "../../store";

interface Props {
  serverId: string;
  domain: NginxDomain | null;
  domains: NginxDomain[];
  onDomainSelect: (domain: NginxDomain | null) => void;
}

export function ConfigEditor({ serverId, domain, domains, onDomainSelect }: Props) {
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);
  const editorSettings = useAppStore((state) => state.editorSettings);

  const [config, setConfig] = useState("");
  const [originalConfig, setOriginalConfig] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [snippets, setSnippets] = useState<ConfigSnippet[]>([]);
  const [showSnippets, setShowSnippets] = useState(false);

  useEffect(() => {
    loadSnippets();
  }, []);

  useEffect(() => {
    if (domain) {
      loadConfig();
    } else {
      setConfig("");
      setOriginalConfig("");
    }
  }, [domain]);

  const loadSnippets = async () => {
    try {
      const data = await nginxApi.getSnippets();
      setSnippets(data);
    } catch (error) {
      console.error("Failed to load snippets:", error);
    }
  };

  const loadConfig = async () => {
    if (!domain) return;
    
    setIsLoading(true);
    try {
      const content = await nginxApi.getDomainConfig(serverId, domain.domain);
      setConfig(content);
      setOriginalConfig(content);
    } catch (error) {
      showError("Failed to load config", String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!domain) return;
    
    setIsSaving(true);
    try {
      await nginxApi.saveDomainConfig(serverId, domain.domain, config);
      setOriginalConfig(config);
      showSuccess("Config saved", "Nginx configuration has been updated and reloaded");
    } catch (error) {
      showError("Failed to save config", String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(originalConfig);
  };

  const handleInsertSnippet = (snippet: ConfigSnippet) => {
    setConfig(config + "\n\n" + snippet.content);
    setShowSnippets(false);
  };

  const isModified = config !== originalConfig;

  // Group snippets by category
  const snippetsByCategory = snippets.reduce((acc, snippet) => {
    if (!acc[snippet.category]) {
      acc[snippet.category] = [];
    }
    acc[snippet.category].push(snippet);
    return acc;
  }, {} as Record<string, ConfigSnippet[]>);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-3">
          <select
            value={domain?.domain || ""}
            onChange={(e) => {
              const selected = domains.find(d => d.domain === e.target.value);
              onDomainSelect(selected || null);
            }}
            className="px-3 py-1.5 bg-background border border-border rounded-md text-sm"
          >
            <option value="">Select domain to edit</option>
            {domains.map((d) => (
              <option key={d.id} value={d.domain}>
                {d.domain}
              </option>
            ))}
          </select>

          {domain && (
            <span className="text-sm text-muted-foreground font-mono">
              {domain.config_path}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSnippets(!showSnippets)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent"
          >
            <Plus className="w-4 h-4" />
            Insert Snippet
          </button>
          
          <button
            onClick={handleReset}
            disabled={!isModified}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          
          <button
            onClick={handleSave}
            disabled={!isModified || isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? "Saving..." : "Save & Reload"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex">
        {/* Editor */}
        <div className="flex-1">
          {!domain ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <FileCode className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Select a domain to edit its configuration</p>
              </div>
            </div>
          ) : isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <Editor
              height="100%"
              language="nginx"
              value={config}
              onChange={(value) => setConfig(value || "")}
              theme={editorSettings.theme}
              options={{
                fontSize: editorSettings.fontSize,
                fontFamily: editorSettings.fontFamily,
                tabSize: editorSettings.tabSize,
                wordWrap: editorSettings.wordWrap ? "on" : "off",
                minimap: { enabled: false },
                lineNumbers: "on",
                scrollBeyondLastLine: false,
              }}
            />
          )}
        </div>

        {/* Snippets Panel */}
        {showSnippets && (
          <div className="w-80 border-l border-border overflow-auto">
            <div className="p-3 border-b border-border">
              <h4 className="font-medium">Config Snippets</h4>
              <p className="text-xs text-muted-foreground">Click to insert at cursor</p>
            </div>
            <div className="p-2">
              {Object.entries(snippetsByCategory).map(([category, categorySnippets]) => (
                <div key={category} className="mb-4">
                  <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-2">
                    {category}
                  </h5>
                  <div className="space-y-1">
                    {categorySnippets.map((snippet) => (
                      <button
                        key={snippet.id}
                        onClick={() => handleInsertSnippet(snippet)}
                        className="w-full text-left p-2 rounded hover:bg-accent transition-colors"
                      >
                        <div className="font-medium text-sm">{snippet.name}</div>
                        <div className="text-xs text-muted-foreground">{snippet.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      {domain && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-border text-xs text-muted-foreground">
          <span>
            {isModified && <span className="text-yellow-500 mr-2">● Modified</span>}
            nginx config
          </span>
          <span>
            {config.split("\n").length} lines
          </span>
        </div>
      )}
    </div>
  );
}
