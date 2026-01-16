import { useState, useEffect } from "react";
import { Plus, FileCode, LayoutTemplate, RefreshCw, Loader2, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import { DeploymentScript, TemplateInfo, Deployment } from "../../lib/tauri";
import { ScriptList } from "./ScriptList";
import { ScriptEditor } from "./ScriptEditor";
import { DeploymentWizard } from "./DeploymentWizard";
import { DeploymentProgress } from "./DeploymentProgress";
import { useAppStore } from "../../store";
import { parseError } from "../../lib/errorHandler";

type ViewMode = "list" | "editor";
type TabMode = "scripts" | "templates";

/**
 * ScriptManagement - wrapper component that manages navigation between
 * ScriptList, ScriptEditor, and Templates
 */
export function ScriptManagement() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [tabMode, setTabMode] = useState<TabMode>("scripts");
  const [editingScript, setEditingScript] = useState<DeploymentScript | null>(null);
  const [showAIPrompt, setShowAIPrompt] = useState(false);
  const [runningScript, setRunningScript] = useState<DeploymentScript | null>(null);
  const [showDeployWizard, setShowDeployWizard] = useState(false);
  const [activeDeployment, setActiveDeployment] = useState<Deployment | null>(null);
  const [showDeploymentProgress, setShowDeploymentProgress] = useState(false);

  // Get deployments from store to find the active one
  const deployments = useAppStore((state) => state.deployments);

  const handleCreateNew = () => {
    setEditingScript(null);
    setViewMode("editor");
  };

  const handleEditScript = (script: DeploymentScript) => {
    setEditingScript(script);
    setViewMode("editor");
  };

  const handleRunScript = (script: DeploymentScript) => {
    setRunningScript(script);
    setShowDeployWizard(true);
  };

  const handleCloseEditor = () => {
    setEditingScript(null);
    setViewMode("list");
  };

  const handleScriptSaved = () => {
    setEditingScript(null);
    setViewMode("list");
    setTabMode("scripts");
  };

  const handleTemplateSelected = (script: DeploymentScript) => {
    setEditingScript(script);
    setViewMode("editor");
  };

  const handleDeploymentStarted = (_deploymentId: string, deployment: Deployment) => {
    setShowDeployWizard(false);
    setRunningScript(null);
    // Show progress dialog with the deployment object directly
    setActiveDeployment(deployment);
    setShowDeploymentProgress(true);
  };

  // Update active deployment when deployments change (for real-time updates)
  useEffect(() => {
    if (activeDeployment) {
      const updated = deployments.find((d) => d.id === activeDeployment.id);
      if (updated) {
        setActiveDeployment(updated);
      }
    }
  }, [deployments, activeDeployment?.id]);

  if (viewMode === "editor") {
    return (
      <ScriptEditor
        script={editingScript}
        onClose={handleCloseEditor}
        onSaved={handleScriptSaved}
      />
    );
  }

  return (
    <div className="h-full flex flex-col p-6">
      {/* Tabs Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1 p-1 bg-secondary rounded-lg">
          <button
            onClick={() => setTabMode("scripts")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
              tabMode === "scripts"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileCode className="w-4 h-4" />
            Scripts
          </button>
          <button
            onClick={() => setTabMode("templates")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
              tabMode === "templates"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutTemplate className="w-4 h-4" />
            Templates
          </button>
        </div>

        <div className="flex items-center gap-2">
          {tabMode === "scripts" && (
            <>
              <button
                onClick={() => setShowAIPrompt(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-md border border-border hover:bg-accent text-sm"
                title="Generate script with AI"
              >
                <Sparkles className="w-4 h-4 text-purple-500" />
                AI Generate
              </button>
              <button
                onClick={handleCreateNew}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
              >
                <Plus className="w-4 h-4" />
                New Script
              </button>
            </>
          )}
        </div>
      </div>

      {/* AI Prompt Dialog */}
      {showAIPrompt && (
        <AIPromptDialog onClose={() => setShowAIPrompt(false)} />
      )}

      {/* Deployment Wizard */}
      {runningScript && (
        <DeploymentWizard
          script={runningScript}
          open={showDeployWizard}
          onOpenChange={(open) => {
            setShowDeployWizard(open);
            if (!open) setRunningScript(null);
          }}
          onDeploymentStarted={handleDeploymentStarted}
        />
      )}

      {/* Deployment Progress Dialog */}
      <DeploymentProgress
        deployment={activeDeployment}
        open={showDeploymentProgress}
        onOpenChange={(open) => {
          setShowDeploymentProgress(open);
          if (!open) setActiveDeployment(null);
        }}
      />

      {/* Tab Content */}
      {tabMode === "scripts" ? (
        <ScriptListContent
          onCreateNew={handleCreateNew}
          onEditScript={handleEditScript}
          onRunScript={handleRunScript}
        />
      ) : (
        <TemplatesGrid onTemplateSelected={handleTemplateSelected} />
      )}
    </div>
  );
}

