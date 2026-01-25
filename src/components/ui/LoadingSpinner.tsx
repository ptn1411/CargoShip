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

export function LoadingSpinner({
  size = "md",
  className,
  label,
}: LoadingSpinnerProps) {
  return (
    <div
      className={cn("flex items-center gap-2", className)}
      role="status"
      aria-live="polite">
      <Loader2
        className={cn("animate-spin text-primary", sizeClasses[size])}
        aria-hidden="true"
      />
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
      {!label && <span className="sr-only">Loading...</span>}
    </div>
  );
}

interface LoadingOverlayProps {
  isLoading: boolean;
  label?: string;
  children: React.ReactNode;
}

export function LoadingOverlay({
  isLoading,
  label,
  children,
}: LoadingOverlayProps) {
  return (
    <div className="relative">
      {children}
      {isLoading && (
        <div
          className={cn(
            "absolute inset-0 z-10",
            "bg-background/80 backdrop-blur-sm",
            "flex items-center justify-center",
            "animate-fade-in"
          )}
          role="alert"
          aria-busy="true">
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

export function LoadingPlaceholder({
  label = "Loading...",
  className,
}: LoadingPlaceholderProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12",
        "animate-fade-in",
        className
      )}
      role="status"
      aria-live="polite">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl" />
        <LoadingSpinner size="lg" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

// Skeleton component for loading states
interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn("rounded-md bg-muted animate-pulse", className)}
      aria-hidden="true"
    />
  );
}

// Skeleton variants for common patterns
export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "p-4 rounded-xl border border-border bg-card animate-pulse",
        className
      )}
      aria-hidden="true">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-3 bg-muted rounded w-1/2" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-2 bg-muted rounded" />
        <div className="h-2 bg-muted rounded w-5/6" />
        <div className="h-2 bg-muted rounded w-4/6" />
      </div>
    </div>
  );
}

export function SkeletonMetric({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl border border-border bg-card animate-pulse",
        className
      )}
      aria-hidden="true">
      <div className="w-12 h-12 rounded-lg bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-6 bg-muted rounded w-16" />
        <div className="h-3 bg-muted rounded w-24" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, className }: SkeletonProps & { rows?: number }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden animate-pulse", className)} aria-hidden="true">
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="flex gap-4">
          <div className="h-4 bg-muted rounded w-1/4" />
          <div className="h-4 bg-muted rounded w-1/4" />
          <div className="h-4 bg-muted rounded w-1/4" />
          <div className="h-4 bg-muted rounded w-1/4" />
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 border-b border-border last:border-b-0">
          <div className="flex gap-4">
            <div className="h-4 bg-muted rounded w-1/4" />
            <div className="h-4 bg-muted rounded w-1/4" />
            <div className="h-4 bg-muted rounded w-1/4" />
            <div className="h-4 bg-muted rounded w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ items = 3, className }: SkeletonProps & { items?: number }) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden="true">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card animate-pulse">
          <div className="w-8 h-8 rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
