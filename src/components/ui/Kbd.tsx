import { ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * Kbd - Keyboard key indicator for shortcuts
 * Uses developer-focused styling with monospace font
 */
export interface KbdProps {
  children: ReactNode;
  /** Visual style variant */
  variant?: "default" | "outline" | "ghost";
  /** Size variant */
  size?: "xs" | "sm" | "md";
  className?: string;
}

const variantStyles = {
  default: cn(
    "bg-muted border border-border",
    "shadow-[0_1px_0_1px_hsl(var(--border))]",
    "text-foreground"
  ),
  outline: cn("bg-transparent border border-border", "text-muted-foreground"),
  ghost: cn("bg-muted/50", "text-muted-foreground"),
};

const sizeStyles = {
  xs: "text-[10px] px-1 py-0.5 min-w-4",
  sm: "text-xs px-1.5 py-0.5 min-w-5",
  md: "text-sm px-2 py-1 min-w-6",
};

export function Kbd({
  children,
  variant = "default",
  size = "sm",
  className,
}: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center",
        "font-mono font-medium rounded",
        "select-none",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}>
      {children}
    </kbd>
  );
}

/**
 * KeyboardShortcut - Display a combination of keys
 */
export interface KeyboardShortcutProps {
  /** Keys in the shortcut (e.g., ["Ctrl", "S"]) */
  keys: string[];
  /** Visual style */
  variant?: "default" | "outline" | "ghost";
  /** Size */
  size?: "xs" | "sm" | "md";
  /** Separator between keys */
  separator?: "+" | "then" | "none";
  className?: string;
}

const separatorSymbols = {
  "+": "+",
  then: "→",
  none: "",
};

export function KeyboardShortcut({
  keys,
  variant = "default",
  size = "sm",
  separator = "+",
  className,
}: KeyboardShortcutProps) {
  const sep = separatorSymbols[separator];

  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      role="presentation"
      aria-label={`Keyboard shortcut: ${keys.join(" " + sep + " ")}`}>
      {keys.map((key, index) => (
        <span key={index} className="inline-flex items-center gap-0.5">
          <Kbd variant={variant} size={size}>
            {formatKey(key)}
          </Kbd>
          {separator !== "none" && index < keys.length - 1 && (
            <span className="text-muted-foreground text-xs mx-0.5">{sep}</span>
          )}
        </span>
      ))}
    </span>
  );
}

/**
 * Format key names to common symbols
 */
function formatKey(key: string): string {
  const keyMap: Record<string, string> = {
    ctrl: "⌃",
    control: "⌃",
    cmd: "⌘",
    command: "⌘",
    alt: "⌥",
    option: "⌥",
    shift: "⇧",
    enter: "↵",
    return: "↵",
    tab: "⇥",
    backspace: "⌫",
    delete: "⌦",
    escape: "Esc",
    esc: "Esc",
    space: "␣",
    up: "↑",
    down: "↓",
    left: "←",
    right: "→",
  };

  return keyMap[key.toLowerCase()] || key;
}

/**
 * ShortcutHint - Inline keyboard shortcut hint (smaller, more subtle)
 */
export interface ShortcutHintProps {
  keys: string[];
  className?: string;
}

export function ShortcutHint({ keys, className }: ShortcutHintProps) {
  return (
    <KeyboardShortcut
      keys={keys}
      variant="ghost"
      size="xs"
      separator="none"
      className={cn("opacity-70", className)}
    />
  );
}

/**
 * CommandKey - Platform-aware command key display
 * Shows ⌘ on Mac, Ctrl on Windows/Linux
 */
export interface CommandKeyProps {
  /** Additional keys after the command key */
  keys?: string[];
  size?: "xs" | "sm" | "md";
  className?: string;
}

export function CommandKey({
  keys = [],
  size = "sm",
  className,
}: CommandKeyProps) {
  // Detect platform (could be improved with actual detection)
  const isMac =
    typeof navigator !== "undefined" &&
    navigator.platform.toLowerCase().includes("mac");

  const commandKey = isMac ? "Cmd" : "Ctrl";
  const allKeys = [commandKey, ...keys];

  return <KeyboardShortcut keys={allKeys} size={size} className={className} />;
}