// AI Prompt Dialog Component
interface AIPromptDialogProps {
  onClose: () => void;
}

// Script format guide for AI
const SCRIPT_FORMAT_GUIDE = `
## Deployment Script Format Guide

### Script Structure (YAML)
\`\`\`yaml
name: "Script Name"
description: "Description"
variables:
  - name: variable_name
    description: "Variable description"
    default_value: "default"
    required: true/false
    var_type: string/number/boolean/secret
steps:
  - id: step-1
    name: "Step name"
    commands:
      - "command 1"
      - "command 2"
    working_dir: "/path/to/dir"  # optional
    env:                          # optional
      KEY: "value"
    condition: "condition"        # optional
    on_error: abort/continue/rollback
    timeout: 300                  # seconds, optional
rollback_steps:
  - id: rollback-1
    name: "Rollback step"
    commands:
      - "rollback command"
    on_error: abort
tags:
  - tag1
  - tag2
\`\`\`

### Variable Types
- \`string\`: Text string
- \`number\`: Integer or float
- \`boolean\`: true/false
- \`secret\`: Password, API key (hidden in UI)

### On Error Actions
- \`abort\`: Stop script immediately
- \`continue\`: Ignore error, continue next step
- \`rollback\`: Run rollback_steps to restore

### Variable Interpolation
Use \`{{variable_name}}\` in commands, working_dir, env values.

### Best Practices
1. Always include rollback_steps for important deployments
2. Use timeout for long-running commands
3. Set on_error: continue for non-critical steps (cleanup, cache)
4. Use var_type: secret for passwords, API keys
5. Add maintenance mode before deploy

---

## Example Scripts

### Example 1: Node.js Deployment with PM2
\`\`\`yaml
name: "Node.js PM2 Deployment"
description: "Deploy Node.js application with PM2 process manager"
variables:
  - name: app_name
    description: "PM2 application name"
    default_value: "my-app"
    required: true
    var_type: string
  - name: app_dir
    description: "Application directory"
    default_value: "/var/www/app"
    required: true
    var_type: string
  - name: git_branch
    description: "Git branch to deploy"
    default_value: "main"
    required: false
    var_type: string
  - name: node_env
    description: "Node environment"
    default_value: "production"
    required: false
    var_type: string
steps:
  - id: pull-code
    name: "Pull latest code"
    commands:
      - "git fetch origin"
      - "git checkout {{git_branch}}"
      - "git pull origin {{git_branch}}"
    working_dir: "{{app_dir}}"
    on_error: abort
    timeout: 300
  - id: install-deps
    name: "Install dependencies"
    commands:
      - "npm ci --production"
    working_dir: "{{app_dir}}"
    env:
      NODE_ENV: "{{node_env}}"
    on_error: abort
    timeout: 600
  - id: build
    name: "Build application"
    commands:
      - "npm run build"
    working_dir: "{{app_dir}}"
    env:
      NODE_ENV: "{{node_env}}"
    on_error: rollback
    timeout: 600
  - id: restart
    name: "Restart PM2 process"
    commands:
      - "pm2 restart {{app_name}} || pm2 start npm --name {{app_name}} -- start"
      - "pm2 save"
    working_dir: "{{app_dir}}"
    on_error: rollback
    timeout: 120
rollback_steps:
  - id: rollback-1
    name: "Revert to previous commit"
    commands:
      - "git checkout HEAD~1"
      - "npm ci --production"
      - "npm run build"
      - "pm2 restart {{app_name}}"
    working_dir: "{{app_dir}}"
    on_error: abort
    timeout: 600
tags:
  - nodejs
  - pm2
  - deployment
\`\`\`

### Example 2: Docker Compose Deployment
\`\`\`yaml
name: "Docker Compose Deployment"
description: "Deploy application using Docker Compose with zero-downtime"
variables:
  - name: project_dir
    description: "Project directory"
    default_value: "/opt/app"
    required: true
    var_type: string
  - name: compose_file
    description: "Docker Compose file"
    default_value: "docker-compose.yml"
    required: false
    var_type: string
  - name: git_branch
    description: "Git branch"
    default_value: "main"
    required: false
    var_type: string
steps:
  - id: pull-code
    name: "Pull latest code"
    commands:
      - "git fetch origin"
      - "git checkout {{git_branch}}"
      - "git pull origin {{git_branch}}"
    working_dir: "{{project_dir}}"
    on_error: abort
    timeout: 300
  - id: pull-images
    name: "Pull Docker images"
    commands:
      - "docker-compose -f {{compose_file}} pull"
    working_dir: "{{project_dir}}"
    on_error: abort
    timeout: 600
  - id: build-images
    name: "Build Docker images"
    commands:
      - "docker-compose -f {{compose_file}} build --no-cache"
    working_dir: "{{project_dir}}"
    on_error: rollback
    timeout: 1200
  - id: deploy
    name: "Deploy containers"
    commands:
      - "docker-compose -f {{compose_file}} up -d --remove-orphans"
    working_dir: "{{project_dir}}"
    on_error: rollback
    timeout: 300
  - id: cleanup
    name: "Cleanup old images"
    commands:
      - "docker image prune -f"
    on_error: continue
    timeout: 120
rollback_steps:
  - id: rollback-1
    name: "Rollback to previous version"
    commands:
      - "git checkout HEAD~1"
      - "docker-compose -f {{compose_file}} up -d --remove-orphans"
    working_dir: "{{project_dir}}"
    on_error: abort
    timeout: 300
tags:
  - docker
  - compose
  - container
\`\`\`

### Example 3: Laravel/PHP Deployment
\`\`\`yaml
name: "Laravel Deployment"
description: "Deploy Laravel application with Composer and PHP-FPM"
variables:
  - name: app_dir
    description: "Application directory"
    default_value: "/var/www/html"
    required: true
    var_type: string
  - name: git_branch
    description: "Git branch"
    default_value: "main"
    required: false
    var_type: string
  - name: php_fpm_service
    description: "PHP-FPM service name"
    default_value: "php8.2-fpm"
    required: false
    var_type: string
  - name: web_user
    description: "Web server user"
    default_value: "www-data"
    required: false
    var_type: string
steps:
  - id: maintenance-on
    name: "Enable maintenance mode"
    commands:
      - "php artisan down --retry=60"
    working_dir: "{{app_dir}}"
    on_error: continue
    timeout: 30
  - id: pull-code
    name: "Pull latest code"
    commands:
      - "git fetch origin"
      - "git checkout {{git_branch}}"
      - "git pull origin {{git_branch}}"
    working_dir: "{{app_dir}}"
    on_error: abort
    timeout: 300
  - id: composer
    name: "Install Composer dependencies"
    commands:
      - "composer install --no-dev --optimize-autoloader --no-interaction"
    working_dir: "{{app_dir}}"
    on_error: rollback
    timeout: 600
  - id: migrate
    name: "Run database migrations"
    commands:
      - "php artisan migrate --force"
    working_dir: "{{app_dir}}"
    on_error: rollback
    timeout: 300
  - id: cache
    name: "Optimize and cache"
    commands:
      - "php artisan config:cache"
      - "php artisan route:cache"
      - "php artisan view:cache"
      - "php artisan event:cache"
    working_dir: "{{app_dir}}"
    on_error: continue
    timeout: 120
  - id: permissions
    name: "Set permissions"
    commands:
      - "chown -R {{web_user}}:{{web_user}} storage bootstrap/cache"
      - "chmod -R 775 storage bootstrap/cache"
    working_dir: "{{app_dir}}"
    on_error: continue
    timeout: 60
  - id: restart-fpm
    name: "Restart PHP-FPM"
    commands:
      - "systemctl restart {{php_fpm_service}}"
    on_error: rollback
    timeout: 60
  - id: maintenance-off
    name: "Disable maintenance mode"
    commands:
      - "php artisan up"
    working_dir: "{{app_dir}}"
    on_error: continue
    timeout: 30
rollback_steps:
  - id: rollback-1
    name: "Rollback deployment"
    commands:
      - "php artisan down"
      - "git checkout HEAD~1"
      - "composer install --no-dev --optimize-autoloader"
      - "php artisan migrate:rollback --force"
      - "php artisan config:cache"
      - "systemctl restart {{php_fpm_service}}"
      - "php artisan up"
    working_dir: "{{app_dir}}"
    on_error: abort
    timeout: 600
tags:
  - php
  - laravel
  - composer
\`\`\`

### Example 4: Database Backup
\`\`\`yaml
name: "MySQL Database Backup"
description: "Backup MySQL database with compression and retention"
variables:
  - name: db_host
    description: "Database host"
    default_value: "localhost"
    required: true
    var_type: string
  - name: db_name
    description: "Database name"
    required: true
    var_type: string
  - name: db_user
    description: "Database user"
    required: true
    var_type: string
  - name: db_password
    description: "Database password"
    required: true
    var_type: secret
  - name: backup_dir
    description: "Backup directory"
    default_value: "/var/backups/mysql"
    required: false
    var_type: string
  - name: retention_days
    description: "Days to keep backups"
    default_value: "7"
    required: false
    var_type: number
steps:
  - id: create-dir
    name: "Create backup directory"
    commands:
      - "mkdir -p {{backup_dir}}"
    on_error: abort
    timeout: 30
  - id: backup
    name: "Backup database"
    commands:
      - "mysqldump -h {{db_host}} -u {{db_user}} -p{{db_password}} {{db_name}} | gzip > {{backup_dir}}/{{db_name}}_$(date +%Y%m%d_%H%M%S).sql.gz"
    on_error: abort
    timeout: 1800
  - id: cleanup
    name: "Remove old backups"
    commands:
      - "find {{backup_dir}} -name '*.sql.gz' -mtime +{{retention_days}} -delete"
    on_error: continue
    timeout: 60
  - id: verify
    name: "Verify backup"
    commands:
      - "ls -lh {{backup_dir}}/*.sql.gz | tail -1"
    on_error: continue
    timeout: 30
rollback_steps: []
tags:
  - database
  - mysql
  - backup
\`\`\`

### Example 5: SSL Certificate Renewal
\`\`\`yaml
name: "SSL Certificate Renewal"
description: "Renew Let's Encrypt SSL certificates"
variables:
  - name: domain
    description: "Domain name"
    required: true
    var_type: string
  - name: webroot
    description: "Webroot directory"
    default_value: "/var/www/html"
    required: false
    var_type: string
  - name: web_service
    description: "Web server service"
    default_value: "nginx"
    required: false
    var_type: string
  - name: email
    description: "Admin email for notifications"
    required: true
    var_type: string
steps:
  - id: check-cert
    name: "Check certificate expiry"
    commands:
      - "certbot certificates -d {{domain}}"
    on_error: continue
    timeout: 60
  - id: renew
    name: "Renew certificate"
    commands:
      - "certbot renew --webroot -w {{webroot}} -d {{domain}} --non-interactive --agree-tos -m {{email}}"
    on_error: abort
    timeout: 300
  - id: reload-web
    name: "Reload web server"
    commands:
      - "systemctl reload {{web_service}}"
    on_error: abort
    timeout: 60
  - id: verify
    name: "Verify SSL"
    commands:
      - "openssl s_client -connect {{domain}}:443 -servername {{domain}} </dev/null 2>/dev/null | openssl x509 -noout -dates"
    on_error: continue
    timeout: 30
rollback_steps: []
tags:
  - ssl
  - certbot
  - security
\`\`\`
`;

