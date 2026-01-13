import { useState } from "react";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Variable as VariableIcon,
  Lock,
  Hash,
  ToggleLeft,
  Type,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Variable, VariableType } from "../../lib/tauri";

interface VariableEditorProps {
  variables: Variable[];
  onChange: (variables: Variable[]) => void;
}

const variableTypeIcons: Record<VariableType, React.ReactNode> = {
  string: <Type className="w-4 h-4" />,
  number: <Hash className="w-4 h-4" />,
  boolean: <ToggleLeft className="w-4 h-4" />,
  secret: <Lock className="w-4 h-4" />,
};

const variableTypeLabels: Record<VariableType, string> = {
  string: "String",
  number: "Number",
  boolean: "Boolean",
  secret: "Secret",
};

/**
 * VariableEditor component for defining script variables
 * Form for variable definition with type selector
 * Requirements: 2.4
 */
export function VariableEditor({ variables, onChange }: VariableEditorProps) {
  const [expandedVars, setExpandedVars] = useState<Set<string>>(new Set());

  // Toggle variable expansion
  const toggleExpand = (varName: string) => {
    setExpandedVars((prev) => {
      const next = new Set(prev);
      if (next.has(varName)) {
        next.delete(varName);
      } else {
        next.add(varName);
      }
      return next;
    });
  };

  // Add new variable
  const addVariable = () => {
    const newVar: Variable = {
      name: `variable_${variables.length + 1}`,
      description: "",
      default_value: null,
      required: false,
      var_type: "string",
    };
    onChange([...variables, newVar]);
    setExpandedVars((prev) => new Set(prev).add(newVar.name));
  };

  // Delete variable
  const deleteVariable = (index: number) => {
    const newVars = [...variables];
    newVars.splice(index, 1);
    onChange(newVars);
  };

  // Update variable
  const updateVariable = (index: number, updates: Partial<Variable>) => {
    const newVars = [...variables];
    const oldName = newVars[index].name;
    newVars[index] = { ...newVars[index], ...updates };
    
    // Update expanded set if name changed
    if (updates.name && updates.name !== oldName) {
      setExpandedVars((prev) => {
        const next = new Set(prev);
        if (next.has(oldName)) {
          next.delete(oldName);
          next.add(updates.name!);
        }
        return next;
      });
    }
    
    onChange(newVars);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Script Variables</h3>
          <p className="text-sm text-muted-foreground">
            Define variables that can be used in your script with {"{{variable_name}}"} syntax
          </p>
        </div>
      </div>

      {/* Variables List */}
      {variables.length > 0 ? (
        <div className="space-y-2">
          {variables.map((variable, index) => (
            <VariableItem
              key={`${variable.name}-${index}`}
              variable={variable}
              index={index}
              isExpanded={expandedVars.has(variable.name)}
              onToggleExpand={() => toggleExpand(variable.name)}
              onUpdate={(updates) => updateVariable(index, updates)}
              onDelete={() => deleteVariable(index)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <VariableIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No variables defined</p>
          <p className="text-sm">Add variables to make your script reusable</p>
        </div>
      )}

      {/* Add Variable Button */}
      <button
        onClick={addVariable}
        className="flex items-center gap-2 w-full px-4 py-3 rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
      >
        <Plus className="w-4 h-4" />
        Add Variable
      </button>

      {/* Dynamic Variables Info */}
      <div className="p-4 rounded-lg bg-secondary/50 border border-border">
        <h4 className="font-medium mb-2">Built-in Dynamic Variables</h4>
        <p className="text-sm text-muted-foreground mb-3">
          These variables are automatically available in all scripts:
        </p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2">
            <code className="px-1.5 py-0.5 rounded bg-background font-mono text-xs">
              {"{{date}}"}
            </code>
            <span className="text-muted-foreground">Current date</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="px-1.5 py-0.5 rounded bg-background font-mono text-xs">
              {"{{timestamp}}"}
            </code>
            <span className="text-muted-foreground">Unix timestamp</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="px-1.5 py-0.5 rounded bg-background font-mono text-xs">
              {"{{user}}"}
            </code>
            <span className="text-muted-foreground">Current user</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="px-1.5 py-0.5 rounded bg-background font-mono text-xs">
              {"{{server_name}}"}
            </code>
            <span className="text-muted-foreground">Target server</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface VariableItemProps {
  variable: Variable;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<Variable>) => void;
  onDelete: () => void;
}

function VariableItem({
  variable,
  index,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onDelete,
}: VariableItemProps) {
  return (
    <div className="border border-border rounded-lg">
      {/* Variable Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent/50"
        onClick={onToggleExpand}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}

        <span className="text-xs text-muted-foreground font-mono">
          {index + 1}
        </span>

        <div className={cn(
          "p-1 rounded",
          variable.var_type === "secret" ? "text-yellow-500" : "text-primary"
        )}>
          {variableTypeIcons[variable.var_type]}
        </div>

        <code className="font-mono text-sm flex-1 truncate">
          {"{{"}
          {variable.name}
          {"}}"}
        </code>

        {variable.required && (
          <span className="px-1.5 py-0.5 rounded text-xs bg-destructive/10 text-destructive">
            required
          </span>
        )}

        <span className="text-xs text-muted-foreground">
          {variableTypeLabels[variable.var_type]}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 rounded hover:bg-secondary text-destructive"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Variable Content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 space-y-4 border-t border-border">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1">Variable Name</label>
            <input
              type="text"
              value={variable.name}
              onChange={(e) => onUpdate({ name: e.target.value.replace(/\s+/g, "_") })}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="variable_name"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use in scripts as: <code className="bg-secondary px-1 rounded">{`{{${variable.name}}}`}</code>
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              value={variable.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Describe what this variable is for..."
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(variableTypeLabels) as VariableType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => onUpdate({ var_type: type })}
                  className={cn(
                    "flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors",
                    variable.var_type === type
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent"
                  )}
                >
                  {variableTypeIcons[type]}
                  {variableTypeLabels[type]}
                </button>
              ))}
            </div>
            {variable.var_type === "secret" && (
              <p className="text-xs text-yellow-500 mt-2">
                Secret values are retrieved from secure storage and never logged
              </p>
            )}
          </div>

          {/* Default Value */}
          {variable.var_type !== "secret" && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Default Value
                <span className="text-muted-foreground font-normal ml-1">(optional)</span>
              </label>
              {variable.var_type === "boolean" ? (
                <select
                  value={variable.default_value || ""}
                  onChange={(e) => onUpdate({ default_value: e.target.value || null })}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">No default</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  type={variable.var_type === "number" ? "number" : "text"}
                  value={variable.default_value || ""}
                  onChange={(e) => onUpdate({ default_value: e.target.value || null })}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={variable.var_type === "number" ? "0" : "Default value..."}
                />
              )}
            </div>
          )}

          {/* Required */}
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={variable.required}
                onChange={(e) => onUpdate({ required: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-secondary rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
            </label>
            <span className="text-sm">Required variable</span>
          </div>
          {variable.required && (
            <p className="text-xs text-muted-foreground -mt-2">
              Deployment will fail if this variable is not provided
            </p>
          )}
        </div>
      )}
    </div>
  );
}
