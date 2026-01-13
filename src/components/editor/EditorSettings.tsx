import { useState, useEffect } from "react";
import { X, Settings, Check } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import * as Switch from "@radix-ui/react-switch";
import { cn } from "../../lib/utils";
import { useEditorSettings, useAppStore, EditorSettings as EditorSettingsType } from "../../store";

interface EditorSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Tab size options
const tabSizeOptions = [
  { value: "2", label: "2 spaces" },
  { value: "4", label: "4 spaces" },
  { value: "8", label: "8 spaces" },
];

// Font size options
const fontSizeOptions = [
  { value: "10", label: "10px" },
  { value: "12", label: "12px" },
  { value: "14", label: "14px (default)" },
  { value: "16", label: "16px" },
  { value: "18", label: "18px" },
  { value: "20", label: "20px" },
  { value: "24", label: "24px" },
];

// Font family options
const fontFamilyOptions = [
  { value: "Consolas, Monaco, monospace", label: "Consolas" },
  { value: "Monaco, Consolas, monospace", label: "Monaco" },
  { value: "'Fira Code', Consolas, monospace", label: "Fira Code" },
  { value: "'JetBrains Mono', Consolas, monospace", label: "JetBrains Mono" },
  { value: "'Source Code Pro', Consolas, monospace", label: "Source Code Pro" },
  { value: "monospace", label: "System Monospace" },
];

// Theme options
const themeOptions = [
  { value: "vs", label: "Light" },
  { value: "vs-dark", label: "Dark (default)" },
  { value: "hc-black", label: "High Contrast" },
];

// Auto-save interval options (in seconds)
const autoSaveIntervalOptions = [
  { value: "10", label: "10 seconds" },
  { value: "30", label: "30 seconds (default)" },
  { value: "60", label: "1 minute" },
  { value: "120", label: "2 minutes" },
  { value: "300", label: "5 minutes" },
];

/**
 * Editor Settings Panel Component
 * Allows users to customize editor preferences
 * 
 * Requirements: 7.1-7.6
 * - Tab size selector (7.1)
 * - Font size and family (7.2)
 * - Word wrap toggle (7.3)
 * - Auto-save toggle with interval (7.4)
 * - Theme selector (7.5, 7.6)
 */
