import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  action?: ToastAction;
  duration?: number;
}

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles = {
  success:
    "bg-green-500/10 border-green-500/30 text-green-500 dark:bg-green-500/10 dark:border-green-500/30 dark:text-green-400",
  error:
    "bg-red-500/10 border-red-500/30 text-red-500 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400",
  warning:
    "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400",
  info: "bg-blue-500/10 border-blue-500/30 text-blue-500 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-400",
};

const iconStyles = {
  success: "text-green-500 dark:text-green-400",
  error: "text-red-500 dark:text-red-400",
  warning: "text-amber-500 dark:text-amber-400",
  info: "text-blue-500 dark:text-blue-400",
};

export function Toast({ toast, onDismiss }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const Icon = icons[toast.type];

  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        setIsExiting(true);
        setTimeout(() => onDismiss(toast.id), 200);
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onDismiss]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 rounded-lg border shadow-lg backdrop-blur-sm",
        "transition-all duration-200 ease-out",
        styles[toast.type],
        isExiting
          ? "opacity-0 translate-x-4"
          : "opacity-100 translate-x-0 animate-slide-up"
      )}
      role="alert"
      aria-live="polite">
      <Icon
        className={cn("w-5 h-5 shrink-0 mt-0.5", iconStyles[toast.type])}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground">{toast.title}</p>
        {toast.message && (
          <p className="mt-1 text-sm text-muted-foreground">{toast.message}</p>
        )}
        {toast.action && (
          <button
            onClick={toast.action.onClick}
            className={cn(
              "mt-2 text-sm font-medium underline underline-offset-2 cursor-pointer",
              "hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              "transition-all duration-150"
            )}>
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className={cn(
          "shrink-0 p-1.5 rounded-md cursor-pointer",
          "text-muted-foreground hover:text-foreground",
          "hover:bg-foreground/10 transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        )}
        aria-label="Dismiss notification">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
