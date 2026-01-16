import { useEffect, useState, useMemo } from "react";
import {
  Plus,
  Terminal,
  RefreshCw,
  Loader2,
  Search,
  X,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Download,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import { Snippet, CreateSnippetInput, UpdateSnippetInput } from "../../lib/tauri";
import { parseError } from "../../lib/errorHandler";
import { SnippetCard } from "./SnippetCard";
import { SnippetEditor } from "./SnippetEditor";
import { ImportExportDialog } from "./ImportExportDialog";
import { ConfirmDialog } from "../files/ConfirmDialog";

interface SnippetListProps {
  onInsertToTerminal?: (command: string) => void;
  onInsertToScript?: (command: string) => void;
}

/**
 * SnippetList component displays all snippets organized by category
 * Features: search, category grouping, CRUD operations
 * Requirements: 5.2, 5.3
 */
export function SnippetList({ onInsertToTerminal, onInsertToScript }: SnippetListProps) {
  const snippets = useAppStore((state) => state.snippets);
  const snippetCategories = useAppStore((state) => state.snippetCategories);
  const selectedSnippetId = useAppStore((state) => state.selectedSnippetId);
  const isLoadingSnippets = useAppStore((state) => state.isLoadingSnippets);
  const snippetError = useAppStore((state) => state.snippetError);

  const loadSnippets = useAppStore((state) => state.loadSnippets);
  const createSnippet = useAppStore((state) => state.createSnippet);
  const updateSnippet = useAppStore((state) => state.updateSnippet);
  const deleteSnippet = useAppStore((state) => state.deleteSnippet);
  const searchSnippets = useAppStore((state) => state.searchSnippets);
  const selectSnippet = useAppStore((state) => state.selectSnippet);
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Snippet[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Snippet | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);

  // Load snippets on mount
  useEffect(() => {
    loadSnippets();
  }, [loadSnippets]);

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

    // Sort categories alphabetically
    const sortedCategories = Object.keys(grouped).sort();
    const result: Record<string, Snippet[]> = {};
    for (const cat of sortedCategories) {
      result[cat] = grouped[cat].sort((a, b) => a.name.localeCompare(b.name));
    }
    
    return result;
  }, [snippets, searchResults]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setSearchQuery("");
    setSearchResults(null);
    await loadSnippets();
    setIsRefreshing(false);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setSearchResults(null);
  };

  const handleAddSnippet = () => {
    setEditingSnippet(null);
    setIsFormOpen(true);
  };

  const handleEditSnippet = (snippet: Snippet) => {
    setEditingSnippet(snippet);
    setIsFormOpen(true);
  };

  const handleDeleteSnippet = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteSnippet(deleteTarget.id);
      showSuccess("Snippet deleted", deleteTarget.name);
      setDeleteTarget(null);
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFormSubmit = async (input: CreateSnippetInput | UpdateSnippetInput) => {
    try {
      if (editingSnippet) {
        await updateSnippet(editingSnippet.id, input as UpdateSnippetInput);
      } else {
        await createSnippet(input as CreateSnippetInput);
      }
      setIsFormOpen(false);
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
      throw error;
    }
  };

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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleInsertToTerminal = (snippet: Snippet) => {
    if (onInsertToTerminal) {
      onInsertToTerminal(snippet.command);
      showSuccess("Inserted to terminal", snippet.name);
    }
  };

  const handleInsertToScript = (snippet: Snippet) => {
    if (onInsertToScript) {
      onInsertToScript(snippet.command);
      showSuccess("Inserted to script", snippet.name);
    }
  };

  const categories = Object.keys(snippetsByCategory);
  const totalSnippets = searchResults?.length ?? snippets.length;

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Snippets Library</h2>
        <div className="flex items-center gap-2">
          {/* Import/Export Button */}
          <button
            onClick={() => setIsImportExportOpen(true)}
            className="p-2 rounded-md border border-border hover:bg-accent"
            title="Import/Export"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-md border border-border hover:bg-accent disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          </button>

          {/* Add Snippet Button */}
          <button
            onClick={handleAddSnippet}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            New Snippet
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search snippets by name or command..."
          className="w-full pl-10 pr-10 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {searchQuery && (
          <button
            onClick={handleClearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-secondary"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Search Results Info */}
      {searchResults !== null && (
        <div className="mb-3 text-sm text-muted-foreground">
          {isSearching ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching...
            </span>
          ) : (
            <span>
              Found {searchResults.length} snippet{searchResults.length !== 1 ? "s" : ""} matching "{searchQuery}"
            </span>
          )}
        </div>
      )}

      {/* Error Message */}
      {snippetError && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {snippetError}
        </div>
      )}

      {/* Loading State */}
      {isLoadingSnippets && snippets.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!isLoadingSnippets && totalSnippets === 0 && !searchQuery && (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
            <Terminal className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No snippets yet</h3>
          <p className="text-muted-foreground mb-4">
            Create reusable command snippets for quick access
          </p>
          <button
            onClick={handleAddSnippet}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Create Snippet
          </button>
        </div>
      )}

      {/* No Search Results */}
      {searchResults !== null && searchResults.length === 0 && !isSearching && (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No results found</h3>
          <p className="text-muted-foreground mb-4">
            Try a different search term
          </p>
          <button
            onClick={handleClearSearch}
            className="text-primary hover:underline text-sm"
          >
            Clear search
          </button>
        </div>
      )}

      {/* Snippet List by Category */}
      {categories.length > 0 && (
        <div className="flex-1 overflow-auto space-y-4">
          {categories.map((category) => (
            <div key={category} className="border border-border rounded-lg overflow-hidden">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center gap-2 px-4 py-3 bg-secondary/50 hover:bg-secondary transition-colors"
              >
                {collapsedCategories.has(category) ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
                <FolderOpen className="w-4 h-4 text-primary" />
                <span className="font-medium">{category}</span>
                <span className="text-sm text-muted-foreground ml-auto">
                  {snippetsByCategory[category].length} snippet{snippetsByCategory[category].length !== 1 ? "s" : ""}
                </span>
              </button>

              {/* Category Snippets */}
              {!collapsedCategories.has(category) && (
                <div className="p-3 space-y-2">
                  {snippetsByCategory[category].map((snippet) => (
                    <SnippetCard
                      key={snippet.id}
                      snippet={snippet}
                      isSelected={selectedSnippetId === snippet.id}
                      onSelect={() => selectSnippet(snippet.id)}
                      onEdit={() => handleEditSnippet(snippet)}
                      onDelete={() => setDeleteTarget(snippet)}
                      onInsertToTerminal={onInsertToTerminal ? () => handleInsertToTerminal(snippet) : undefined}
                      onInsertToScript={onInsertToScript ? () => handleInsertToScript(snippet) : undefined}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Snippet Editor Dialog */}
      <SnippetEditor
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        snippet={editingSnippet}
        categories={snippetCategories}
        onSubmit={handleFormSubmit}
      />

      {/* Import/Export Dialog */}
      <ImportExportDialog
        open={isImportExportOpen}
        onOpenChange={setIsImportExportOpen}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Snippet"
        message="Are you sure you want to delete this snippet? This action cannot be undone."
        details={deleteTarget?.name}
        confirmText="Delete"
        isDestructive
        isLoading={isDeleting}
        onConfirm={handleDeleteSnippet}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