function AIPromptDialog({ onClose }: AIPromptDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [copied, setCopied] = useState(false);

  const examplePrompts = [
    "Tạo script deploy Next.js với PM2, thư mục /var/www/app, branch main",
    "Script backup database MySQL hàng ngày, giữ lại 7 ngày",
    "Deploy Laravel app với composer, migrate, cache clear",
    "Script deploy Docker Compose với zero-downtime",
    "Renew SSL Let's Encrypt cho domain example.com",
    "Deploy Python Django với virtualenv và gunicorn",
  ];

  const handleSelectExample = (text: string) => {
    setPrompt(text);
    setCopied(false);
  };

  const handleCopyPrompt = () => {
    if (prompt) {
      const fullPrompt = `# Yêu cầu tạo Deployment Script

${prompt}

---

${SCRIPT_FORMAT_GUIDE}

---

Hãy tạo script YAML hoàn chỉnh theo format trên với đầy đủ:
- variables (với default_value hợp lý)
- steps (với timeout và on_error phù hợp)
- rollback_steps (để khôi phục khi lỗi)
- tags (để phân loại)

Chỉ trả về code YAML, không cần giải thích thêm.`;

      navigator.clipboard.writeText(fullPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg shadow-lg w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <h3 className="font-semibold">AI Script Generator</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-auto flex-1">
          <div>
            <label className="block text-sm font-medium mb-2">
              Mô tả script bạn muốn tạo:
            </label>
            <textarea
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setCopied(false);
              }}
              placeholder="Ví dụ: Tạo script deploy cho ứng dụng Node.js với PM2, thư mục /var/www/myapp, sử dụng branch production..."
              className="w-full h-28 px-3 py-2 rounded-md border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-2">Chọn ví dụ:</p>
            <div className="grid grid-cols-1 gap-2">
              {examplePrompts.map((example, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectExample(example)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                    prompt === example
                      ? "bg-primary/10 border border-primary/30"
                      : "bg-secondary/50 hover:bg-secondary"
                  )}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-green-500/10 border border-green-500/20 rounded-md p-3">
            <p className="text-sm text-green-600 dark:text-green-400">
              <strong>✓ Prompt đã bao gồm:</strong> Format guide, variable types, on_error actions, 
              best practices. Có thể dùng với bất kỳ AI nào (ChatGPT, Claude, Gemini, Kiro...).
            </p>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-3">
            <p className="text-sm text-blue-600 dark:text-blue-400">
              <strong>Hướng dẫn:</strong> Nhấn "Copy Prompt" → Paste vào AI chat → 
              Copy YAML kết quả → Nhấn "Import" trong tab Scripts.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-border hover:bg-accent text-sm"
          >
            Đóng
          </button>
          <button
            onClick={handleCopyPrompt}
            disabled={!prompt}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors",
              copied
                ? "bg-green-500 text-white"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
              !prompt && "opacity-50 cursor-not-allowed"
            )}
          >
            {copied ? (
              <>
                ✓ Đã copy!
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Copy Prompt
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Script List Content (without header since we have tabs)
interface ScriptListContentProps {
  onCreateNew: () => void;
  onEditScript: (script: DeploymentScript) => void;
  onRunScript: (script: DeploymentScript) => void;
}

function ScriptListContent({ onCreateNew, onEditScript, onRunScript }: ScriptListContentProps) {
  return (
    <ScriptList
      onCreateNew={onCreateNew}
      onEditScript={onEditScript}
      onRunScript={onRunScript}
      hideHeader
    />
  );
}

// Templates Grid Component
interface TemplatesGridProps {
  onTemplateSelected: (script: DeploymentScript) => void;
}

function TemplatesGrid({ onTemplateSelected }: TemplatesGridProps) {
  const templates = useAppStore((state) => state.templates);
  const loadTemplates = useAppStore((state) => state.loadTemplates);
  const createFromTemplate = useAppStore((state) => state.createFromTemplate);
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await loadTemplates();
      setIsLoading(false);
    };
    load();
  }, [loadTemplates]);

  const handleUseTemplate = async (template: TemplateInfo) => {
    setIsCreating(template.name);
    try {
      const script = await createFromTemplate(template.name);
      showSuccess("Script created", `Created from "${template.name}" template`);
      onTemplateSelected(script);
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    } finally {
      setIsCreating(null);
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await loadTemplates();
    setIsLoading(false);
  };

  // Category icons and colors
  const getCategoryStyle = (category: string) => {
    const styles: Record<string, { icon: string; color: string }> = {
      "Application": { icon: "🚀", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
      "Container": { icon: "🐳", color: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20" },
      "Web Server": { icon: "🌐", color: "bg-green-500/10 text-green-500 border-green-500/20" },
      "Database": { icon: "🗄️", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
      "Security": { icon: "🔒", color: "bg-red-500/10 text-red-500 border-red-500/20" },
    };
    return styles[category] || { icon: "📄", color: "bg-secondary text-muted-foreground border-border" };
  };

  // Group templates by category
  const templatesByCategory = templates.reduce((acc, template) => {
    const category = template.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(template);
    return acc;
  }, {} as Record<string, TemplateInfo[]>);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
          <LayoutTemplate className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">No templates available</h3>
        <p className="text-muted-foreground mb-4">
          Templates will appear here when available
        </p>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-4 py-2 rounded-md border border-border hover:bg-accent"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto space-y-6">
      {Object.entries(templatesByCategory).map(([category, categoryTemplates]) => {
        const style = getCategoryStyle(category);
        return (
          <div key={category}>
            {/* Category Header */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">{style.icon}</span>
              <h3 className="font-medium">{category}</h3>
              <span className="text-xs text-muted-foreground">
                ({categoryTemplates.length})
              </span>
            </div>

            {/* Template Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categoryTemplates.map((template) => (
                <TemplateCard
                  key={template.name}
                  template={template}
                  categoryStyle={style}
                  isCreating={isCreating === template.name}
                  onUse={() => handleUseTemplate(template)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Template Card Component
interface TemplateCardProps {
  template: TemplateInfo;
  categoryStyle: { icon: string; color: string };
  isCreating: boolean;
  onUse: () => void;
}

function TemplateCard({ template, categoryStyle, isCreating, onUse }: TemplateCardProps) {
  return (
    <div
      className="relative p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/50 transition-all cursor-pointer group"
      onDoubleClick={onUse}
    >
      {/* Template Info */}
      <div className="flex items-start gap-3 mb-3">
        <div className={cn("p-2 rounded-lg border text-lg", categoryStyle.color)}>
          {categoryStyle.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium truncate">{template.name}</h4>
          <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
            {template.description}
          </p>
        </div>
      </div>

      {/* Variables Count */}
      {template.variables.length > 0 && (
        <div className="text-xs text-muted-foreground mb-3">
          {template.variables.length} variable{template.variables.length !== 1 ? "s" : ""} to configure
        </div>
      )}

      {/* Use Template Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onUse();
        }}
        disabled={isCreating}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
      >
        {isCreating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Creating...
          </>
        ) : (
          "Use Template"
        )}
      </button>
    </div>
  );
}
