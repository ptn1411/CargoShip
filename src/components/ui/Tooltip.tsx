import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * TooltipProvider - Must wrap app or component tree
 */
export const TooltipProvider = TooltipPrimitive.Provider;

/**
 * Tooltip - Simple tooltip component using Radix UI
 */
export interface TooltipProps {
  children: ReactNode;
  /** Tooltip content */
  content: ReactNode;
  /** Side of the trigger to display */
  side?: "top" | "right" | "bottom" | "left";
  /** Alignment against trigger */
  align?: "start" | "center" | "end";
  /** Delay before showing (ms) */
  delayDuration?: number;
  /** Skip delay when moving between tooltips */
  skipDelayDuration?: number;
  /** Whether to show arrow */
  showArrow?: boolean;
  /** Additional class for content */
  className?: string;
}

export function Tooltip({
  children,
  content,
  side = "top",
  align = "center",
  delayDuration = 200,
  showArrow = true,
  className,
}: TooltipProps) {
  if (!content) {
    return <>{children}</>;
  }

  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={5}
          className={cn(
            "z-50 px-3 py-1.5 rounded-md",
            "bg-popover text-popover-foreground text-sm",
            "border border-border shadow-md",
            "animate-scale-in origin-[var(--radix-tooltip-content-transform-origin)]",
            // Reduced motion support
            "motion-reduce:animate-none",
            className
          )}>
          {content}
          {showArrow && (
            <TooltipPrimitive.Arrow
              className="fill-popover stroke-border"
              width={10}
              height={5}
            />
          )}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/**
 * TooltipShortcut - Tooltip with keyboard shortcut display
 */
export interface TooltipShortcutProps extends Omit<TooltipProps, "content"> {
  /** Label text */
  label: string;
  /** Keyboard shortcut keys */
  shortcut?: string[];
}

export function TooltipShortcut({
  label,
  shortcut,
  ...props
}: TooltipShortcutProps) {
  return (
    <Tooltip
      {...props}
      content={
        <span className="inline-flex items-center gap-2">
          <span>{label}</span>
          {shortcut && shortcut.length > 0 && (
            <span className="inline-flex items-center gap-0.5">
              {shortcut.map((key, i) => (
                <kbd
                  key={i}
                  className={cn(
                    "px-1.5 py-0.5 rounded text-xs font-mono",
                    "bg-muted text-muted-foreground",
                    "border border-border"
                  )}>
                  {formatKey(key)}
                </kbd>
              ))}
            </span>
          )}
        </span>
      }
    />
  );
}

/**
 * InfoTooltip - Tooltip with info icon trigger
 */
export interface InfoTooltipProps {
  content: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

export function InfoTooltip({
  content,
  side = "top",
  className,
}: InfoTooltipProps) {
  return (
    <Tooltip content={content} side={side}>
      <button
        type="button"
        className={cn(
          "inline-flex items-center justify-center",
          "w-4 h-4 rounded-full",
          "text-muted-foreground hover:text-foreground",
          "bg-muted hover:bg-accent",
          "transition-colors duration-200",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          "cursor-help",
          className
        )}
        aria-label="More information">
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
    </Tooltip>
  );
}

/**
 * Format key names to symbols
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
    escape: "Esc",
    esc: "Esc",
  };

  return keyMap[key.toLowerCase()] || key;
}
