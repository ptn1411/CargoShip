import { useState, useEffect } from "react";
import { X, Loader2, Terminal, Plus, Tag } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { Snippet, CreateSnippetInput, UpdateSnippetInput } from "../../lib/tauri";

interface SnippetEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snippet?: Snippet | null;
  categories: string[];
  onSubmit: (input: CreateSnippetInput | UpdateSnippetInput) => Promise<void>;
}

/**
 * SnippetEditor component for creating/editing snippets
 * Fields: name, description, command, category, tags
 * Requirements: 5.1
 */
export function SnippetEditor({
  open,
  onOpenChange,
  snippet,
  categories,
  onSubmit,
}: SnippetEditorProps) {
  const isEditing = !!snippet;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [command, setCommand] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens/closes or snippet changes
  useEffect(() => {
    if (open) {
      if (snippet) {
        setName(snippet.name);
        setDescription(snippet.description || "");
        setCommand(snippet.command);
        setCategory(snippet.category);
        setTags([...snippet.tags]);
        setIsNewCategory(false);
        setNewCategory("");
      } else {
        setName("");
        setDescription("");
        setCommand("");
        setCategory(categories[0] || "");
        setTags([]);
        setIsNewCategory(categories.length === 0);
        setNewCategory("");
      }
      setTagInput("");
      setError(null);
    }
  }, [open, snippet, categories]);

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Validation
      if (!name.trim()) {
        throw new Error("Snippet name is required");
      }
      if (!command.trim()) {
        throw new Error("Command is required");
      }

      const finalCategory = isNewCategory ? newCategory.trim() : category;
      if (!finalCategory) {
        throw new Error("Category is required");
      }

      if (isEditing) {
        const input: UpdateSnippetInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          command: command.trim(),
          category: finalCategory,
          tags,
        };
        await onSubmit(input);
      } else {
        const input: CreateSnippetInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          command: command.trim(),
          category: finalCategory,
          tags,
        };
        await onSubmit(input);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-background border border-border rounded-lg shadow-lg z-50 p-6 max-h-[85vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
              <Terminal className="w-5 h-5" />
              {isEditing ? "Edit Snippet" : "Create Snippet"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-secondary">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="space-y-4 overflow-auto flex-1 pr-1">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="e.g., Check disk usage"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  placeholder="Optional description for this snippet"
                  rows={2}
                />
              </div>

              {/* Command */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Command <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  placeholder="e.g., df -h | grep -E '^/dev'"
                  rows={3}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  The command to execute. Supports multi-line commands.
                </p>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Category <span className="text-destructive">*</span>
                </label>
                {categories.length > 0 && !isNewCategory ? (
                  <div className="space-y-2">
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setIsNewCategory(true)}
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Create new category
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="e.g., System, Network, Database"
                    />
                    {categories.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsNewCategory(false);
                          setNewCategory("");
                        }}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        Use existing category
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium mb-1">Tags</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Add tag and press Enter"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    disabled={!tagInput.trim()}
                    className="px-3 py-2 rounded-md border border-input hover:bg-accent disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <Tag className="w-3 h-3 text-muted-foreground" />
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-secondary"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-destructive"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-border">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 rounded-md border border-input text-sm hover:bg-accent"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {isEditing ? "Save Changes" : "Create Snippet"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
