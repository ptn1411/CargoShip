import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import { ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * Alert component for displaying important messages
 */
export interface AlertProps {
  /** Alert content */
  children: ReactNode;
  /** Alert title */
  title?: string;
  /** Alert variant */
  variant?: "info" | "success" | "warning" | "danger";
  /** Custom icon (overrides default) */
  icon?: ReactNode;
  /** Show close button */
  dismissible?: boolean;
  /** Close handler */
  onDismiss?: () => void;
  /** Additional actions */
  actions?: ReactNode;
  className?: string;
}

const variantStyles = {
  info: {
    container: "bg-primary/5 border-primary/20 text-foreground",
    icon: "text-primary",
    iconComponent: Info,
  },
  success: {
    container: "bg-success/5 border-success/20 text-foreground",
    icon: "text-success",
    iconComponent: CheckCircle2,
  },
  warning: {
    container: "bg-warning/5 border-warning/20 text-foreground",
    icon: "text-warning",
    iconComponent: AlertTriangle,
  },
  danger: {
    container: "bg-destructive/5 border-destructive/20 text-foreground",
    icon: "text-destructive",
    iconComponent: AlertCircle,
  },
};

export function Alert({
  children,
  title,
  variant = "info",
  icon,
  dismissible = false,
  onDismiss,
  actions,
  className,
}: AlertProps) {
  const styles = variantStyles[variant];
  const IconComponent = styles.iconComponent;

  return (
    <div
      role="alert"
      className={cn(
        "relative flex gap-3 p-4 rounded-lg border",
        styles.container,
        className
      )}>
      <div className={cn("shrink-0 mt-0.5", styles.icon)} aria-hidden="true">
        {icon || <IconComponent className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        {title && (
          <h5 className="font-semibold text-foreground mb-1">{title}</h5>
        )}
        <div className="text-sm text-muted-foreground">{children}</div>
        {actions && (
          <div className="mt-3 flex items-center gap-2">{actions}</div>
        )}
      </div>
      {dismissible && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className={cn(
            "shrink-0 p-1 rounded cursor-pointer",
            "text-muted-foreground hover:text-foreground",
            "transition-colors duration-200",
            "focus:outline-none focus:ring-2 focus:ring-primary"
          )}
          aria-label="Dismiss alert">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/**
 * InlineAlert - More compact inline alert
 */
export interface InlineAlertProps {
  children: ReactNode;
  variant?: "info" | "success" | "warning" | "danger";
  icon?: ReactNode;
  className?: string;
}

export function InlineAlert({
  children,
  variant = "info",
  icon,
  className,
}: InlineAlertProps) {
  const styles = variantStyles[variant];
  const IconComponent = styles.iconComponent;

  return (
    <div
      role="alert"
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm",
        styles.container,
        className
      )}>
      <span className={styles.icon} aria-hidden="true">
        {icon || <IconComponent className="w-4 h-4" />}
      </span>
      {children}
    </div>
  );
}

/**
 * Banner - Full-width alert banner
 */
export interface BannerProps {
  children: ReactNode;
  variant?: "info" | "success" | "warning" | "danger";
  icon?: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  actions?: ReactNode;
  className?: string;
}

export function Banner({
  children,
  variant = "info",
  icon,
  dismissible = false,
  onDismiss,
  actions,
  className,
}: BannerProps) {
  const styles = variantStyles[variant];
  const IconComponent = styles.iconComponent;

  return (
    <div
      role="alert"
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-3",
        "border-b",
        styles.container,
        className
      )}>
      <div className="flex items-center gap-3 min-w-0">
        <span className={styles.icon} aria-hidden="true">
          {icon || <IconComponent className="w-5 h-5" />}
        </span>
        <p className="text-sm">{children}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {actions}
        {dismissible && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={cn(
              "p-1 rounded cursor-pointer",
              "text-muted-foreground hover:text-foreground",
              "transition-colors duration-200",
              "focus:outline-none focus:ring-2 focus:ring-primary"
            )}
            aria-label="Dismiss banner">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * EmptyState - Placeholder for empty content areas
 */
export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className
      )}
      role="status">
      {icon && (
        <div
          className="p-4 rounded-full bg-muted text-muted-foreground mb-4"
          aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          {description}
        </p>
      )}
      {actions && <div className="mt-6 flex items-center gap-3">{actions}</div>}
    </div>
  );
}

/**
 * ErrorState - Specialized empty state for errors
 */
export interface ErrorStateProps {
  title?: string;
  description?: string;
  error?: Error | string;
  retry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  description,
  error,
  retry,
  className,
}: ErrorStateProps) {
  const errorMessage =
    description ||
    (error instanceof Error ? error.message : error) ||
    "An unexpected error occurred";

  return (
    <EmptyState
      icon={<AlertCircle className="w-8 h-8" />}
      title={title}
      description={errorMessage}
      actions={
        retry && (
          <button
            type="button"
            onClick={retry}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium cursor-pointer",
              "bg-primary text-primary-foreground",
              "hover:bg-primary/90 transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            )}>
            Try again
          </button>
        )
      }
      className={className}
    />
  );
}
