import { Check, ChevronDown, X } from "lucide-react";
import {
  forwardRef,
  KeyboardEvent,
  ReactNode,
  SelectHTMLAttributes,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "../../lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: ReactNode;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  /** Options to display */
  options: SelectOption[];
  /** Visual size variant */
  size?: "sm" | "md" | "lg";
  /** Error message */
  error?: string;
  /** Helper text */
  helperText?: string;
  /** Label text */
  label?: string;
  /** Whether label should be visible or sr-only */
  labelHidden?: boolean;
  /** Full width */
  fullWidth?: boolean;
  /** Placeholder text when no value selected */
  placeholder?: string;
}

const sizeStyles = {
  sm: "h-8 text-xs px-2.5",
  md: "h-10 text-sm px-3",
  lg: "h-12 text-base px-4",
};

/**
 * Native Select component with custom styling.
 * Uses native select for better accessibility and mobile support.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      options,
      size = "md",
      error,
      helperText,
      label,
      labelHidden = false,
      fullWidth = false,
      placeholder,
      disabled,
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    const errorId = `${selectId}-error`;
    const helperId = `${selectId}-helper`;

    return (
      <div className={cn("flex flex-col gap-1.5", fullWidth && "w-full")}>
        {label && (
          <label
            htmlFor={selectId}
            className={cn(
              "text-sm font-medium text-foreground",
              labelHidden && "sr-only",
              disabled && "text-muted-foreground"
            )}>
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              // Base styles
              "w-full rounded-lg appearance-none cursor-pointer",
              "bg-secondary border border-border",
              "text-foreground",
              // Focus styles
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
              "pr-10", // Space for chevron
              className
            )}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={
              error ? errorId : helperText ? helperId : undefined
            }
            {...props}>
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className={cn(
              "absolute right-3 top-1/2 -translate-y-1/2",
              "w-4 h-4 text-muted-foreground pointer-events-none"
            )}
            aria-hidden="true"
          />
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

Select.displayName = "Select";

/**
 * Multi-select with tags
 */
export interface MultiSelectProps {
  options: SelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  size?: "sm" | "md" | "lg";
  error?: string;
  helperText?: string;
  label?: string;
  labelHidden?: boolean;
  fullWidth?: boolean;
  placeholder?: string;
  disabled?: boolean;
  maxItems?: number;
}

export function MultiSelect({
  options,
  value,
  onChange,
  // size parameter reserved for future use
  size: _size = "md",
  error,
  helperText,
  label,
  labelHidden = false,
  fullWidth = false,
  placeholder = "Select options...",
  disabled,
  maxItems,
}: MultiSelectProps) {
  // Suppress unused variable warning
  void _size;

  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const labelId = useId();

  const selectedOptions = options.filter((opt) => value.includes(opt.value));
  const availableOptions = options.filter(
    (opt) => !value.includes(opt.value) && !opt.disabled
  );

  const canAddMore = !maxItems || value.length < maxItems;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        if (isOpen && availableOptions[highlightedIndex] && canAddMore) {
          onChange([...value, availableOptions[highlightedIndex].value]);
          setHighlightedIndex(0);
        } else {
          setIsOpen(true);
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex((prev) =>
            Math.min(prev + 1, availableOptions.length - 1)
          );
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Escape":
        setIsOpen(false);
        break;
      case "Backspace":
        if (value.length > 0) {
          onChange(value.slice(0, -1));
        }
        break;
    }
  };

  const removeValue = (valueToRemove: string) => {
    onChange(value.filter((v) => v !== valueToRemove));
  };

  const addValue = (valueToAdd: string) => {
    if (canAddMore) {
      onChange([...value, valueToAdd]);
      setHighlightedIndex(0);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn("flex flex-col gap-1.5", fullWidth && "w-full")}>
      {label && (
        <span
          id={labelId}
          className={cn(
            "text-sm font-medium text-foreground",
            labelHidden && "sr-only",
            disabled && "text-muted-foreground"
          )}>
          {label}
        </span>
      )}
      <div className="relative">
        <div
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-labelledby={labelId}
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          className={cn(
            "flex flex-wrap gap-1.5 items-center min-h-10 px-3 py-1.5",
            "rounded-lg cursor-pointer",
            "bg-secondary border border-border",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary",
            "transition-colors duration-200",
            disabled && "opacity-50 cursor-not-allowed bg-muted",
            error &&
              "border-destructive focus:ring-destructive focus:border-destructive"
          )}>
          {selectedOptions.map((option) => (
            <span
              key={option.value}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5",
                "bg-primary/10 text-primary text-xs rounded-md",
                "border border-primary/20"
              )}>
              {option.icon}
              {option.label}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeValue(option.value);
                }}
                className="hover:text-destructive transition-colors cursor-pointer"
                aria-label={`Remove ${option.label}`}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {selectedOptions.length === 0 && (
            <span className="text-muted-foreground text-sm">{placeholder}</span>
          )}
          <ChevronDown
            className={cn(
              "ml-auto w-4 h-4 text-muted-foreground transition-transform",
              isOpen && "rotate-180"
            )}
            aria-hidden="true"
          />
        </div>

        {isOpen && availableOptions.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            aria-labelledby={labelId}
            className={cn(
              "absolute z-50 w-full mt-1 py-1",
              "bg-popover border border-border rounded-lg shadow-lg",
              "max-h-60 overflow-auto",
              "animate-scale-in origin-top"
            )}>
            {availableOptions.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={highlightedIndex === index}
                onClick={() => addValue(option.value)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 cursor-pointer",
                  "text-sm text-foreground",
                  "transition-colors duration-150",
                  highlightedIndex === index && "bg-accent",
                  !canAddMore && "opacity-50 cursor-not-allowed"
                )}>
                {option.icon}
                {option.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}

/**
 * Checkbox component
 */
export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: string;
  description?: string;
  size?: "sm" | "md" | "lg";
}

