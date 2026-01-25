import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

export interface InputDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Dialog title */
  title: string;
  /** Dialog description */
  description?: string;
  /** Input label */
  label: string;
  /** Input placeholder */
  placeholder?: string;
  /** Initial input value */
  initialValue?: string;
  /** Submit button text */
  submitText?: string;
  /** Whether the operation is in progress */
  isLoading?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Callback when dialog is submitted */
  onSubmit: (value: string) => void;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Optional validation function */
  validate?: (value: string) => string | null;
}

/**
 * Reusable input dialog for file operations
 * Used for: New File, New Folder, Rename
 */
export function InputDialog({
  isOpen,
  title,
  description,
  label,
  placeholder,
  initialValue = "",
  submitText = "Create",
  isLoading = false,
  error,
  onSubmit,
  onClose,
  validate,
}: InputDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset value when dialog opens
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setValidationError(null);
      // Focus input after a short delay to ensure dialog is rendered
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialValue]);

  // Select filename without extension for rename
  useEffect(() => {
    if (isOpen && inputRef.current && initialValue) {
      const lastDot = initialValue.lastIndexOf(".");
      if (lastDot > 0) {
        inputRef.current.setSelectionRange(0, lastDot);
      } else {
        inputRef.current.select();
      }
    }
  }, [isOpen, initialValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      setValidationError("Name cannot be empty");
      return;
    }

    if (validate) {
      const error = validate(trimmedValue);
      if (error) {
        setValidationError(error);
        return;
      }
    }

    setValidationError(null);
    onSubmit(trimmedValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  const displayError = error || validationError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className={cn(
          "relative bg-background border border-border rounded-lg shadow-xl",
          "max-w-md w-full mx-4 animate-in fade-in zoom-in-95 duration-200"
        )}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-secondary transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}

          <div className="space-y-2">
            <label
              htmlFor="input-dialog-field"
              className="text-sm font-medium text-foreground"
            >
              {label}
            </label>
            <input
              ref={inputRef}
              id="input-dialog-field"
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setValidationError(null);
              }}
              placeholder={placeholder}
              disabled={isLoading}
              className={cn(
                "w-full px-3 py-2 rounded-md border bg-background text-sm",
                "focus:outline-none focus:ring-2 focus:ring-ring",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                displayError ? "border-destructive" : "border-input"
              )}
            />
            {displayError && (
              <p className="text-sm text-destructive">{displayError}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className={cn(
                "px-4 py-2 text-sm rounded-lg",
                "bg-secondary hover:bg-secondary/80 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !value.trim()}
              className={cn(
                "px-4 py-2 text-sm rounded-lg",
                "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isLoading ? "Processing..." : submitText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
