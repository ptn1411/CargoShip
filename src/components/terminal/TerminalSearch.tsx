import { useState, useCallback, useEffect, useRef } from "react";
import { Search, X, ChevronUp, ChevronDown, CaseSensitive, Regex } from "lucide-react";
import { cn } from "../../lib/utils";

interface TerminalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (term: string, options: SearchOptions) => void;
  onFindNext: () => void;
  onFindPrevious: () => void;
  matchCount?: number;
  currentMatch?: number;
}

export interface SearchOptions {
  caseSensitive: boolean;
  regex: boolean;
  wholeWord: boolean;
}

export function TerminalSearch({
  isOpen,
  onClose,
  onSearch,
  onFindNext,
  onFindPrevious,
  matchCount = 0,
  currentMatch = 0,
}: TerminalSearchProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [options, setOptions] = useState<SearchOptions>({
    caseSensitive: false,
    regex: false,
    wholeWord: false,
  });
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  // Trigger search when term or options change
  useEffect(() => {
    if (isOpen) {
      onSearch(searchTerm, options);
    }
  }, [searchTerm, options, isOpen, onSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter") {
        if (e.shiftKey) {
          onFindPrevious();
        } else {
          onFindNext();
        }
      }
    },
    [onClose, onFindNext, onFindPrevious]
  );

  const toggleOption = (key: keyof SearchOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 right-0 z-50 flex items-center gap-1 p-1 bg-secondary border border-border rounded-bl-md shadow-lg">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search..."
          className="w-48 pl-7 pr-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Match Count */}
      {searchTerm && (
        <span className="text-xs text-muted-foreground min-w-[60px] text-center">
          {matchCount > 0 ? `${currentMatch}/${matchCount}` : "No results"}
        </span>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={onFindPrevious}
          disabled={matchCount === 0}
          className="p-1 hover:bg-accent rounded disabled:opacity-50 disabled:cursor-not-allowed"
          title="Previous match (Shift+Enter)"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={onFindNext}
          disabled={matchCount === 0}
          className="p-1 hover:bg-accent rounded disabled:opacity-50 disabled:cursor-not-allowed"
          title="Next match (Enter)"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Search Options */}
      <div className="flex items-center gap-0.5 border-l border-border pl-1 ml-1">
        <button
          onClick={() => toggleOption("caseSensitive")}
          className={cn(
            "p-1 rounded transition-colors",
            options.caseSensitive
              ? "bg-primary text-primary-foreground"
              : "hover:bg-accent"
          )}
          title="Match case"
        >
          <CaseSensitive className="w-4 h-4" />
        </button>
        <button
          onClick={() => toggleOption("regex")}
          className={cn(
            "p-1 rounded transition-colors",
            options.regex
              ? "bg-primary text-primary-foreground"
              : "hover:bg-accent"
          )}
          title="Use regular expression"
        >
          <Regex className="w-4 h-4" />
        </button>
      </div>

      {/* Close Button */}
      <button
        onClick={onClose}
        className="p-1 hover:bg-accent rounded ml-1"
        title="Close (Escape)"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
