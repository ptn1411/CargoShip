import { useState, useMemo } from "react";
import {
  Play,
  Terminal,
  Variable as VariableIcon,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Folder,
  Clock,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Step, Variable } from "../../lib/tauri";

interface ScriptPreviewProps {
  steps: Step[];
  variables: Variable[];
}

/**
 * ScriptPreview component shows rendered commands with variable interpolation
 * Requirements: 2.6
 */
export function ScriptPreview({ steps, variables }: ScriptPreviewProps) {
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(
    new Set(steps.map((s) => s.id))
  );

  // Initialize variable values with defaults
  useMemo(() => {
    const defaults: Record<string, string> = {};
    for (const v of variables) {
      if (v.default_value !== null) {
        defaults[v.name] = v.default_value;
      }
    }
    // Add dynamic variables
    defaults["date"] = new Date().toISOString().split("T")[0];
    defaults["timestamp"] = Math.floor(Date.now() / 1000).toString();
    defaults["user"] = "current_user";
    defaults["server_name"] = "target_server";
    
    setVariableValues((prev) => ({ ...defaults, ...prev }));
  }, [variables]);

  // Toggle step expansion
  const toggleExpand = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  // Interpolate variables in a string
  const interpolate = (text: string): { result: string; missing: string[] } => {
    const missing: string[] = [];
    const result = text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      if (varName in variableValues && variableValues[varName]) {
        return variableValues[varName];
      }
      missing.push(varName);
      return match;
    });
    return { result, missing };
  };

  // Check if all required variables are provided
  const missingRequired = useMemo(() => {
    return variables
      .filter((v) => v.required && !variableValues[v.name])
      .map((v) => v.name);
  }, [variables, variableValues]);

  return (
    <div className="space-y-6">
      {/* Variable Input Section */}
      <div className="p-4 rounded-lg border border-border bg-secondary/30">
        <div className="flex items-center gap-2 mb-3">
          <VariableIcon className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Variable Values</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Enter values to preview how commands will look when executed
        </p>

        {variables.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {variables.map((v) => (
              <div key={v.name}>
                <label className="block text-sm font-medium mb-1">
                  {v.name}
                  {v.required && (
                    <span className="text-destructive ml-1">*</span>
                  )}
                </label>
                {v.var_type === "secret" ? (
                  <input
                    type="password"
                    value={variableValues[v.name] || ""}
                    onChange={(e) =>
                      setVariableValues((prev) => ({
                        ...prev,
                        [v.name]: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="••••••••"
                  />
                ) : v.var_type === "boolean" ? (
                  <select
                    value={variableValues[v.name] || ""}
                    onChange={(e) =>
                      setVariableValues((prev) => ({
                        ...prev,
                        [v.name]: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select...</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    type={v.var_type === "number" ? "number" : "text"}
                    value={variableValues[v.name] || ""}
                    onChange={(e) =>
                      setVariableValues((prev) => ({
                        ...prev,
                        [v.name]: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={v.default_value || `Enter ${v.name}...`}
                  />
                )}
                {v.description && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {v.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No custom variables defined
          </p>
        )}

        {/* Dynamic Variables */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">Dynamic variables (auto-filled):</p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-1 rounded bg-background">
              date = {variableValues["date"]}
            </span>
            <span className="px-2 py-1 rounded bg-background">
              timestamp = {variableValues["timestamp"]}
            </span>
            <span className="px-2 py-1 rounded bg-background">
              user = {variableValues["user"]}
            </span>
            <span className="px-2 py-1 rounded bg-background">
              server_name = {variableValues["server_name"]}
            </span>
          </div>
        </div>
      </div>

      {/* Missing Required Variables Warning */}
      {missingRequired.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Missing required variables</p>
            <p className="text-sm">
              Please provide values for: {missingRequired.join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Steps Preview */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Play className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Command Preview</h3>
        </div>

        {steps.length > 0 ? (
          <div className="space-y-2">
            {steps.map((step, index) => {
              const isExpanded = expandedSteps.has(step.id);
              
              return (
                <div
                  key={step.id}
                  className="border border-border rounded-lg overflow-hidden"
                >
                  {/* Step Header */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 bg-secondary/30 cursor-pointer hover:bg-secondary/50"
                    onClick={() => toggleExpand(step.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="text-xs font-mono text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="font-medium flex-1">{step.name}</span>
                    {step.condition && (
                      <span className="text-xs text-yellow-500">
                        conditional
                      </span>
                    )}
                    {step.timeout && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {step.timeout}s
                      </span>
                    )}
                  </div>

                  {/* Step Content */}
                  {isExpanded && (
                    <div className="p-3 space-y-3">
                      {/* Working Directory */}
                      {step.working_dir && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Folder className="w-4 h-4" />
                          <span>Working directory:</span>
                          <code className="px-1.5 py-0.5 rounded bg-secondary font-mono text-xs">
                            {interpolate(step.working_dir).result}
                          </code>
                        </div>
                      )}

                      {/* Condition */}
                      {step.condition && (
                        <div className="p-2 rounded bg-yellow-500/10 text-sm">
                          <span className="text-yellow-500 font-medium">
                            Condition:
                          </span>{" "}
                          <code className="font-mono">
                            {interpolate(step.condition).result}
                          </code>
                        </div>
                      )}

                      {/* Commands */}
                      <div className="space-y-1">
                        {step.commands.map((cmd, cmdIndex) => {
                          const { result, missing } = interpolate(cmd);
                          const hasMissing = missing.length > 0;

                          return (
                            <div
                              key={cmdIndex}
                              className={cn(
                                "flex items-start gap-2 p-2 rounded font-mono text-sm",
                                hasMissing
                                  ? "bg-yellow-500/10"
                                  : "bg-zinc-900"
                              )}
                            >
                              <Terminal className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                              <div className="flex-1 break-all">
                                <HighlightedCommand
                                  command={result}
                                  hasMissing={hasMissing}
                                />
                                {hasMissing && (
                                  <p className="text-xs text-yellow-500 mt-1">
                                    Missing: {missing.join(", ")}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Environment Variables */}
                      {Object.keys(step.env).length > 0 && (
                        <div className="pt-2 border-t border-border">
                          <p className="text-xs text-muted-foreground mb-1">
                            Environment:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(step.env).map(([key, value]) => {
                              const { result } = interpolate(value);
                              return (
                                <span
                                  key={key}
                                  className="px-2 py-0.5 rounded bg-secondary text-xs font-mono"
                                >
                                  {key}={result}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* On Error */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border">
                        <span>On error:</span>
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded",
                            step.on_error === "abort" && "bg-destructive/10 text-destructive",
                            step.on_error === "continue" && "bg-yellow-500/10 text-yellow-500",
                            step.on_error === "rollback" && "bg-blue-500/10 text-blue-500"
                          )}
                        >
                          {step.on_error}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Terminal className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No steps defined</p>
            <p className="text-sm">Add steps to see the command preview</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface HighlightedCommandProps {
  command: string;
  hasMissing: boolean;
}

function HighlightedCommand({ command, hasMissing }: HighlightedCommandProps) {
  // Highlight unresolved variables
  const parts = command.split(/(\{\{\w+\}\})/g);

  return (
    <span className={hasMissing ? "text-yellow-200" : "text-green-200"}>
      {parts.map((part, i) => {
        if (part.match(/^\{\{\w+\}\}$/)) {
          return (
            <span key={i} className="text-yellow-400 bg-yellow-500/20 px-0.5 rounded">
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
