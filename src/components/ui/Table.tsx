import { ReactNode, forwardRef } from "react";
import { cn } from "../../lib/utils";

/**
 * Table - Full-featured data table component
 */
export interface TableProps {
  children: ReactNode;
  className?: string;
}

export function Table({ children, className }: TableProps) {
  return (
    <div className={cn("relative w-full overflow-auto", className)}>
      <table className="w-full caption-bottom text-sm">{children}</table>
    </div>
  );
}

/**
 * TableHeader - Table header container
 */
export interface TableHeaderProps {
  children: ReactNode;
  className?: string;
}

export function TableHeader({ children, className }: TableHeaderProps) {
  return (
    <thead className={cn("border-b border-border", className)}>
      {children}
    </thead>
  );
}

/**
 * TableBody - Table body container
 */
export interface TableBodyProps {
  children: ReactNode;
  className?: string;
}

export function TableBody({ children, className }: TableBodyProps) {
  return (
    <tbody className={cn("[&_tr:last-child]:border-0", className)}>
      {children}
    </tbody>
  );
}

/**
 * TableFooter - Table footer container
 */
export interface TableFooterProps {
  children: ReactNode;
  className?: string;
}

export function TableFooter({ children, className }: TableFooterProps) {
  return (
    <tfoot
      className={cn(
        "border-t border-border bg-muted/50 font-medium",
        className
      )}>
      {children}
    </tfoot>
  );
}

/**
 * TableRow - Table row
 */
export interface TableRowProps {
  children: ReactNode;
  /** Enable hover effect */
  interactive?: boolean;
  /** Selected state */
  selected?: boolean;
  /** Click handler */
  onClick?: () => void;
  className?: string;
}

export const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
  (
    { children, interactive = false, selected = false, onClick, className },
    ref
  ) => {
    return (
      <tr
        ref={ref}
        onClick={onClick}
        className={cn(
          "border-b border-border transition-colors",
          interactive && [
            "cursor-pointer",
            "hover:bg-accent/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
          ],
          selected && "bg-accent",
          className
        )}
        tabIndex={interactive ? 0 : undefined}
        role={interactive ? "button" : undefined}>
        {children}
      </tr>
    );
  }
);

TableRow.displayName = "TableRow";

/**
 * TableHead - Table header cell
 */
export interface TableHeadProps {
  children?: ReactNode;
  /** Sortable column */
  sortable?: boolean;
  /** Current sort direction */
  sortDirection?: "asc" | "desc" | null;
  /** Sort handler */
  onSort?: () => void;
  /** Text alignment */
  align?: "left" | "center" | "right";
  className?: string;
}

export function TableHead({
  children,
  sortable = false,
  sortDirection,
  onSort,
  align = "left",
  className,
}: TableHeadProps) {
  const alignStyles = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  };

  if (sortable) {
    return (
      <th
        className={cn(
          "h-11 px-4 font-medium text-muted-foreground",
          alignStyles[align],
          className
        )}>
        <button
          type="button"
          onClick={onSort}
          className={cn(
            "inline-flex items-center gap-1 cursor-pointer",
            "hover:text-foreground transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          )}>
          {children}
          <span className="w-4 h-4" aria-hidden="true">
            {sortDirection === "asc" && (
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}>
                <path d="M8 14l4-4 4 4" />
              </svg>
            )}
            {sortDirection === "desc" && (
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}>
                <path d="M16 10l-4 4-4-4" />
              </svg>
            )}
            {!sortDirection && (
              <svg
                className="w-4 h-4 opacity-30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}>
                <path d="M8 10l4-4 4 4M8 14l4 4 4-4" />
              </svg>
            )}
          </span>
        </button>
      </th>
    );
  }

  return (
    <th
      className={cn(
        "h-11 px-4 font-medium text-muted-foreground",
        alignStyles[align],
        className
      )}>
      {children}
    </th>
  );
}

/**
 * TableCell - Table data cell
 */
export interface TableCellProps {
  children?: ReactNode;
  /** Text alignment */
  align?: "left" | "center" | "right";
  /** Monospace font (for code/data) */
  mono?: boolean;
  className?: string;
}

export function TableCell({
  children,
  align = "left",
  mono = false,
  className,
}: TableCellProps) {
  const alignStyles = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  };

  return (
    <td
      className={cn(
        "p-4 align-middle",
        alignStyles[align],
        mono && "font-mono text-sm",
        className
      )}>
      {children}
    </td>
  );
}

/**
 * TableCaption - Table caption
 */
export interface TableCaptionProps {
  children: ReactNode;
  className?: string;
}

export function TableCaption({ children, className }: TableCaptionProps) {
  return (
    <caption className={cn("mt-4 text-sm text-muted-foreground", className)}>
      {children}
    </caption>
  );
}

/**
 * TableEmpty - Empty state row
 */
export interface TableEmptyProps {
  colSpan: number;
  icon?: ReactNode;
  message?: string;
  className?: string;
}

export function TableEmpty({
  colSpan,
  icon,
  message = "No data available",
  className,
}: TableEmptyProps) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div
          className={cn(
            "flex flex-col items-center justify-center py-12 text-center",
            className
          )}>
          {icon && (
            <div
              className="p-3 rounded-full bg-muted text-muted-foreground mb-3"
              aria-hidden="true">
              {icon}
            </div>
          )}
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </td>
    </tr>
  );
}

/**
 * TableLoading - Loading state row
 */
export interface TableLoadingProps {
  colSpan: number;
  rows?: number;
  className?: string;
}

export function TableLoading({
  colSpan,
  rows = 5,
  className,
}: TableLoadingProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className={className}>
          <td colSpan={colSpan} className="p-4">
            <div className="flex items-center gap-4">
              <div className="h-4 w-32 rounded bg-muted animate-pulse" />
              <div className="h-4 flex-1 rounded bg-muted animate-pulse" />
              <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}
