import { useState, useCallback, useEffect, useRef } from "react";
import Editor, { OnMount, OnChange } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import {
  Save,
  X,
  AlertCircle,
  CheckCircle,
  FileCode,
  Settings,
  Eye,
  Loader2,
} from "lucide-react";
import * as Tabs from "@radix-ui/react-tabs";
import { cn } from "../../lib/utils";
import { useAppStore, useEditorSettings } from "../../store";
import {
  DeploymentScript,
  CreateScriptInput,
  UpdateScriptInput,
  ValidationResult,
  Variable,
  Step,
} from "../../lib/tauri";
import { parseError } from "../../lib/errorHandler";
import { LoadingSpinner } from "../ui";
import { StepEditor } from "./StepEditor";
import { VariableEditor } from "./VariableEditor";
import { ScriptPreview } from "./ScriptPreview";

interface ScriptEditorProps {
  /** Script to edit (null for new script) */
  script: DeploymentScript | null;
  /** Callback when editor is closed */
  onClose: () => void;
  /** Callback when script is saved */
  onSaved?: (script: DeploymentScript) => void;
}

type EditorTab = "yaml" | "steps" | "variables" | "preview";

/**
 * ScriptEditor component with YAML editor using Monaco
 * Syntax highlighting and validation
 * Requirements: 2.1, 2.5
 */
