import { useEffect, useState } from "react";
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";
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
  success: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200",
  error: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200",
  warning: "bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200",
  info: "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200",
};

const iconStyles = {
  success: "text-green-500",
  error: "text-red-500",
  warning: "text-yellow-500",
  info: "text-blue-500",
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
        "flex items-start gap-3 p-4 rounded-lg border shadow-lg transition-all duration-200",
        styles[toast.type],
        isExiting ? "opacity-0 translate-x-4" : "opacity-100 translate-x-0"
      )}
      role="alert"
    >
      <Icon className={cn("w-5 h-5 shrink-0 mt-0.5", iconStyles[toast.type])} />
      <div className="flex-1 min-w-0">
        <p className="font-medium">{toast.title}</p>
        {toast.message && (
          <p className="mt-1 text-sm opacity-90">{toast.message}</p>
        )}
        {toast.action && (
          <button
            onClick={toast.action.onClick}
            className="mt-2 text-sm font-medium underline hover:no-underline"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
