import { cn } from "../../lib/utils";

export interface StatusDotProps {
  status: "online" | "offline" | "warning" | "connecting" | "idle";
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  className?: string;
  label?: string;
}

const statusStyles = {
  online: "bg-success",
  offline: "bg-destructive",
  warning: "bg-warning",
  connecting: "bg-primary",
  idle: "bg-muted-foreground",
};

const sizeStyles = {
  sm: "w-2 h-2",
  md: "w-3 h-3",
  lg: "w-4 h-4",
};

export function StatusDot({
  status,
  size = "md",
  pulse = true,
  className,
  label,
}: StatusDotProps) {
  const showPulse = pulse && (status === "online" || status === "connecting");

  return (
    <span
      className={cn("relative inline-flex", className)}
      role="status"
      aria-label={label || `Status: ${status}`}>
      <span
        className={cn(
          "rounded-full",
          sizeStyles[size],
          statusStyles[status],
          status === "connecting" && "animate-pulse"
        )}
      />
      {showPulse && status === "online" && (
        <span
          className={cn(
            "absolute inset-0 rounded-full animate-ping opacity-50",
            statusStyles[status]
          )}
          aria-hidden="true"
        />
      )}
    </span>
  );
}

export interface StatusIndicatorProps {
  status: "online" | "offline" | "warning" | "connecting" | "idle";
  label?: string;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const statusLabels = {
  online: "Online",
  offline: "Offline",
  warning: "Warning",
  connecting: "Connecting",
  idle: "Idle",
};

const statusTextStyles = {
  online: "text-success",
  offline: "text-destructive",
  warning: "text-warning",
  connecting: "text-primary",
  idle: "text-muted-foreground",
};

export function StatusIndicator({
  status,
  label,
  showLabel = true,
  size = "md",
  className,
}: StatusIndicatorProps) {
  const displayLabel = label || statusLabels[status];

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <StatusDot status={status} size={size} />
      {showLabel && (
        <span
          className={cn(
            "text-xs font-medium",
            statusTextStyles[status]
          )}>
          {displayLabel}
        </span>
      )}
    </div>
  );
}
