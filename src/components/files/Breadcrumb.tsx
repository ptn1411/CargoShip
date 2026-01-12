import { ChevronRight, Home } from "lucide-react";
import { Breadcrumb as BreadcrumbType } from "../../lib/tauri";

interface BreadcrumbProps {
  breadcrumbs: BreadcrumbType[];
  onNavigate: (path: string) => void;
}

export function Breadcrumb({ breadcrumbs, onNavigate }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-sm overflow-x-auto">
      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;
        const isRoot = crumb.path === "/";

        return (
          <div key={crumb.path} className="flex items-center gap-1 shrink-0">
            {index > 0 && (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <button
              onClick={() => onNavigate(crumb.path)}
              disabled={isLast}
              className={`px-2 py-1 rounded hover:bg-accent transition-colors ${
                isLast
                  ? "text-foreground font-medium cursor-default"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isRoot ? (
                <Home className="w-4 h-4" />
              ) : (
                <span className="truncate max-w-[150px]">{crumb.name}</span>
              )}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
