import { X } from "lucide-react";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

/**
 * Modal Context
 */
interface ModalContextValue {
  onClose: () => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

function useModalContext() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("Modal components must be used within a Modal provider");
  }
  return context;
}

/**
 * Modal - Root modal dialog component
 */
export interface ModalProps {
  children: ReactNode;
  /** Whether modal is open */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** Close on backdrop click */
  closeOnBackdrop?: boolean;
  /** Close on escape key */
  closeOnEscape?: boolean;
  /** Prevent body scroll when open */
  preventScroll?: boolean;
  className?: string;
}

export function Modal({
  children,
  open,
  onClose,
  closeOnBackdrop = true,
  closeOnEscape = true,
  preventScroll = true,
  className,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Handle escape key
  useEffect(() => {
    if (!open || !closeOnEscape) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, closeOnEscape, onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (!preventScroll) return;

    if (open) {
      const scrollbarWidth =
        window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    }

    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [open, preventScroll]);

  // Focus management
  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      // Focus first focusable element in modal
      setTimeout(() => {
        const focusable = overlayRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        focusable?.focus();
      }, 0);
    } else {
      previousActiveElement.current?.focus();
    }
  }, [open]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (closeOnBackdrop && e.target === overlayRef.current) {
        onClose();
      }
    },
    [closeOnBackdrop, onClose]
  );

  if (!open) return null;

  return createPortal(
    <ModalContext.Provider value={{ onClose }}>
      <div
        ref={overlayRef}
        onClick={handleBackdropClick}
        className={cn(
          "fixed inset-0 z-50",
          "flex items-center justify-center p-4",
          "bg-background/80 backdrop-blur-sm",
          "animate-fade-in",
          className
        )}
        role="dialog"
        aria-modal="true">
        {children}
      </div>
    </ModalContext.Provider>,
    document.body
  );
}

/**
 * ModalContent - Main modal container
 */
export interface ModalContentProps {
  children: ReactNode;
  /** Modal size */
  size?: "sm" | "md" | "lg" | "xl" | "full";
  className?: string;
}

const sizeStyles = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  full: "max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]",
};

export function ModalContent({
  children,
  size = "md",
  className,
}: ModalContentProps) {
  return (
    <div
      className={cn(
        "relative w-full",
        "bg-card border border-border rounded-xl shadow-xl",
        "animate-scale-in",
        sizeStyles[size],
        className
      )}
      onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

/**
 * ModalHeader - Modal header section
 */
export interface ModalHeaderProps {
  children: ReactNode;
  /** Show close button */
  showClose?: boolean;
  className?: string;
}

export function ModalHeader({
  children,
  showClose = true,
  className,
}: ModalHeaderProps) {
  const { onClose } = useModalContext();

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4",
        "px-6 py-4 border-b border-border",
        className
      )}>
      <div className="min-w-0">{children}</div>
      {showClose && (
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "shrink-0 p-2 rounded-lg cursor-pointer",
            "text-muted-foreground hover:text-foreground",
            "hover:bg-accent transition-colors duration-200",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          )}
          aria-label="Close modal">
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

/**
 * ModalTitle - Modal title text
 */
export interface ModalTitleProps {
  children: ReactNode;
  className?: string;
}

export function ModalTitle({ children, className }: ModalTitleProps) {
  return (
    <h2 className={cn("text-lg font-semibold text-foreground", className)}>
      {children}
    </h2>
  );
}

/**
 * ModalDescription - Modal description text
 */
export interface ModalDescriptionProps {
  children: ReactNode;
  className?: string;
}

export function ModalDescription({
  children,
  className,
}: ModalDescriptionProps) {
  return (
    <p className={cn("text-sm text-muted-foreground mt-1", className)}>
      {children}
    </p>
  );
}

/**
 * ModalBody - Modal body content
 */
export interface ModalBodyProps {
  children: ReactNode;
  className?: string;
}

export function ModalBody({ children, className }: ModalBodyProps) {
  return (
    <div className={cn("px-6 py-4 overflow-auto", className)}>{children}</div>
  );
}

/**
 * ModalFooter - Modal footer with actions
 */
export interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}

export function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-3",
        "px-6 py-4 border-t border-border",
        "bg-muted/30",
        className
      )}>
      {children}
    </div>
  );
}

/**
 * ConfirmModal - Pre-built confirmation dialog
 */
export interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  isLoading?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  isLoading = false,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent size="sm">
        <ModalHeader showClose={false}>
          <ModalTitle>{title}</ModalTitle>
          {description && <ModalDescription>{description}</ModalDescription>}
        </ModalHeader>
        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium cursor-pointer",
              "bg-secondary text-secondary-foreground border border-border",
              "hover:bg-accent transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}>
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium cursor-pointer",
              "transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              variant === "danger"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive"
                : "bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}>
            {isLoading ? "Loading..." : confirmLabel}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
