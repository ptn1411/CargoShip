import { useState, useEffect } from "react";
import { Settings, Monitor, Type, Palette, RotateCcw } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import * as Slider from "@radix-ui/react-slider";
import { cn } from "../../lib/utils";

export interface TerminalSettingsData {
  theme: TerminalTheme;
  fontSize: number;
  fontFamily: string;
  cursorStyle: "block" | "underline" | "bar";
  cursorBlink: boolean;
}

export type TerminalTheme = "dark" | "light" | "monokai" | "dracula" | "solarized-dark" | "solarized-light";

interface TerminalSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: TerminalSettingsData;
  onSettingsChange: (settings: TerminalSettingsData) => void;
}

const DEFAULT_SETTINGS: TerminalSettingsData = {
  theme: "dark",
  fontSize: 14,
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  cursorStyle: "block",
  cursorBlink: true,
};

const FONT_FAMILIES = [
  { value: 'Menlo, Monaco, "Courier New", monospace', label: "Menlo / Monaco" },
  { value: '"Fira Code", monospace', label: "Fira Code" },
  { value: '"JetBrains Mono", monospace', label: "JetBrains Mono" },
  { value: '"Source Code Pro", monospace', label: "Source Code Pro" },
  { value: '"Cascadia Code", monospace', label: "Cascadia Code" },
  { value: '"Consolas", monospace', label: "Consolas" },
  { value: '"Ubuntu Mono", monospace', label: "Ubuntu Mono" },
];

const THEMES: { value: TerminalTheme; label: string; preview: { bg: string; fg: string } }[] = [
  { value: "dark", label: "Dark", preview: { bg: "#0a0a0f", fg: "#e4e4e7" } },
  { value: "light", label: "Light", preview: { bg: "#ffffff", fg: "#18181b" } },
  { value: "monokai", label: "Monokai", preview: { bg: "#272822", fg: "#f8f8f2" } },
  { value: "dracula", label: "Dracula", preview: { bg: "#282a36", fg: "#f8f8f2" } },
  { value: "solarized-dark", label: "Solarized Dark", preview: { bg: "#002b36", fg: "#839496" } },
  { value: "solarized-light", label: "Solarized Light", preview: { bg: "#fdf6e3", fg: "#657b83" } },
];

const CURSOR_STYLES: { value: "block" | "underline" | "bar"; label: string }[] = [
  { value: "block", label: "Block" },
  { value: "underline", label: "Underline" },
  { value: "bar", label: "Bar" },
];

