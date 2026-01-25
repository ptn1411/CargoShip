import { cn } from "../../lib/utils";

/**
 * Progress bar component for displaying progress/completion
 */
export interface ProgressProps {
  /** Progress value (0-100) */
  value: number;
  /** Maximum value */
  max?: number;
  /** Size variant */
  size?: "xs" | "sm" | "md" | "lg";
  /** Color variant */
  variant?: "default" | "success" | "warning" | "danger" | "gradient";
  /** Show percentage label */
  showLabel?: boolean;
  /** Label position */
  labelPosition?: "inside" | "outside";
  /** Animated stripes */
  striped?: boolean;
  /** Animate stripes */
  animated?: boolean;
  /** Indeterminate state */
  indeterminate?: boolean;
  className?: string;
}

const sizeStyles = {
  xs: "h-1",
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
};

const variantStyles = {
  default: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  gradient: "bg-gradient-to-r from-primary via-primary/80 to-primary",
};

export function Progress({
  value,
  max = 100,
  size = "md",
  variant = "default",
  showLabel = false,
  labelPosition = "outside",
  striped = false,
  animated = false,
  indeterminate = false,
  className,
}: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const canShowInsideLabel = size === "lg" && labelPosition === "inside";

  return (
    <div className={cn("w-full", className)}>
      {showLabel && labelPosition === "outside" && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm text-muted-foreground">Progress</span>
          <span className="text-sm font-medium text-foreground font-mono">
            {Math.round(percentage)}%
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progress: ${Math.round(percentage)}%`}
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-muted",
          sizeStyles[size]
        )}>
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300 ease-out",
            variantStyles[variant],
            striped && [
              "bg-[length:1rem_1rem]",
              "bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)]",
            ],
            animated &&
              striped &&
              "animate-[progress-stripes_1s_linear_infinite]",
            indeterminate && [
              "w-1/3",
              "animate-[progress-indeterminate_1.5s_ease-in-out_infinite]",
            ]
          )}
          style={indeterminate ? undefined : { width: `${percentage}%` }}>
          {canShowInsideLabel && showLabel && (
            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-primary-foreground">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * CircularProgress - Circular progress indicator
 */
export interface CircularProgressProps {
  /** Progress value (0-100) */
  value: number;
  /** Size in pixels */
  size?: number;
  /** Stroke width */
  strokeWidth?: number;
  /** Color variant */
  variant?: "default" | "success" | "warning" | "danger";
  /** Show percentage label */
  showLabel?: boolean;
  /** Indeterminate state */
  indeterminate?: boolean;
  className?: string;
}

const circularVariantStyles = {
  default: "stroke-primary",
  success: "stroke-success",
  warning: "stroke-warning",
  danger: "stroke-destructive",
};

export function CircularProgress({
  value,
  size = 48,
  strokeWidth = 4,
  variant = "default",
  showLabel = false,
  indeterminate = false,
  className,
}: CircularProgressProps) {
  const percentage = Math.min(Math.max(value, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Progress: ${Math.round(percentage)}%`}
      className={cn("relative inline-flex", className)}
      style={{ width: size, height: size }}>
      <svg
        className={cn("transform -rotate-90", indeterminate && "animate-spin")}
        width={size}
        height={size}>
        {/* Background circle */}
        <circle
          className="stroke-muted"
          fill="none"
          strokeWidth={strokeWidth}
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        {/* Progress circle */}
        <circle
          className={cn(
            "transition-all duration-300 ease-out",
            circularVariantStyles[variant]
          )}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: indeterminate ? circumference * 0.75 : offset,
          }}
        />
      </svg>
      {showLabel && !indeterminate && (
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            "text-sm font-medium text-foreground font-mono"
          )}>
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
}

/**
 * ProgressSteps - Step-based progress indicator
 */
export interface ProgressStepsProps {
  steps: Array<{ label: string; description?: string }>;
  currentStep: number;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export function ProgressSteps({
  steps,
  currentStep,
  orientation = "horizontal",
  className,
}: ProgressStepsProps) {
  return (
    <div
      className={cn(
        "flex",
        orientation === "horizontal"
          ? "flex-row items-start gap-2"
          : "flex-col gap-4",
        className
      )}
      role="list"
      aria-label="Progress steps">
      {steps.map((step, index) => {
        const status =
          index < currentStep
            ? "completed"
            : index === currentStep
            ? "current"
            : "upcoming";

        return (
          <div
            key={index}
            className={cn(
              "flex",
              orientation === "horizontal"
                ? "flex-1 items-center"
                : "flex-row items-start gap-3"
            )}
            role="listitem"
            aria-current={status === "current" ? "step" : undefined}>
            {/* Step indicator */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex items-center justify-center",
                  "w-8 h-8 rounded-full text-sm font-medium",
                  "transition-colors duration-200",
                  status === "completed" &&
                    "bg-primary text-primary-foreground",
                  status === "current" &&
                    "bg-primary text-primary-foreground ring-4 ring-primary/20",
                  status === "upcoming" && "bg-muted text-muted-foreground"
                )}>
                {status === "completed" ? (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              {/* Connector line (horizontal) */}
              {orientation === "horizontal" && index < steps.length - 1 && (
                <div
                  className={cn(
                    "hidden sm:block w-full h-0.5 mt-4",
                    status === "completed" ? "bg-primary" : "bg-muted"
                  )}
                />
              )}
            </div>

            {/* Step content */}
            <div
              className={cn(
                orientation === "horizontal" ? "mt-2 text-center" : "flex-1"
              )}>
              <p
                className={cn(
                  "text-sm font-medium",
                  status === "upcoming"
                    ? "text-muted-foreground"
                    : "text-foreground"
                )}>
                {step.label}
              </p>
              {step.description && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {step.description}
                </p>
              )}
            </div>

            {/* Connector line (vertical) */}
            {orientation === "vertical" && index < steps.length - 1 && (
              <div
                className={cn(
                  "absolute left-4 top-10 w-0.5 h-full -translate-x-1/2",
                  status === "completed" ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
