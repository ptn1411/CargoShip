import { useState, useEffect, useMemo } from "react";
import { Search, X, Terminal, FolderOpen, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAppStore } from "../../store";
import { Snippet } from "../../lib/tauri";

interface SnippetPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (command: string) => void;
  title?: string;
}

/**
 * SnippetPicker component for selecting a snippet to insert
 * Used by terminal and script editor for snippet insertion
 * Requirements: 5.4, 5.5
 */
export function SnippetPicker({
  open,
  onOpenChange,
  onSelect,
  title = "Insert Snippet",
}: SnippetPickerProps) {
  const snippets = useAppStore((state) => state.snippets);
  const isLoadingSnippets = useAppStore((state) => state.isLoadingSnippets);
  const loadSnippets = useAppStore((state) => state.loadSnippets);
  const searchSnippets = useAppStore((state) => state.searchSnippets);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Snippet[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Load snippets when dialog opens
  useEffect(() => {
    if (open && snippets.length === 0) {
      loadSnippets();
    }
  }, [open, snippets.length, loadSnippets]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSearchResults(null);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchSnippets(searchQuery);
        setSearchResults(results);
      } catch (error) {
        console.error("Search failed:", error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchSnippets]);

  // Group snippets by category
  const snippetsByCategory = useMemo(() => {
    const displaySnippets = searchResults ?? snippets;
    const grouped: Record<string, Snippet[]> = {};
    
    for (const snippet of displaySnippets) {
      if (!grouped[snippet.category]) {
        grouped[snippet.category] = [];
      }
      grouped[snippet.category].push(snippet);
    }

    const sortedCategories = Object.keys(grouped).sort();
    const result: Record<string, Snippet[]> = {};
    for (const cat of sortedCategories) {
      result[cat] = grouped[cat].sort((a, b) => a.name.localeCompare(b.name));
    }
    
    return result;
  }, [snippets, searchResults]);

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleSelect = (snippet: Snippet) => {
    onSelect(snippet.command);
    onOpenChange(false);
  };

  const categories = Object.keys(snippetsByCategory);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-background border border-border rounded-lg shadow-lg z-50 p-4 max-h-[70vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
              <Terminal className="w-5 h-5" />
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-secondary">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Search Bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search snippets..."
              className="w-full pl-10 pr-10 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults(null);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-secondary"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Loading State */}
          {isLoadingSnippets && snippets.length === 0 && (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Empty State */}
          {!isLoadingSnippets && snippets.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
              <Terminal className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No snippets available</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create snippets in the Snippets Library
              </p>
            </div>
          )}

          {/* No Search Results */}
          {searchResults !== null && searchResults.length === 0 && !isSearching && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
              <Search className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No results found</p>
            </div>
          )}

          {/* Snippet List */}
          {categories.length > 0 && (
            <div className="flex-1 overflow-auto space-y-2">
              {categories.map((category) => (
                <div key={category} className="border border-border rounded-md overflow-hidden">
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary transition-colors text-sm"
                  >
                    {collapsedCategories.has(category) ? (
                      <ChevronRight className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                    <FolderOpen className="w-4 h-4 text-primary" />
                    <span className="font-medium">{category}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {snippetsByCategory[category].length}
                    </span>
                  </button>

                  {/* Category Snippets */}
                  {!collapsedCategories.has(category) && (
                    <div className="divide-y divide-border">
                      {snippetsByCategory[category].map((snippet) => (
                        <button
                          key={snippet.id}
                          onClick={() => handleSelect(snippet)}
                          className="w-full text-left px-3 py-2 hover:bg-accent transition-colors"
                        >
                          <div className="font-medium text-sm truncate">{snippet.name}</div>
                          <div className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                            {snippet.command}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