export function ScriptEditor({ script, onClose, onSaved }: ScriptEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const settings = useEditorSettings();
  const appTheme = useAppStore((state) => state.theme);

  const createScript = useAppStore((state) => state.createScript);
  const updateScript = useAppStore((state) => state.updateScript);
  const validateScript = useAppStore((state) => state.validateScript);
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [activeTab, setActiveTab] = useState<EditorTab>("yaml");
  const [yamlContent, setYamlContent] = useState("");
  const [scriptName, setScriptName] = useState("");
  const [scriptDescription, setScriptDescription] = useState("");
  const [variables, setVariables] = useState<Variable[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [rollbackSteps, setRollbackSteps] = useState<Step[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize from script
  useEffect(() => {
    if (script) {
      setScriptName(script.name);
      setScriptDescription(script.description);
      setVariables(script.variables);
      setSteps(script.steps);
      setRollbackSteps(script.rollback_steps);
      setTags(script.tags);
      // Generate YAML from script
      setYamlContent(generateYaml(script));
    } else {
      // New script defaults
      setScriptName("New Script");
      setScriptDescription("");
      setVariables([]);
      setSteps([]);
      setRollbackSteps([]);
      setTags([]);
      setYamlContent(getDefaultYaml());
    }
    setHasChanges(false);
  }, [script]);

  // Determine Monaco theme
  const getMonacoTheme = useCallback(() => {
    if (settings.theme === "vs" || settings.theme === "vs-dark" || settings.theme === "hc-black") {
      return settings.theme;
    }
    const isDark = appTheme === "dark" ||
      (appTheme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    return isDark ? "vs-dark" : "vs";
  }, [settings.theme, appTheme]);

  // Handle editor mount
  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
    editor.focus();
  }, []);

  // Handle YAML content change
  const handleYamlChange: OnChange = useCallback((value) => {
    if (value !== undefined) {
      setYamlContent(value);
      setHasChanges(true);
      // Clear validation on change
      setValidation(null);
    }
  }, []);

  // Parse YAML and update state
  const parseYamlToScript = useCallback((): Partial<DeploymentScript> | null => {
    try {
      // Simple YAML parsing for script structure
      const parsed = parseSimpleYaml(yamlContent);
      return parsed;
    } catch {
      return null;
    }
  }, [yamlContent]);

  // Validate script
  const handleValidate = async () => {
    setIsValidating(true);
    try {
      const parsed = parseYamlToScript();
      if (!parsed) {
        setValidation({
          valid: false,
          errors: [{ field: "yaml", message: "Invalid YAML syntax" }],
          warnings: [],
        });
        return;
      }

      const scriptToValidate: DeploymentScript = {
        id: script?.id || "temp",
        name: parsed.name || scriptName,
        description: parsed.description || scriptDescription,
        variables: parsed.variables || variables,
        steps: parsed.steps || steps,
        rollback_steps: parsed.rollback_steps || rollbackSteps,
        tags: parsed.tags || tags,
        is_template: false,
        created_at: script?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await validateScript(scriptToValidate);
      setValidation(result);
    } catch (error) {
      const parsed = parseError(error);
      setValidation({
        valid: false,
        errors: [{ field: "validation", message: parsed.message }],
        warnings: [],
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Save script
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const parsed = parseYamlToScript();
      if (!parsed) {
        showError("Invalid YAML", "Please fix YAML syntax errors before saving");
        return;
      }

      if (script) {
        // Update existing script
        const input: UpdateScriptInput = {
          name: parsed.name || scriptName,
          description: parsed.description || scriptDescription,
          variables: parsed.variables || variables,
          steps: parsed.steps || steps,
          rollback_steps: parsed.rollback_steps || rollbackSteps,
          tags: parsed.tags || tags,
        };
        const updated = await updateScript(script.id, input);
        showSuccess("Script saved", updated.name);
        setHasChanges(false);
        onSaved?.(updated);
      } else {
        // Create new script
        const input: CreateScriptInput = {
          name: parsed.name || scriptName,
          description: parsed.description || scriptDescription,
          variables: parsed.variables || variables,
          steps: parsed.steps || steps,
          rollback_steps: parsed.rollback_steps || rollbackSteps,
          tags: parsed.tags || tags,
        };
        const created = await createScript(input);
        showSuccess("Script created", created.name);
        setHasChanges(false);
        onSaved?.(created);
      }
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle close with unsaved changes
  const handleClose = () => {
    if (hasChanges) {
      if (window.confirm("You have unsaved changes. Are you sure you want to close?")) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  // Update from visual editors
  const handleStepsChange = (newSteps: Step[]) => {
    setSteps(newSteps);
    setHasChanges(true);
    // Update YAML
    const currentScript = parseYamlToScript() || {};
    setYamlContent(generateYaml({
      ...currentScript,
      steps: newSteps,
    } as DeploymentScript));
  };

  const handleVariablesChange = (newVariables: Variable[]) => {
    setVariables(newVariables);
    setHasChanges(true);
    // Update YAML
    const currentScript = parseYamlToScript() || {};
    setYamlContent(generateYaml({
      ...currentScript,
      variables: newVariables,
    } as DeploymentScript));
  };

  // Editor options
  const editorOptions: editor.IStandaloneEditorConstructionOptions = {
    tabSize: 2,
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily,
    wordWrap: "on",
    minimap: { enabled: false },
    lineNumbers: "on",
    scrollBeyondLastLine: false,
    automaticLayout: true,
    renderWhitespace: "selection",
    bracketPairColorization: { enabled: true },
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <FileCode className="w-5 h-5 text-primary" />
          <div>
            <h2 className="font-semibold">
              {script ? "Edit Script" : "New Script"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {scriptName || "Untitled"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Validation Status */}
          {validation && (
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
              validation.valid
                ? "bg-green-500/10 text-green-500"
                : "bg-destructive/10 text-destructive"
            )}>
              {validation.valid ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  Valid
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validation.errors.length} error{validation.errors.length !== 1 ? "s" : ""}
                </>
              )}
            </div>
          )}

          {/* Validate Button */}
          <button
            onClick={handleValidate}
            disabled={isValidating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent disabled:opacity-50"
          >
            {isValidating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Settings className="w-4 h-4" />
            )}
            Validate
          </button>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </button>

          {/* Close Button */}
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md hover:bg-accent"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs.Root
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as EditorTab)}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <Tabs.List className="flex border-b border-border px-4">
          <Tabs.Trigger
            value="yaml"
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === "yaml"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            YAML Editor
          </Tabs.Trigger>
          <Tabs.Trigger
            value="steps"
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === "steps"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Steps
          </Tabs.Trigger>
          <Tabs.Trigger
            value="variables"
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === "variables"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Variables
          </Tabs.Trigger>
          <Tabs.Trigger
            value="preview"
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === "preview"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Eye className="w-4 h-4" />
            Preview
          </Tabs.Trigger>
        </Tabs.List>

        {/* Tab Content */}
        <Tabs.Content value="yaml" className="flex-1 overflow-hidden">
          <div className="h-full flex flex-col">
            {/* Validation Errors */}
            {validation && !validation.valid && (
              <div className="p-3 bg-destructive/10 border-b border-destructive/20">
                <div className="text-sm font-medium text-destructive mb-1">
                  Validation Errors:
                </div>
                <ul className="text-sm text-destructive space-y-0.5">
                  {validation.errors.map((err, i) => (
                    <li key={i}>
                      {err.field}: {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Monaco Editor */}
            <div className="flex-1">
              <Editor
                height="100%"
                language="yaml"
                value={yamlContent}
                theme={getMonacoTheme()}
                options={editorOptions}
                onMount={handleEditorMount}
                onChange={handleYamlChange}
                loading={
                  <div className="flex items-center justify-center h-full bg-zinc-900">
                    <LoadingSpinner size="lg" />
                  </div>
                }
              />
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="steps" className="flex-1 overflow-auto p-4">
          <StepEditor
            steps={steps}
            onChange={handleStepsChange}
            rollbackSteps={rollbackSteps}
            onRollbackChange={setRollbackSteps}
          />
        </Tabs.Content>

        <Tabs.Content value="variables" className="flex-1 overflow-auto p-4">
          <VariableEditor
            variables={variables}
            onChange={handleVariablesChange}
          />
        </Tabs.Content>

        <Tabs.Content value="preview" className="flex-1 overflow-auto p-4">
          <ScriptPreview
            steps={steps}
            variables={variables}
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}


// Helper functions for YAML generation and parsing

function getDefaultYaml(): string {
  return `name: New Script
description: ""
variables: []
steps:
  - id: step-1
    name: Step 1
    commands:
      - echo "Hello World"
    on_error: abort
rollback_steps: []
tags: []
`;
}

function generateYaml(script: Partial<DeploymentScript>): string {
  const lines: string[] = [];
  
  lines.push(`name: ${script.name || "Untitled"}`);
  lines.push(`description: "${script.description || ""}"`);
  
  // Variables
  if (script.variables && script.variables.length > 0) {
    lines.push("variables:");
    for (const v of script.variables) {
      lines.push(`  - name: ${v.name}`);
      lines.push(`    description: "${v.description || ""}"`);
      if (v.default_value !== null) {
        lines.push(`    default_value: "${v.default_value}"`);
      }
      lines.push(`    required: ${v.required}`);
      lines.push(`    var_type: ${v.var_type}`);
    }
  } else {
    lines.push("variables: []");
  }
  
  // Steps
  if (script.steps && script.steps.length > 0) {
    lines.push("steps:");
    for (const step of script.steps) {
      lines.push(`  - id: ${step.id}`);
      lines.push(`    name: ${step.name}`);
      lines.push("    commands:");
      for (const cmd of step.commands) {
        lines.push(`      - ${cmd}`);
      }
      if (step.working_dir) {
        lines.push(`    working_dir: ${step.working_dir}`);
      }
      if (Object.keys(step.env).length > 0) {
        lines.push("    env:");
        for (const [key, value] of Object.entries(step.env)) {
          lines.push(`      ${key}: "${value}"`);
        }
      }
      if (step.condition) {
        lines.push(`    condition: "${step.condition}"`);
      }
      lines.push(`    on_error: ${step.on_error}`);
      if (step.timeout) {
        lines.push(`    timeout: ${step.timeout}`);
      }
    }
  } else {
    lines.push("steps: []");
  }
  
  // Rollback steps
  if (script.rollback_steps && script.rollback_steps.length > 0) {
    lines.push("rollback_steps:");
    for (const step of script.rollback_steps) {
      lines.push(`  - id: ${step.id}`);
      lines.push(`    name: ${step.name}`);
      lines.push("    commands:");
      for (const cmd of step.commands) {
        lines.push(`      - ${cmd}`);
      }
      if (step.working_dir) {
        lines.push(`    working_dir: ${step.working_dir}`);
      }
      lines.push(`    on_error: ${step.on_error}`);
    }
  } else {
    lines.push("rollback_steps: []");
  }
  
  // Tags
  if (script.tags && script.tags.length > 0) {
    lines.push("tags:");
    for (const tag of script.tags) {
      lines.push(`  - ${tag}`);
    }
  } else {
    lines.push("tags: []");
  }
  
  return lines.join("\n");
}

function parseSimpleYaml(yaml: string): Partial<DeploymentScript> | null {
  try {
    const result: Partial<DeploymentScript> = {
      variables: [],
      steps: [],
      rollback_steps: [],
      tags: [],
    };
    
    const lines = yaml.split("\n");
    let currentSection = "";
    let currentItem: Record<string, unknown> | null = null;
    let currentList: unknown[] = [];
    let indentLevel = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      
      // Calculate indent
      const indent = line.search(/\S/);
      
      // Top-level keys
      if (indent === 0 && trimmed.includes(":")) {
        const [key, ...valueParts] = trimmed.split(":");
        const value = valueParts.join(":").trim();
        
        if (key === "name") {
          result.name = value.replace(/^["']|["']$/g, "");
        } else if (key === "description") {
          result.description = value.replace(/^["']|["']$/g, "");
        } else if (key === "variables") {
          currentSection = "variables";
          currentList = [];
          result.variables = currentList as Variable[];
        } else if (key === "steps") {
          currentSection = "steps";
          currentList = [];
          result.steps = currentList as Step[];
        } else if (key === "rollback_steps") {
          currentSection = "rollback_steps";
          currentList = [];
          result.rollback_steps = currentList as Step[];
        } else if (key === "tags") {
          currentSection = "tags";
          currentList = [];
          result.tags = currentList as string[];
        }
        indentLevel = 0;
        currentItem = null;
      }
      // List items
      else if (trimmed.startsWith("- ")) {
        const content = trimmed.substring(2).trim();
        
        if (currentSection === "tags") {
          currentList.push(content);
        } else if (currentSection === "variables" || currentSection === "steps" || currentSection === "rollback_steps") {
          // New item in list
          if (content.includes(":")) {
            const [key, ...valueParts] = content.split(":");
            const value = valueParts.join(":").trim().replace(/^["']|["']$/g, "");
            
            if (currentSection === "variables") {
              currentItem = {
                name: "",
                description: "",
                default_value: null,
                required: false,
                var_type: "string",
              };
              if (key === "name") currentItem.name = value;
            } else {
              currentItem = {
                id: "",
                name: "",
                commands: [],
                working_dir: null,
                env: {},
                condition: null,
                on_error: "abort",
                timeout: null,
              };
              if (key === "id") currentItem.id = value;
            }
            currentList.push(currentItem);
          } else if (indent > 4 && currentItem) {
            // Command in commands list
            if (Array.isArray(currentItem.commands)) {
              (currentItem.commands as string[]).push(content);
            }
          }
        }
        indentLevel = indent;
      }
      // Properties of current item
      else if (indent > 0 && currentItem && trimmed.includes(":")) {
        const [key, ...valueParts] = trimmed.split(":");
        let value = valueParts.join(":").trim().replace(/^["']|["']$/g, "");
        
        if (key === "commands") {
          // Commands is a list, handled by list items
        } else if (key === "env") {
          // Env is an object, handled separately
        } else if (key === "required") {
          currentItem.required = value === "true";
        } else if (key === "timeout") {
          currentItem.timeout = parseInt(value) || null;
        } else if (key === "default_value") {
          currentItem.default_value = value || null;
        } else {
          currentItem[key] = value;
        }
      }
    }
    
    return result;
  } catch {
    return null;
  }
}
