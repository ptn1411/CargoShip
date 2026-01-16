import { ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * Badge component for status indicators, labels, and tags
 */
export interface BadgeProps {
  children: ReactNode;
  variant?:
    | "default"
    | "primary"
    | "secondary"
    | "success"
    | "warning"
    | "danger"
    | "outline";
  size?: "sm" | "md" | "lg";
  /** Display as a dot/pill with no text */
  dot?: boolean;
  /** Optional left icon */
  icon?: ReactNode;
  className?: string;
}

const variantStyles = {
  default: "bg-muted text-muted-foreground border-transparent",
  primary: "bg-primary/10 text-primary border-primary/20",
  secondary: "bg-secondary text-secondary-foreground border-border",
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  danger: "bg-destructive/10 text-destructive border-destructive/20",
  outline: "bg-transparent text-foreground border-border",
};

const sizeStyles = {
  sm: "text-[10px] px-1.5 py-0.5",
  md: "text-xs px-2 py-0.5",
  lg: "text-sm px-2.5 py-1",
};

const dotSizeStyles = {
  sm: "w-1.5 h-1.5",
  md: "w-2 h-2",
  lg: "w-2.5 h-2.5",
};

export function Badge({
  children,
  variant = "default",
  size = "md",
  dot = false,
  icon,
  className,
}: BadgeProps) {
  if (dot) {
    const dotVariantStyles = {
      default: "bg-muted-foreground",
      primary: "bg-primary",
      secondary: "bg-secondary-foreground",
      success: "bg-success",
      warning: "bg-warning",
      danger: "bg-destructive",
      outline: "bg-foreground",
    };

    return (
      <span
        className={cn(
          "inline-block rounded-full",
          dotSizeStyles[size],
          dotVariantStyles[variant],
          className
        )}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium rounded-full border",
        "transition-colors duration-200",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}>
      {icon && (
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}

/**
 * StatusBadge - Specialized badge for status indicators
 */
export interface StatusBadgeProps {
  status: "online" | "offline" | "warning" | "connecting" | "idle" | "error";
  label?: string;
  showDot?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const statusConfig = {
  online: {
    variant: "success" as const,
    label: "Online",
    dotClass: "bg-success",
  },
  offline: {
    variant: "danger" as const,
    label: "Offline",
    dotClass: "bg-destructive",
  },
  warning: {
    variant: "warning" as const,
    label: "Warning",
    dotClass: "bg-warning",
  },
  connecting: {
    variant: "primary" as const,
    label: "Connecting",
    dotClass: "bg-primary animate-pulse",
  },
  idle: {
    variant: "default" as const,
    label: "Idle",
    dotClass: "bg-muted-foreground",
  },
  error: {
    variant: "danger" as const,
    label: "Error",
    dotClass: "bg-destructive",
  },
};

export function StatusBadge({
  status,
  label,
  showDot = true,
  size = "md",
  className,
}: StatusBadgeProps) {
  const config = statusConfig[status];
  const displayLabel = label || config.label;

  return (
    <Badge
      variant={config.variant}
      size={size}
      icon={
        showDot ? (
          <span
            className={cn("rounded-full", dotSizeStyles[size], config.dotClass)}
            aria-hidden="true"
          />
        ) : undefined
      }
      className={className}>
      {displayLabel}
    </Badge>
  );
}

/**
 * EnvironmentBadge - Badge for environment indicators
 */
export interface EnvironmentBadgeProps {
  environment: "production" | "staging" | "development" | "testing" | "local";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const environmentConfig = {
  production: {
    variant: "danger" as const,
    label: "PROD",
    fullLabel: "Production",
  },
  staging: { variant: "warning" as const, label: "STG", fullLabel: "Staging" },
  development: {
    variant: "success" as const,
    label: "DEV",
    fullLabel: "Development",
  },
  testing: { variant: "primary" as const, label: "TEST", fullLabel: "Testing" },
  local: { variant: "default" as const, label: "LOCAL", fullLabel: "Local" },
};

export function EnvironmentBadge({
  environment,
  size = "sm",
  className,
}: EnvironmentBadgeProps) {
  const config = environmentConfig[environment];

  return (
    <Badge
      variant={config.variant}
      size={size}
      className={cn("font-mono uppercase tracking-wider", className)}
      aria-label={config.fullLabel}>
      {config.label}
    </Badge>
  );
}

/**
 * CountBadge - Badge for displaying counts/numbers
 */
export interface CountBadgeProps {
  count: number;
  max?: number;
  variant?: "default" | "primary" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function CountBadge({
  count,
  max = 99,
  variant = "default",
  size = "sm",
  className,
}: CountBadgeProps) {
  const displayCount = count > max ? `${max}+` : count;

  return (
    <Badge
      variant={variant}
      size={size}
      className={cn("min-w-5 justify-center font-mono", className)}>
      {displayCount}
    </Badge>
  );
}

/**
 * TagBadge - Badge styled as a removable tag
 */
export interface TagBadgeProps {
  children: ReactNode;
  onRemove?: () => void;
  variant?: "default" | "primary" | "secondary";
  size?: "sm" | "md";
  className?: string;
}

export function TagBadge({
  children,
  onRemove,
  variant = "secondary",
  size = "md",
  className,
}: TagBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium rounded-md border",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}>
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className={cn(
            "ml-0.5 -mr-0.5 p-0.5 rounded cursor-pointer",
            "hover:bg-foreground/10 transition-colors",
            "focus:outline-none focus:ring-1 focus:ring-primary"
          )}
          aria-label="Remove">
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </span>
  );
}
