import { Loader2 } from "lucide-react";
import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "destructive" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles = {
  primary: cn(
    "bg-primary text-primary-foreground",
    "hover:bg-primary/90 hover:shadow-lg",
    "active:bg-primary/95"
  ),
  secondary: cn(
    "bg-secondary text-secondary-foreground border border-border",
    "hover:bg-accent hover:border-primary/30",
    "active:bg-accent/80"
  ),
  ghost: cn(
    "bg-transparent text-foreground",
    "hover:bg-accent",
    "active:bg-accent/80"
  ),
  destructive: cn(
    "bg-destructive text-destructive-foreground",
    "hover:bg-destructive/90",
    "active:bg-destructive/95"
  ),
  outline: cn(
    "bg-transparent border border-border text-foreground",
    "hover:bg-accent hover:border-primary/30",
    "active:bg-accent/80"
  ),
};

const sizeStyles = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2.5",
  icon: "h-10 w-10 p-0",
};

/**
 * Button component with variants, sizes, and loading states.
 * Follows WCAG AA accessibility guidelines with proper focus states.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        className={cn(
          // Base styles
          "inline-flex items-center justify-center font-medium rounded-lg",
          "transition-all duration-200 ease-out",
          "cursor-pointer select-none",
          // Focus styles - keyboard-first UX
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          // Disabled styles
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
          // Variant and size
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={isLoading}
        {...props}>
        {isLoading && (
          <Loader2
            className={cn(
              "animate-spin",
              size === "sm" ? "w-3 h-3" : size === "lg" ? "w-5 h-5" : "w-4 h-4"
            )}
            aria-hidden="true"
          />
        )}
        {!isLoading && leftIcon && (
          <span className="shrink-0" aria-hidden="true">
            {leftIcon}
          </span>
        )}
        {children && <span>{children}</span>}
        {!isLoading && rightIcon && (
          <span className="shrink-0" aria-hidden="true">
            {rightIcon}
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

/**
 * IconButton - A button optimized for single icon display
 */
export interface IconButtonProps
  extends Omit<ButtonProps, "leftIcon" | "rightIcon" | "children"> {
  icon: React.ReactNode;
  "aria-label": string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, className, size = "icon", ...props }, ref) => {
    return (
      <Button ref={ref} size={size} className={className} {...props}>
        {icon}
      </Button>
    );
  }
);

IconButton.displayName = "IconButton";

/**
 * ButtonGroup - Container for grouping related buttons
 */
export interface ButtonGroupProps {
  children: React.ReactNode;
  className?: string;
  orientation?: "horizontal" | "vertical";
}

export function ButtonGroup({
  children,
  className,
  orientation = "horizontal",
}: ButtonGroupProps) {
  return (
    <div
      className={cn(
        "inline-flex",
        orientation === "horizontal"
          ? "flex-row [&>button]:rounded-none [&>button:first-child]:rounded-l-lg [&>button:last-child]:rounded-r-lg [&>button:not(:last-child)]:border-r-0"
          : "flex-col [&>button]:rounded-none [&>button:first-child]:rounded-t-lg [&>button:last-child]:rounded-b-lg [&>button:not(:last-child)]:border-b-0",
        className
      )}
      role="group">
      {children}
    </div>
  );
}