export function TerminalSettings({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
}: TerminalSettingsProps) {
  const [localSettings, setLocalSettings] = useState<TerminalSettingsData>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChange = <K extends keyof TerminalSettingsData>(
    key: K,
    value: TerminalSettingsData[K]
  ) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const handleReset = () => {
    setLocalSettings(DEFAULT_SETTINGS);
    onSettingsChange(DEFAULT_SETTINGS);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-background border border-border rounded-lg shadow-lg z-50 p-6">
          <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Terminal Settings
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            Customize the appearance of your terminal
          </Dialog.Description>

          <div className="mt-6 space-y-6">
            {/* Theme Selection */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Palette className="w-4 h-4" />
                Theme
              </label>
              <div className="grid grid-cols-3 gap-2">
                {THEMES.map((theme) => (
                  <button
                    key={theme.value}
                    onClick={() => handleChange("theme", theme.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 p-2 rounded-md border transition-colors",
                      localSettings.theme === theme.value
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <div
                      className="w-full h-8 rounded flex items-center justify-center text-xs"
                      style={{
                        backgroundColor: theme.preview.bg,
                        color: theme.preview.fg,
                      }}
                    >
                      Aa
                    </div>
                    <span className="text-xs">{theme.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div className="space-y-2">
              <label className="flex items-center justify-between text-sm font-medium">
                <span className="flex items-center gap-2">
                  <Type className="w-4 h-4" />
                  Font Size
                </span>
                <span className="text-muted-foreground">{localSettings.fontSize}px</span>
              </label>
              <Slider.Root
                className="relative flex items-center select-none touch-none w-full h-5"
                value={[localSettings.fontSize]}
                onValueChange={([value]) => handleChange("fontSize", value)}
                min={10}
                max={24}
                step={1}
              >
                <Slider.Track className="bg-secondary relative grow rounded-full h-1">
                  <Slider.Range className="absolute bg-primary rounded-full h-full" />
                </Slider.Track>
                <Slider.Thumb className="block w-4 h-4 bg-primary rounded-full hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </Slider.Root>
            </div>

            {/* Font Family */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Type className="w-4 h-4" />
                Font Family
              </label>
              <Select.Root
                value={localSettings.fontFamily}
                onValueChange={(value) => handleChange("fontFamily", value)}
              >
                <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 text-sm border border-border rounded-md bg-background hover:bg-accent">
                  <Select.Value />
                  <Select.Icon />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="bg-popover border border-border rounded-md shadow-lg z-50">
                    <Select.Viewport className="p-1">
                      {FONT_FAMILIES.map((font) => (
                        <Select.Item
                          key={font.value}
                          value={font.value}
                          className="px-3 py-2 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                          style={{ fontFamily: font.value }}
                        >
                          <Select.ItemText>{font.label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>

            {/* Cursor Style */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Monitor className="w-4 h-4" />
                Cursor Style
              </label>
              <div className="flex gap-2">
                {CURSOR_STYLES.map((style) => (
                  <button
                    key={style.value}
                    onClick={() => handleChange("cursorStyle", style.value)}
                    className={cn(
                      "flex-1 px-3 py-2 text-sm rounded-md border transition-colors",
                      localSettings.cursorStyle === style.value
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cursor Blink */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Cursor Blink</label>
              <button
                onClick={() => handleChange("cursorBlink", !localSettings.cursorBlink)}
                className={cn(
                  "w-10 h-6 rounded-full transition-colors relative",
                  localSettings.cursorBlink ? "bg-primary" : "bg-secondary"
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                    localSettings.cursorBlink ? "translate-x-5" : "translate-x-1"
                  )}
                />
              </button>
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Preview</label>
              <div
                className="p-3 rounded-md border border-border"
                style={{
                  backgroundColor: THEMES.find((t) => t.value === localSettings.theme)?.preview.bg,
                  color: THEMES.find((t) => t.value === localSettings.theme)?.preview.fg,
                  fontFamily: localSettings.fontFamily,
                  fontSize: `${localSettings.fontSize}px`,
                }}
              >
                <div>$ echo "Hello, World!"</div>
                <div>Hello, World!</div>
                <div>$ _</div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex justify-between">
            <button
              onClick={handleReset}
              className="flex items-center gap-1 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Default
            </button>
            <Dialog.Close asChild>
              <button className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                Done
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Theme color definitions for xterm
export function getTerminalThemeColors(theme: TerminalTheme) {
  switch (theme) {
    case "light":
      return {
        background: "#ffffff",
        foreground: "#18181b",
        cursor: "#18181b",
        cursorAccent: "#ffffff",
        selectionBackground: "#d4d4d8",
        black: "#fafafa",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#18181b",
        brightBlack: "#a1a1aa",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#facc15",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#09090b",
      };
    case "monokai":
      return {
        background: "#272822",
        foreground: "#f8f8f2",
        cursor: "#f8f8f2",
        cursorAccent: "#272822",
        selectionBackground: "#49483e",
        black: "#272822",
        red: "#f92672",
        green: "#a6e22e",
        yellow: "#f4bf75",
        blue: "#66d9ef",
        magenta: "#ae81ff",
        cyan: "#a1efe4",
        white: "#f8f8f2",
        brightBlack: "#75715e",
        brightRed: "#f92672",
        brightGreen: "#a6e22e",
        brightYellow: "#f4bf75",
        brightBlue: "#66d9ef",
        brightMagenta: "#ae81ff",
        brightCyan: "#a1efe4",
        brightWhite: "#f9f8f5",
      };
    case "dracula":
      return {
        background: "#282a36",
        foreground: "#f8f8f2",
        cursor: "#f8f8f2",
        cursorAccent: "#282a36",
        selectionBackground: "#44475a",
        black: "#21222c",
        red: "#ff5555",
        green: "#50fa7b",
        yellow: "#f1fa8c",
        blue: "#bd93f9",
        magenta: "#ff79c6",
        cyan: "#8be9fd",
        white: "#f8f8f2",
        brightBlack: "#6272a4",
        brightRed: "#ff6e6e",
        brightGreen: "#69ff94",
        brightYellow: "#ffffa5",
        brightBlue: "#d6acff",
        brightMagenta: "#ff92df",
        brightCyan: "#a4ffff",
        brightWhite: "#ffffff",
      };
    case "solarized-dark":
      return {
        background: "#002b36",
        foreground: "#839496",
        cursor: "#839496",
        cursorAccent: "#002b36",
        selectionBackground: "#073642",
        black: "#073642",
        red: "#dc322f",
        green: "#859900",
        yellow: "#b58900",
        blue: "#268bd2",
        magenta: "#d33682",
        cyan: "#2aa198",
        white: "#eee8d5",
        brightBlack: "#002b36",
        brightRed: "#cb4b16",
        brightGreen: "#586e75",
        brightYellow: "#657b83",
        brightBlue: "#839496",
        brightMagenta: "#6c71c4",
        brightCyan: "#93a1a1",
        brightWhite: "#fdf6e3",
      };
    case "solarized-light":
      return {
        background: "#fdf6e3",
        foreground: "#657b83",
        cursor: "#657b83",
        cursorAccent: "#fdf6e3",
        selectionBackground: "#eee8d5",
        black: "#073642",
        red: "#dc322f",
        green: "#859900",
        yellow: "#b58900",
        blue: "#268bd2",
        magenta: "#d33682",
        cyan: "#2aa198",
        white: "#eee8d5",
        brightBlack: "#002b36",
        brightRed: "#cb4b16",
        brightGreen: "#586e75",
        brightYellow: "#657b83",
        brightBlue: "#839496",
        brightMagenta: "#6c71c4",
        brightCyan: "#93a1a1",
        brightWhite: "#fdf6e3",
      };
    case "dark":
    default:
      return {
        background: "#0a0a0f",
        foreground: "#e4e4e7",
        cursor: "#e4e4e7",
        cursorAccent: "#0a0a0f",
        selectionBackground: "#3f3f46",
        black: "#18181b",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#fafafa",
        brightBlack: "#52525b",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#facc15",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#ffffff",
      };
  }
}

export { DEFAULT_SETTINGS as DEFAULT_TERMINAL_SETTINGS };
