import { useEffect, useState } from "react";
import {
  FileCode,
  Server,
  Database,
  Globe,
  Shield,
  Lock,
  Container,
  Code,
  Loader2,
  X,
  ChevronRight,
  Tag,
  Variable,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import { TemplateInfo, Variable as VariableType } from "../../lib/tauri";
import { parseError } from "../../lib/errorHandler";

interface TemplateSelectorProps {
  /** Callback when a template is selected and script created */
  onTemplateSelected: (scriptId: string) => void;
  /** Callback when selector is closed */
  onClose: () => void;
  /** Callback when user wants to create a blank script */
  onCreateBlank?: () => void;
}

// Template category icons mapping
const categoryIcons: Record<string, React.ReactNode> = {
  "Web Application": <Globe className="w-5 h-5" />,
  "Container": <Container className="w-5 h-5" />,
  "Database": <Database className="w-5 h-5" />,
  "Security": <Shield className="w-5 h-5" />,
  "SSL": <Lock className="w-5 h-5" />,
  "Server": <Server className="w-5 h-5" />,
  "Development": <Code className="w-5 h-5" />,
  "default": <FileCode className="w-5 h-5" />,
};

// Template category colors
const categoryColors: Record<string, string> = {
  "Web Application": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  "Container": "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  "Database": "bg-amber-500/10 text-amber-500 border-amber-500/20",
  "Security": "bg-red-500/10 text-red-500 border-red-500/20",
  "SSL": "bg-green-500/10 text-green-500 border-green-500/20",
  "Server": "bg-purple-500/10 text-purple-500 border-purple-500/20",
  "Development": "bg-orange-500/10 text-orange-500 border-orange-500/20",
  "default": "bg-secondary text-muted-foreground border-border",
};

/**
 * TemplateSelector component displays a grid of available templates
 * with details and preview functionality.
 * Requirements: 3.1, 3.2
 */
export function TemplateSelector({ onTemplateSelected, onClose, onCreateBlank }: TemplateSelectorProps) {
  const templates = useAppStore((state) => state.templates);
  const loadTemplates = useAppStore((state) => state.loadTemplates);
  const createFromTemplate = useAppStore((state) => state.createFromTemplate);
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [isLoading, setIsLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateInfo | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Load templates on mount
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await loadTemplates();
      setIsLoading(false);
    };
    load();
  }, [loadTemplates]);

  // Get unique categories
  const categories = Array.from(new Set(templates.map((t) => t.category)));

  // Filter templates
  const filteredTemplates = templates.filter((template) => {
    const matchesSearch =
      searchQuery === "" ||
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === null || template.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Group templates by category
  const templatesByCategory = filteredTemplates.reduce((acc, template) => {
    const category = template.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(template);
    return acc;
  }, {} as Record<string, TemplateInfo[]>);

  // Handle template selection for preview
  const handleSelectTemplate = (template: TemplateInfo) => {
    setSelectedTemplate(template);
  };

  // Handle creating script from template
  const handleCreateFromTemplate = async (template: TemplateInfo) => {
    setIsCreating(true);
    try {
      const script = await createFromTemplate(template.name);
      showSuccess("Script created", `Created from ${template.name} template`);
      onTemplateSelected(script.id);
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    } finally {
      setIsCreating(false);
    }
  };

  // Get icon for category
  const getCategoryIcon = (category: string) => {
    return categoryIcons[category] || categoryIcons["default"];
  };

  // Get color classes for category
  const getCategoryColor = (category: string) => {
    return categoryColors[category] || categoryColors["default"];
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold">Script Templates</h2>
          <p className="text-sm text-muted-foreground">
            Choose a template to get started quickly
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onCreateBlank && (
            <button
              onClick={onCreateBlank}
              className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent"
            >
              Create Blank Script
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-accent"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="px-4 py-3 border-b border-border space-y-3">
        {/* Search Input */}
        <input
          type="text"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />

        {/* Category Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors",
              selectedCategory === null
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:bg-accent"
            )}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                selectedCategory === category
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-accent"
              )}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Template Grid */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <FileCode className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No templates found</p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="mt-2 text-sm text-primary hover:underline"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(templatesByCategory).map(([category, categoryTemplates]) => (
                <div key={category}>
                  {/* Category Header */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className={cn("p-1.5 rounded", getCategoryColor(category))}>
                      {getCategoryIcon(category)}
                    </div>
                    <h3 className="font-medium">{category}</h3>
                    <span className="text-xs text-muted-foreground">
                      ({categoryTemplates.length})
                    </span>
                  </div>

                  {/* Template Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {categoryTemplates.map((template) => (
                      <TemplateCard
                        key={template.name}
                        template={template}
                        isSelected={selectedTemplate?.name === template.name}
                        categoryColor={getCategoryColor(template.category)}
                        categoryIcon={getCategoryIcon(template.category)}
                        onSelect={() => handleSelectTemplate(template)}
                        onCreate={() => handleCreateFromTemplate(template)}
                        isCreating={isCreating && selectedTemplate?.name === template.name}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Template Preview Panel */}
        {selectedTemplate && (
          <TemplatePreviewPanel
            template={selectedTemplate}
            onClose={() => setSelectedTemplate(null)}
            onCreate={() => handleCreateFromTemplate(selectedTemplate)}
            isCreating={isCreating}
          />
        )}
      </div>
    </div>
  );
}


// Template Card Component
interface TemplateCardProps {
  template: TemplateInfo;
  isSelected: boolean;
  categoryColor: string;
  categoryIcon: React.ReactNode;
  onSelect: () => void;
  onCreate: () => void;
  isCreating: boolean;
}

function TemplateCard({
  template,
  isSelected,
  categoryColor,
  categoryIcon,
  onSelect,
  onCreate,
  isCreating,
}: TemplateCardProps) {
  return (
    <div
      className={cn(
        "relative p-4 rounded-lg border transition-all cursor-pointer group",
        isSelected
          ? "border-primary bg-accent"
          : "border-border hover:border-primary/50 hover:bg-accent/50"
      )}
      onClick={onSelect}
    >
      {/* Template Icon and Name */}
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-lg border", categoryColor)}>
          {categoryIcon}
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
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Variable className="w-3.5 h-3.5" />
          {template.variables.length} variable{template.variables.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Use Template Button - appears on hover */}
      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-background/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCreate();
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
            <>
              Use Template
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// Template Preview Panel Component
interface TemplatePreviewPanelProps {
  template: TemplateInfo;
  onClose: () => void;
  onCreate: () => void;
  isCreating: boolean;
}

function TemplatePreviewPanel({
  template,
  onClose,
  onCreate,
  isCreating,
}: TemplatePreviewPanelProps) {
  return (
    <div className="w-80 border-l border-border bg-card flex flex-col">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-medium">Template Details</h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-accent"
          title="Close preview"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Template Name */}
        <div>
          <h4 className="text-lg font-semibold">{template.name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <Tag className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{template.category}</span>
          </div>
        </div>

        {/* Description */}
        <div>
          <h5 className="text-sm font-medium mb-1">Description</h5>
          <p className="text-sm text-muted-foreground">{template.description}</p>
        </div>

        {/* Variables */}
        {template.variables.length > 0 && (
          <div>
            <h5 className="text-sm font-medium mb-2">
              Variables ({template.variables.length})
            </h5>
            <div className="space-y-2">
              {template.variables.map((variable) => (
                <VariablePreview key={variable.name} variable={variable} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Panel Footer */}
      <div className="p-4 border-t border-border">
        <button
          onClick={onCreate}
          disabled={isCreating}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {isCreating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating Script...
            </>
          ) : (
            <>
              <FileCode className="w-4 h-4" />
              Create Script from Template
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// Variable Preview Component
interface VariablePreviewProps {
  variable: VariableType;
}

function VariablePreview({ variable }: VariablePreviewProps) {
  const typeColors: Record<string, string> = {
    string: "bg-blue-500/10 text-blue-500",
    number: "bg-green-500/10 text-green-500",
    boolean: "bg-purple-500/10 text-purple-500",
    secret: "bg-red-500/10 text-red-500",
  };

  return (
    <div className="p-2.5 rounded-md bg-secondary/50 border border-border">
      <div className="flex items-center justify-between gap-2">
        <code className="text-sm font-mono">{`{{${variable.name}}}`}</code>
        <div className="flex items-center gap-1.5">
          {variable.required && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-500">
              Required
            </span>
          )}
          <span
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-medium",
              typeColors[variable.var_type] || typeColors.string
            )}
          >
            {variable.var_type}
          </span>
        </div>
      </div>
      {variable.description && (
        <p className="text-xs text-muted-foreground mt-1">{variable.description}</p>
      )}
      {variable.default_value && (
        <p className="text-xs text-muted-foreground mt-1">
          Default: <code className="font-mono">{variable.default_value}</code>
        </p>
      )}
    </div>
  );
}
