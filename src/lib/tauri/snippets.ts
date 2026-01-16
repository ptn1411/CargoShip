import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Snippets Types
// ============================================================================

export interface Snippet {
  id: string;
  name: string;
  description: string | null;
  command: string;
  category: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateSnippetInput {
  name: string;
  description?: string;
  command: string;
  category: string;
  tags?: string[];
}

export interface UpdateSnippetInput {
  name?: string;
  description?: string;
  command?: string;
  category?: string;
  tags?: string[];
}

export interface SnippetImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

// ============================================================================
// Snippets API
// ============================================================================

export const snippetApi = {
  create: (input: CreateSnippetInput) => invoke<Snippet>("create_snippet", { input }),
  list: () => invoke<Snippet[]>("list_snippets"),
  get: (id: string) => invoke<Snippet>("get_snippet", { id }),
  listByCategory: (category: string) => invoke<Snippet[]>("list_snippets_by_category", { category }),
  search: (query: string) => invoke<Snippet[]>("search_snippets", { query }),
  update: (id: string, input: UpdateSnippetInput) => invoke<Snippet>("update_snippet", { id, input }),
  delete: (id: string) => invoke<void>("delete_snippet", { id }),
  export: () => invoke<string>("export_snippets"),
  import: (json: string) => invoke<SnippetImportResult>("import_snippets", { json }),
};
