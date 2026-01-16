import { useState } from "react";
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Play,
  RotateCcw,
  Copy,
  Terminal,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Step, OnError } from "../../lib/tauri";
import { SnippetPicker } from "../snippets";

interface StepEditorProps {
  steps: Step[];
  onChange: (steps: Step[]) => void;
  rollbackSteps?: Step[];
  onRollbackChange?: (steps: Step[]) => void;
}

/**
 * StepEditor component for editing deployment steps
 * Form for step properties with drag-and-drop reordering
 * Requirements: 2.2, 2.3
 */
export function StepEditor({
  steps,
  onChange,
  rollbackSteps = [],
  onRollbackChange,
}: StepEditorProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [activeSection, setActiveSection] = useState<"steps" | "rollback">("steps");

  const currentSteps = activeSection === "steps" ? steps : rollbackSteps;
  const setCurrentSteps = activeSection === "steps" ? onChange : onRollbackChange;

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

  // Add new step
  const addStep = () => {
    const newStep: Step = {
      id: `step-${Date.now()}`,
      name: `Step ${currentSteps.length + 1}`,
      commands: [""],
      working_dir: null,
      env: {},
      condition: null,
      on_error: "abort",
      timeout: null,
    };
    setCurrentSteps?.([...currentSteps, newStep]);
    setExpandedSteps((prev) => new Set(prev).add(newStep.id));
  };

  // Delete step
  const deleteStep = (index: number) => {
    const newSteps = [...currentSteps];
    newSteps.splice(index, 1);
    setCurrentSteps?.(newSteps);
  };

  // Duplicate step
  const duplicateStep = (index: number) => {
    const step = currentSteps[index];
    const newStep: Step = {
      ...step,
      id: `step-${Date.now()}`,
      name: `${step.name} (copy)`,
    };
    const newSteps = [...currentSteps];
    newSteps.splice(index + 1, 0, newStep);
    setCurrentSteps?.(newSteps);
    setExpandedSteps((prev) => new Set(prev).add(newStep.id));
  };

  // Update step
  const updateStep = (index: number, updates: Partial<Step>) => {
    const newSteps = [...currentSteps];
    newSteps[index] = { ...newSteps[index], ...updates };
    setCurrentSteps?.(newSteps);
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newSteps = [...currentSteps];
    const [draggedStep] = newSteps.splice(draggedIndex, 1);
    newSteps.splice(index, 0, draggedStep);
    setCurrentSteps?.(newSteps);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <div className="space-y-4">
      {/* Section Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <button
          onClick={() => setActiveSection("steps")}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            activeSection === "steps"
              ? "bg-primary text-primary-foreground"
              : "hover:bg-accent"
          )}
        >
          <Play className="w-4 h-4" />
          Deployment Steps ({steps.length})
        </button>
        {onRollbackChange && (
          <button
            onClick={() => setActiveSection("rollback")}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              activeSection === "rollback"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent"
            )}
          >
            <RotateCcw className="w-4 h-4" />
            Rollback Steps ({rollbackSteps.length})
          </button>
        )}
      </div>

      {/* Steps List */}
      <div className="space-y-2">
        {currentSteps.map((step, index) => (
          <StepItem
            key={step.id}
            step={step}
            index={index}
            isExpanded={expandedSteps.has(step.id)}
            isDragging={draggedIndex === index}
            onToggleExpand={() => toggleExpand(step.id)}
            onUpdate={(updates) => updateStep(index, updates)}
            onDelete={() => deleteStep(index)}
            onDuplicate={() => duplicateStep(index)}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>

      {/* Add Step Button */}
      <button
        onClick={addStep}
        className="flex items-center gap-2 w-full px-4 py-3 rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
      >
        <Plus className="w-4 h-4" />
        Add {activeSection === "rollback" ? "Rollback " : ""}Step
      </button>
    </div>
  );
}

interface StepItemProps {
  step: Step;
  index: number;
  isExpanded: boolean;
  isDragging: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<Step>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function StepItem({
  step,
  index,
  isExpanded,
  isDragging,
  onToggleExpand,
  onUpdate,
  onDelete,
  onDuplicate,
  onDragStart,
  onDragOver,
  onDragEnd,
}: StepItemProps) {
  const [isSnippetPickerOpen, setIsSnippetPickerOpen] = useState(false);

  // Add command
  const addCommand = () => {
    onUpdate({ commands: [...step.commands, ""] });
  };

  // Add command from snippet
  const addCommandFromSnippet = (command: string) => {
    onUpdate({ commands: [...step.commands, command] });
  };

  // Update command
  const updateCommand = (cmdIndex: number, value: string) => {
    const newCommands = [...step.commands];
    newCommands[cmdIndex] = value;
    onUpdate({ commands: newCommands });
  };

  // Delete command
  const deleteCommand = (cmdIndex: number) => {
    const newCommands = step.commands.filter((_, i) => i !== cmdIndex);
    onUpdate({ commands: newCommands.length > 0 ? newCommands : [""] });
  };

  // Add env variable
  const addEnvVar = () => {
    const key = `VAR_${Object.keys(step.env).length + 1}`;
    onUpdate({ env: { ...step.env, [key]: "" } });
  };

  // Update env variable
  const updateEnvVar = (oldKey: string, newKey: string, value: string) => {
    const newEnv = { ...step.env };
    if (oldKey !== newKey) {
      delete newEnv[oldKey];
    }
    newEnv[newKey] = value;
    onUpdate({ env: newEnv });
  };

  // Delete env variable
  const deleteEnvVar = (key: string) => {
    const newEnv = { ...step.env };
    delete newEnv[key];
    onUpdate({ env: newEnv });
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={cn(
        "border border-border rounded-lg transition-all",
        isDragging && "opacity-50 border-primary"
      )}
    >
      {/* Step Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent/50"
        onClick={onToggleExpand}
      >
        <div
          className="cursor-grab hover:text-primary"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        
        <span className="text-xs text-muted-foreground font-mono">
          {index + 1}
        </span>
        
        <span className="font-medium flex-1 truncate">{step.name}</span>
        
        <span className="text-xs text-muted-foreground">
          {step.commands.length} cmd{step.commands.length !== 1 ? "s" : ""}
        </span>
        
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onDuplicate}
            className="p-1 rounded hover:bg-secondary"
            title="Duplicate"
          >
            <Copy className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-secondary text-destructive"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Step Content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 space-y-4 border-t border-border">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={step.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Step name"
            />
          </div>

          {/* Commands */}
          <div>
            <label className="block text-sm font-medium mb-1">Commands</label>
            <div className="space-y-2">
              {step.commands.map((cmd, cmdIndex) => (
                <div key={cmdIndex} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={cmd}
                    onChange={(e) => updateCommand(cmdIndex, e.target.value)}
                    className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter command..."
                  />
                  <button
                    onClick={() => deleteCommand(cmdIndex)}
                    className="p-2 rounded hover:bg-secondary text-muted-foreground hover:text-destructive"
                    title="Remove command"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={addCommand}
                className="text-sm text-primary hover:underline"
              >
                + Add command
              </button>
              <button
                onClick={() => setIsSnippetPickerOpen(true)}
                className="text-sm text-primary hover:underline ml-4 flex items-center gap-1"
              >
                <Terminal className="w-3 h-3" />
                Insert snippet
              </button>
            </div>
          </div>

          {/* Working Directory */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Working Directory
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </label>
            <input
              type="text"
              value={step.working_dir || ""}
              onChange={(e) => onUpdate({ working_dir: e.target.value || null })}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="/path/to/directory"
            />
          </div>

          {/* Environment Variables */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Environment Variables
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </label>
            <div className="space-y-2">
              {Object.entries(step.env).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={key}
                    onChange={(e) => updateEnvVar(key, e.target.value, value)}
                    className="w-1/3 px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="KEY"
                  />
                  <span className="text-muted-foreground">=</span>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => updateEnvVar(key, key, e.target.value)}
                    className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="value"
                  />
                  <button
                    onClick={() => deleteEnvVar(key)}
                    className="p-2 rounded hover:bg-secondary text-muted-foreground hover:text-destructive"
                    title="Remove variable"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={addEnvVar}
                className="text-sm text-primary hover:underline"
              >
                + Add environment variable
              </button>
            </div>
          </div>

          {/* Condition */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Condition
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </label>
            <input
              type="text"
              value={step.condition || ""}
              onChange={(e) => onUpdate({ condition: e.target.value || null })}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., {{env}} == 'production'"
            />
          </div>

          {/* On Error */}
          <div>
            <label className="block text-sm font-medium mb-1">On Error</label>
            <select
              value={step.on_error}
              onChange={(e) => onUpdate({ on_error: e.target.value as OnError })}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="abort">Abort - Stop execution immediately</option>
              <option value="continue">Continue - Proceed to next step</option>
              <option value="rollback">Rollback - Execute rollback steps</option>
            </select>
          </div>

          {/* Timeout */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Timeout (seconds)
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </label>
            <input
              type="number"
              value={step.timeout || ""}
              onChange={(e) => onUpdate({ timeout: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="No timeout"
              min={0}
            />
          </div>
        </div>
      )}

      {/* Snippet Picker Dialog */}
      <SnippetPicker
        open={isSnippetPickerOpen}
        onOpenChange={setIsSnippetPickerOpen}
        onSelect={addCommandFromSnippet}
        title="Insert Snippet as Command"
      />
    </div>
  );
}
