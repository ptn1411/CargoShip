import { Eye, EyeOff, Search, X } from "lucide-react";
import {
  forwardRef,
  InputHTMLAttributes,
  ReactNode,
  useId,
  useState,
} from "react";
import { cn } from "../../lib/utils";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Visual size variant */
  size?: "sm" | "md" | "lg";
  /** Left icon or element */
  leftIcon?: ReactNode;
  /** Right icon or element */
  rightIcon?: ReactNode;
  /** Error message to display */
  error?: string;
  /** Helper text below input */
  helperText?: string;
  /** Label text */
  label?: string;
  /** Whether label should be visible or sr-only */
  labelHidden?: boolean;
  /** Full width input */
  fullWidth?: boolean;
}

const sizeStyles = {
  sm: "h-8 text-xs px-2.5",
  md: "h-10 text-sm px-3",
  lg: "h-12 text-base px-4",
};

const iconSizeStyles = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

/**
 * Input component with labels, icons, and error states.
 * Follows WCAG AA accessibility guidelines.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      size = "md",
      leftIcon,
      rightIcon,
      error,
      helperText,
      label,
      labelHidden = false,
      fullWidth = false,
      disabled,
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    return (
      <div className={cn("flex flex-col gap-1.5", fullWidth && "w-full")}>
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              "text-sm font-medium text-foreground",
              labelHidden && "sr-only",
              disabled && "text-muted-foreground"
            )}>
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span
              className={cn(
                "absolute left-3 top-1/2 -translate-y-1/2",
                "text-muted-foreground pointer-events-none",
                iconSizeStyles[size]
              )}
              aria-hidden="true">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              // Base styles
              "w-full rounded-lg font-mono",
              "bg-secondary border border-border",
              "text-foreground placeholder:text-muted-foreground",
              // Focus styles - keyboard-first UX
              "focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary",
              // Transitions
              "transition-colors duration-200",
              // Disabled
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-muted",
              // Error state
              error &&
                "border-destructive focus:ring-destructive focus:border-destructive",
              // Size
              sizeStyles[size],
              // Padding adjustments for icons
              leftIcon && "pl-9",
              rightIcon && "pr-9",
              className
            )}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={
              error ? errorId : helperText ? helperId : undefined
            }
            {...props}
          />
          {rightIcon && (
            <span
              className={cn(
                "absolute right-3 top-1/2 -translate-y-1/2",
                "text-muted-foreground",
                iconSizeStyles[size]
              )}
              aria-hidden="true">
              {rightIcon}
            </span>
          )}
        </div>
        {error && (
          <p id={errorId} className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="text-xs text-muted-foreground">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

/**
 * SearchInput - Specialized input for search functionality
 */
export interface SearchInputProps
  extends Omit<InputProps, "leftIcon" | "type"> {
  /** Callback when search is cleared */
  onClear?: () => void;
  /** Show clear button when has value */
  showClear?: boolean;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ onClear, showClear = true, value, className, ...props }, ref) => {
    const hasValue = value && String(value).length > 0;

    return (
      <Input
        ref={ref}
        type="search"
        leftIcon={<Search />}
        rightIcon={
          showClear && hasValue ? (
            <button
              type="button"
              onClick={onClear}
              className="cursor-pointer hover:text-foreground transition-colors"
              aria-label="Clear search">
              <X className="w-4 h-4" />
            </button>
          ) : undefined
        }
        value={value}
        className={cn("font-sans", className)}
        {...props}
      />
    );
  }
);

SearchInput.displayName = "SearchInput";

/**
 * PasswordInput - Input with show/hide password toggle
 */
export interface PasswordInputProps
  extends Omit<InputProps, "type" | "rightIcon"> {}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <Input
        ref={ref}
        type={showPassword ? "text" : "password"}
        rightIcon={
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="cursor-pointer hover:text-foreground transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}>
            {showPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        }
        className={className}
        {...props}
      />
    );
  }
);

PasswordInput.displayName = "PasswordInput";

/**
 * Textarea component with similar styling to Input
 */
export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  helperText?: string;
  label?: string;
  labelHidden?: boolean;
  fullWidth?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      error,
      helperText,
      label,
      labelHidden = false,
      fullWidth = false,
      disabled,
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    return (
      <div className={cn("flex flex-col gap-1.5", fullWidth && "w-full")}>
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              "text-sm font-medium text-foreground",
              labelHidden && "sr-only",
              disabled && "text-muted-foreground"
            )}>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            // Base styles
            "w-full rounded-lg font-mono",
            "bg-secondary border border-border",
            "text-foreground placeholder:text-muted-foreground",
            "min-h-[80px] px-3 py-2 text-sm",
            // Focus styles
            "focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary",
            // Transitions
            "transition-colors duration-200",
            // Disabled
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-muted",
            // Resize
            "resize-y",
            // Error state
            error &&
              "border-destructive focus:ring-destructive focus:border-destructive",
            className
          )}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          {...props}
        />
        {error && (
          <p id={errorId} className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="text-xs text-muted-foreground">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
