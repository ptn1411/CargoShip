import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

const sizeClasses = {
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
};

export function LoadingSpinner({ size = "md", className, label }: LoadingSpinnerProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Loader2 className={cn("animate-spin text-muted-foreground", sizeClasses[size])} />
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </div>
  );
}

interface LoadingOverlayProps {
  isLoading: boolean;
  label?: string;
  children: React.ReactNode;
}

export function LoadingOverlay({ isLoading, label, children }: LoadingOverlayProps) {
  return (
    <div className="relative">
      {children}
      {isLoading && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
          <LoadingSpinner size="lg" label={label} />
        </div>
      )}
    </div>
  );
}

interface LoadingPlaceholderProps {
  label?: string;
  className?: string;
}

export function LoadingPlaceholder({ label = "Loading...", className }: LoadingPlaceholderProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12", className)}>
      <LoadingSpinner size="lg" />
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
