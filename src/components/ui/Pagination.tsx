import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * Pagination component for data tables and lists
 */
export interface PaginationProps {
  /** Current page (1-indexed) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Page change handler */
  onPageChange: (page: number) => void;
  /** Number of sibling pages to show */
  siblingCount?: number;
  /** Show first/last page buttons */
  showEdges?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeStyles = {
  sm: "h-8 min-w-8 text-xs",
  md: "h-9 min-w-9 text-sm",
  lg: "h-10 min-w-10 text-sm",
};

const iconSizeStyles = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1,
  showEdges = true,
  size = "md",
  className,
}: PaginationProps) {
  const pages = generatePagination(
    currentPage,
    totalPages,
    siblingCount,
    showEdges
  );

  if (totalPages <= 1) return null;

  return (
    <nav
      role="navigation"
      aria-label="Pagination"
      className={cn("flex items-center gap-1", className)}>
      <PaginationButton
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        size={size}
        aria-label="Go to previous page">
        <ChevronLeft className={iconSizeStyles[size]} />
      </PaginationButton>

      {pages.map((page, index) => {
        if (page === "ellipsis") {
          return (
            <span
              key={`ellipsis-${index}`}
              className={cn(
                "flex items-center justify-center",
                "text-muted-foreground",
                sizeStyles[size]
              )}
              aria-hidden="true">
              <MoreHorizontal className={iconSizeStyles[size]} />
            </span>
          );
        }

        const pageNumber = page as number;
        const isActive = pageNumber === currentPage;

        return (
          <PaginationButton
            key={pageNumber}
            onClick={() => onPageChange(pageNumber)}
            active={isActive}
            size={size}
            aria-label={`Go to page ${pageNumber}`}
            aria-current={isActive ? "page" : undefined}>
            {pageNumber}
          </PaginationButton>
        );
      })}

      <PaginationButton
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        size={size}
        aria-label="Go to next page">
        <ChevronRight className={iconSizeStyles[size]} />
      </PaginationButton>
    </nav>
  );
}

/**
 * Individual pagination button
 */
interface PaginationButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  "aria-label"?: string;
  "aria-current"?: "page" | undefined;
}

function PaginationButton({
  children,
  onClick,
  disabled = false,
  active = false,
  size = "md",
  className,
  ...props
}: PaginationButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium",
        "transition-colors duration-200 cursor-pointer",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        sizeStyles[size],
        active
          ? "bg-primary text-primary-foreground"
          : "text-foreground hover:bg-accent",
        disabled && "opacity-50 cursor-not-allowed pointer-events-none",
        className
      )}
      {...props}>
      {children}
    </button>
  );
}

/**
 * Generate pagination array with ellipsis
 */
function generatePagination(
  current: number,
  total: number,
  siblings: number,
  showEdges: boolean
): (number | "ellipsis")[] {
  const pages: (number | "ellipsis")[] = [];

  // Always show first page if showEdges
  if (showEdges) {
    pages.push(1);
  }

  // Calculate range around current page
  const leftSibling = Math.max(current - siblings, showEdges ? 2 : 1);
  const rightSibling = Math.min(
    current + siblings,
    showEdges ? total - 1 : total
  );

  // Add ellipsis after first page if needed
  if (showEdges && leftSibling > 2) {
    pages.push("ellipsis");
  }

  // Add pages in range
  for (let i = leftSibling; i <= rightSibling; i++) {
    if (!pages.includes(i)) {
      pages.push(i);
    }
  }

  // Add ellipsis before last page if needed
  if (showEdges && rightSibling < total - 1) {
    pages.push("ellipsis");
  }

  // Always show last page if showEdges
  if (showEdges && total > 1 && !pages.includes(total)) {
    pages.push(total);
  }

  return pages;
}

/**
 * PaginationInfo - Display current range info
 */
export interface PaginationInfoProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  className?: string;
}

export function PaginationInfo({
  currentPage,
  pageSize,
  totalItems,
  className,
}: PaginationInfoProps) {
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      Showing <span className="font-medium text-foreground">{start}</span> to{" "}
      <span className="font-medium text-foreground">{end}</span> of{" "}
      <span className="font-medium text-foreground">{totalItems}</span> results
    </p>
  );
}

/**
 * PageSizeSelector - Dropdown to select items per page
 */
export interface PageSizeSelectorProps {
  value: number;
  onChange: (size: number) => void;
  options?: number[];
  className?: string;
}

export function PageSizeSelector({
  value,
  onChange,
  options = [10, 25, 50, 100],
  className,
}: PageSizeSelectorProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label className="text-sm text-muted-foreground">Show</label>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          "h-9 px-2 rounded-md text-sm cursor-pointer",
          "bg-secondary border border-border",
          "focus:outline-none focus:ring-2 focus:ring-primary",
          "transition-colors duration-200"
        )}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span className="text-sm text-muted-foreground">per page</span>
    </div>
  );
}
