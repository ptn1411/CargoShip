import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Favorites Types
// ============================================================================

export type FavoriteType = "server" | "script" | "snippet";

export interface Favorite {
  id: string;
  item_type: FavoriteType;
  item_id: string;
  created_at: string;
}

// ============================================================================
// Activity Log Types
// ============================================================================

export interface ActivityLog {
  id: string;
  action: string;
  item_type: string | null;
  item_id: string | null;
  details: string | null;
  created_at: string;
}

// ============================================================================
// Favorites API
// ============================================================================

export const favoritesApi = {
  add: (itemType: FavoriteType, itemId: string) =>
    invoke<void>("add_favorite", { itemType, itemId }),
  remove: (itemType: FavoriteType, itemId: string) =>
    invoke<void>("remove_favorite", { itemType, itemId }),
  list: () =>
    invoke<Favorite[]>("list_favorites"),
  isFavorite: (itemType: FavoriteType, itemId: string) =>
    invoke<boolean>("is_favorite", { itemType, itemId }),
};

// ============================================================================
// Activity Log API
// ============================================================================

export const activityApi = {
  getRecent: (limit: number) =>
    invoke<ActivityLog[]>("get_recent_activity", { limit }),
  log: (action: string, itemType?: string, itemId?: string, details?: string) =>
    invoke<void>("log_activity", { action, itemType, itemId, details }),
};
