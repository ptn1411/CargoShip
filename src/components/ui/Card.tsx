import { ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * Card component - A flexible container with developer-focused styling
 */
export interface CardProps {
  children: ReactNode;
  className?: string;
  /** Enable hover effect */
  interactive?: boolean;
  /** Border highlight variant */
  variant?: "default" | "elevated" | "outlined" | "ghost";
  /** Padding size */
  padding?: "none" | "sm" | "md" | "lg";
  /** Click handler for interactive cards */
  onClick?: () => void;
}

const variantStyles = {
  default: "bg-card border border-border",
  elevated: "bg-card border border-border shadow-lg",
  outlined: "bg-transparent border-2 border-border",
  ghost: "bg-transparent",
};

const paddingStyles = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export function Card({
  children,
  className,
  interactive = false,
  variant = "default",
  padding = "md",
  onClick,
}: CardProps) {
  const Component = onClick ? "button" : "div";

  return (
    <Component
      onClick={onClick}
      className={cn(
        "rounded-lg",
        variantStyles[variant],
        paddingStyles[padding],
        interactive && [
          "cursor-pointer",
          "transition-all duration-200",
          "hover:border-primary/50 hover:shadow-md",
          "hover:bg-accent/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        ],
        onClick && "w-full text-left",
        className
      )}>
      {children}
    </Component>
  );
}

/**
 * CardHeader - Header section of a card
 */
export interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4",
        "pb-4 mb-4 border-b border-border",
        className
      )}>
      {children}
    </div>
  );
}

/**
 * CardTitle - Title text for cards
 */
export interface CardTitleProps {
  children: ReactNode;
  className?: string;
  as?: "h2" | "h3" | "h4" | "span";
}

export function CardTitle({
  children,
  className,
  as: Component = "h3",
}: CardTitleProps) {
  return (
    <Component
      className={cn("text-lg font-semibold text-foreground", className)}>
      {children}
    </Component>
  );
}

/**
 * CardDescription - Subtitle/description text
 */
export interface CardDescriptionProps {
  children: ReactNode;
  className?: string;
}

export function CardDescription({ children, className }: CardDescriptionProps) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>
  );
}

/**
 * CardContent - Main content area
 */
export interface CardContentProps {
  children: ReactNode;
  className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
  return <div className={cn("", className)}>{children}</div>;
}

/**
 * CardFooter - Footer section
 */
export interface CardFooterProps {
  children: ReactNode;
  className?: string;
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        "pt-4 mt-4 border-t border-border",
        className
      )}>
      {children}
    </div>
  );
}

/**
 * MetricCard - Card optimized for displaying metrics/stats
 */
export interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  status?: "default" | "success" | "warning" | "danger";
  className?: string;
}

const statusStyles = {
  default: "border-border",
  success: "border-l-4 border-l-success border-t-0 border-r-0 border-b-0",
  warning: "border-l-4 border-l-warning border-t-0 border-r-0 border-b-0",
  danger: "border-l-4 border-l-destructive border-t-0 border-r-0 border-b-0",
};

export function MetricCard({
  label,
  value,
  icon,
  trend,
  status = "default",
  className,
}: MetricCardProps) {
  return (
    <Card
      className={cn("flex items-start gap-4", statusStyles[status], className)}>
      {icon && (
        <div
          className={cn(
            "p-2.5 rounded-lg bg-primary/10 text-primary",
            "shrink-0"
          )}
          aria-hidden="true">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground truncate">{label}</p>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-2xl font-bold text-foreground font-mono">
            {value}
          </span>
          {trend && (
            <span
              className={cn(
                "text-xs font-medium",
                trend.isPositive ? "text-success" : "text-destructive"
              )}>
              {trend.isPositive ? "+" : "-"}
              {Math.abs(trend.value)}%
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * ServerCard - Card optimized for server status display
 */
export interface ServerCardProps {
  name: string;
  host: string;
  status: "online" | "offline" | "warning" | "connecting";
  environment?: "production" | "staging" | "development";
  onClick?: () => void;
  className?: string;
}

const serverStatusStyles = {
  online: "bg-success",
  offline: "bg-destructive",
  warning: "bg-warning",
  connecting: "bg-primary animate-pulse",
};

const environmentBadgeStyles = {
  production: "bg-destructive/10 text-destructive border-destructive/20",
  staging: "bg-warning/10 text-warning border-warning/20",
  development: "bg-success/10 text-success border-success/20",
};

export function ServerCard({
  name,
  host,
  status,
  environment,
  onClick,
  className,
}: ServerCardProps) {
  return (
    <Card interactive onClick={onClick} className={cn("group", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative">
            <div
              className={cn("w-3 h-3 rounded-full", serverStatusStyles[status])}
              aria-hidden="true"
            />
            {status === "online" && (
              <div
                className="absolute inset-0 rounded-full bg-success animate-ping opacity-50"
                aria-hidden="true"
              />
            )}
          </div>
          <div className="min-w-0">
            <h4 className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
              {name}
            </h4>
            <p className="text-xs text-muted-foreground font-mono truncate">
              {host}
            </p>
          </div>
        </div>
        {environment && (
          <span
            className={cn(
              "shrink-0 px-2 py-0.5 text-xs font-medium rounded-full border",
              environmentBadgeStyles[environment]
            )}>
            {environment}
          </span>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-border">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Status: <span className="text-foreground capitalize">{status}</span>
          </span>
        </div>
      </div>
    </Card>
  );
}