const checkboxSizeStyles = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    { label, description, size = "md", className, disabled, id, ...props },
    ref
  ) => {
    const generatedId = useId();
    const checkboxId = id || generatedId;
    const descriptionId = `${checkboxId}-description`;

    return (
      <div className={cn("flex items-start gap-3", className)}>
        <div className="relative flex items-center">
          <input
            ref={ref}
            id={checkboxId}
            type="checkbox"
            className={cn(
              "appearance-none rounded cursor-pointer",
              "bg-secondary border border-border",
              "checked:bg-primary checked:border-primary",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
              "transition-colors duration-200",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              checkboxSizeStyles[size]
            )}
            disabled={disabled}
            aria-describedby={description ? descriptionId : undefined}
            {...props}
          />
          <Check
            className={cn(
              "absolute pointer-events-none text-primary-foreground",
              "opacity-0 scale-0 transition-all duration-200",
              "peer-checked:opacity-100 peer-checked:scale-100",
              size === "sm"
                ? "w-3 h-3"
                : size === "lg"
                ? "w-4 h-4"
                : "w-3.5 h-3.5",
              "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            )}
            aria-hidden="true"
          />
        </div>
        {(label || description) && (
          <div className="flex flex-col">
            {label && (
              <label
                htmlFor={checkboxId}
                className={cn(
                  "text-sm font-medium text-foreground cursor-pointer",
                  disabled && "text-muted-foreground cursor-not-allowed"
                )}>
                {label}
              </label>
            )}
            {description && (
              <p
                id={descriptionId}
                className="text-xs text-muted-foreground mt-0.5">
                {description}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
);

Checkbox.displayName = "Checkbox";

/**
 * Switch/Toggle component
 */
export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: string;
  description?: string;
  size?: "sm" | "md" | "lg";
}

const switchSizeStyles = {
  sm: { track: "w-8 h-4", thumb: "w-3 h-3", translate: "translate-x-4" },
  md: { track: "w-11 h-6", thumb: "w-5 h-5", translate: "translate-x-5" },
  lg: { track: "w-14 h-7", thumb: "w-6 h-6", translate: "translate-x-7" },
};

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  (
    {
      label,
      description,
      size = "md",
      className,
      disabled,
      checked,
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const switchId = id || generatedId;
    const descriptionId = `${switchId}-description`;
    const styles = switchSizeStyles[size];

    return (
      <div className={cn("flex items-start gap-3", className)}>
        <label
          htmlFor={switchId}
          className={cn(
            "relative inline-flex items-center cursor-pointer",
            disabled && "cursor-not-allowed opacity-50"
          )}>
          <input
            ref={ref}
            id={switchId}
            type="checkbox"
            role="switch"
            className="sr-only peer"
            disabled={disabled}
            checked={checked}
            aria-describedby={description ? descriptionId : undefined}
            {...props}
          />
          <div
            className={cn(
              "rounded-full",
              "bg-muted border border-border",
              "peer-checked:bg-primary peer-checked:border-primary",
              "peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
              "transition-colors duration-200",
              styles.track
            )}
            aria-hidden="true"
          />
          <div
            className={cn(
              "absolute rounded-full",
              "bg-foreground",
              "peer-checked:bg-primary-foreground",
              "left-0.5 top-1/2 -translate-y-1/2",
              "transition-transform duration-200",
              checked && styles.translate,
              styles.thumb
            )}
            aria-hidden="true"
          />
        </label>
        {(label || description) && (
          <div className="flex flex-col">
            {label && (
              <span
                className={cn(
                  "text-sm font-medium text-foreground",
                  disabled && "text-muted-foreground"
                )}>
                {label}
              </span>
            )}
            {description && (
              <p
                id={descriptionId}
                className="text-xs text-muted-foreground mt-0.5">
                {description}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
);

Switch.displayName = "Switch";