export function EditorSettingsPanel({ open, onOpenChange }: EditorSettingsProps) {
  const currentSettings = useEditorSettings();
  const updateEditorSettings = useAppStore((state) => state.updateEditorSettings);
  const showSuccess = useAppStore((state) => state.showSuccess);
  const showError = useAppStore((state) => state.showError);

  // Local state for form
  const [settings, setSettings] = useState<EditorSettingsType>(currentSettings);
  const [isSaving, setIsSaving] = useState(false);

  // Sync local state when dialog opens or settings change externally
  useEffect(() => {
    if (open) {
      setSettings(currentSettings);
    }
  }, [open, currentSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateEditorSettings(settings);
      showSuccess("Settings saved", "Editor settings have been updated");
      onOpenChange(false);
    } catch (error) {
      showError("Failed to save settings", error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSettings({
      tabSize: 4,
      fontSize: 14,
      fontFamily: "Consolas, Monaco, monospace",
      wordWrap: false,
      autoSave: false,
      autoSaveInterval: 30,
      theme: "vs-dark",
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-background border border-border rounded-lg shadow-lg z-50 max-h-[85vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              <Dialog.Title className="text-lg font-semibold">
                Editor Settings
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-secondary">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Tab Size */}
            <SettingRow
              label="Tab Size"
              description="Number of spaces for each tab"
            >
              <SelectField
                value={String(settings.tabSize)}
                options={tabSizeOptions}
                onChange={(value) => setSettings({ ...settings, tabSize: parseInt(value, 10) })}
              />
            </SettingRow>

            {/* Font Size */}
            <SettingRow
              label="Font Size"
              description="Editor font size in pixels"
            >
              <SelectField
                value={String(settings.fontSize)}
                options={fontSizeOptions}
                onChange={(value) => setSettings({ ...settings, fontSize: parseInt(value, 10) })}
              />
            </SettingRow>

            {/* Font Family */}
            <SettingRow
              label="Font Family"
              description="Editor font family"
            >
              <SelectField
                value={settings.fontFamily}
                options={fontFamilyOptions}
                onChange={(value) => setSettings({ ...settings, fontFamily: value })}
                wide
              />
            </SettingRow>

            {/* Theme */}
            <SettingRow
              label="Editor Theme"
              description="Color theme for the editor"
            >
              <SelectField
                value={settings.theme}
                options={themeOptions}
                onChange={(value) => setSettings({ ...settings, theme: value as "vs" | "vs-dark" | "hc-black" })}
              />
            </SettingRow>

            {/* Word Wrap */}
            <SettingRow
              label="Word Wrap"
              description="Wrap long lines to fit the editor width"
            >
              <Switch.Root
                checked={settings.wordWrap}
                onCheckedChange={(checked) => setSettings({ ...settings, wordWrap: checked })}
                className={cn(
                  "w-11 h-6 rounded-full relative transition-colors",
                  settings.wordWrap ? "bg-primary" : "bg-input"
                )}
              >
                <Switch.Thumb
                  className={cn(
                    "block w-5 h-5 bg-white rounded-full shadow transition-transform",
                    settings.wordWrap ? "translate-x-[22px]" : "translate-x-0.5"
                  )}
                />
              </Switch.Root>
            </SettingRow>

            {/* Auto-save */}
            <SettingRow
              label="Auto-save"
              description="Automatically save files after changes"
            >
              <Switch.Root
                checked={settings.autoSave}
                onCheckedChange={(checked) => setSettings({ ...settings, autoSave: checked })}
                className={cn(
                  "w-11 h-6 rounded-full relative transition-colors",
                  settings.autoSave ? "bg-primary" : "bg-input"
                )}
              >
                <Switch.Thumb
                  className={cn(
                    "block w-5 h-5 bg-white rounded-full shadow transition-transform",
                    settings.autoSave ? "translate-x-[22px]" : "translate-x-0.5"
                  )}
                />
              </Switch.Root>
            </SettingRow>

            {/* Auto-save Interval (only shown when auto-save is enabled) */}
            {settings.autoSave && (
              <SettingRow
                label="Auto-save Interval"
                description="Time between automatic saves"
              >
                <SelectField
                  value={String(settings.autoSaveInterval)}
                  options={autoSaveIntervalOptions}
                  onChange={(value) => setSettings({ ...settings, autoSaveInterval: parseInt(value, 10) })}
                />
              </SettingRow>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-border">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Reset to Defaults
            </button>
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 rounded-md border border-input text-sm hover:bg-accent"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Save Settings
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Helper component for setting rows
interface SettingRowProps {
  label: string;
  description: string;
  children: React.ReactNode;
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <label className="text-sm font-medium">{label}</label>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// Helper component for select fields
interface SelectFieldProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  wide?: boolean;
}

function SelectField({ value, options, onChange, wide }: SelectFieldProps) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger
        className={cn(
          "flex items-center justify-between px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring",
          wide ? "w-56" : "w-40"
        )}
      >
        <Select.Value />
        <Select.Icon className="ml-2">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="bg-popover border border-border rounded-md shadow-md z-100 overflow-hidden"
          position="popper"
          sideOffset={4}
        >
          <Select.Viewport className="p-1">
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                className={cn(
                  "flex items-center justify-between px-3 py-2 text-sm rounded cursor-pointer outline-none",
                  "hover:bg-accent focus:bg-accent",
                  value === option.value && "bg-accent"
                )}
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                {value === option.value && (
                  <Select.ItemIndicator>
                    <Check className="w-4 h-4" />
                  </Select.ItemIndicator>
                )}
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export { EditorSettingsPanel as EditorSettings };
