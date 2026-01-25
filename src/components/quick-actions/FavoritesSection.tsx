import { useEffect } from "react";
import {
  Star,
  Server,
  FileCode,
  Code2,
  ChevronRight,
  Loader2,
  StarOff,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import { Favorite, FavoriteType } from "../../lib/tauri";

interface FavoriteItemProps {
  type: FavoriteType;
  name: string;
  description?: string;
  isFavorite: boolean;
  onClick: () => void;
  onToggleFavorite: () => void;
}

function FavoriteItem({
  type,
  name,
  description,
  isFavorite,
  onClick,
  onToggleFavorite,
}: FavoriteItemProps) {
  const getIcon = () => {
    switch (type) {
      case "server":
        return <Server className="w-4 h-4" />;
      case "script":
        return <FileCode className="w-4 h-4" />;
      case "snippet":
        return <Code2 className="w-4 h-4" />;
      default:
        return <Star className="w-4 h-4" />;
    }
  };

  const getTypeColor = () => {
    switch (type) {
      case "server":
        return "text-blue-500";
      case "script":
        return "text-green-500";
      case "snippet":
        return "text-purple-500";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border border-border",
        "hover:border-primary/50 hover:bg-accent/50 transition-all cursor-pointer group"
      )}
      onClick={onClick}
    >
      <div className={cn("p-2 rounded-lg bg-secondary", getTypeColor())}>
        {getIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{name}</p>
        {description && (
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className={cn(
          "p-1.5 rounded-md transition-colors",
          isFavorite
            ? "text-yellow-500 hover:text-yellow-600"
            : "text-muted-foreground hover:text-yellow-500 opacity-0 group-hover:opacity-100"
        )}
        title={isFavorite ? "Remove from favorites" : "Add to favorites"}
      >
        {isFavorite ? (
          <Star className="w-4 h-4 fill-current" />
        ) : (
          <Star className="w-4 h-4" />
        )}
      </button>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </div>
  );
}

interface FavoritesSectionProps {
  onServerClick?: (serverId: string) => void;
  onScriptClick?: (scriptId: string) => void;
  onSnippetClick?: (snippetId: string) => void;
  maxItems?: number;
}

/**
 * FavoritesSection component displays starred servers/scripts in quick access
 * Requirements: 7.2
 */
export function FavoritesSection({
  onServerClick,
  onScriptClick,
  onSnippetClick,
  maxItems = 6,
}: FavoritesSectionProps) {
  const favorites = useAppStore((state) => state.favorites);
  const servers = useAppStore((state) => state.servers);
  const scripts = useAppStore((state) => state.scripts);
  const snippets = useAppStore((state) => state.snippets);
  const isLoadingFavorites = useAppStore((state) => state.isLoadingFavorites);

  const loadFavorites = useAppStore((state) => state.loadFavorites);
  const loadServers = useAppStore((state) => state.loadServers);
  const loadScripts = useAppStore((state) => state.loadScripts);
  const loadSnippets = useAppStore((state) => state.loadSnippets);
  const removeFavorite = useAppStore((state) => state.removeFavorite);
  const setSidebarItem = useAppStore((state) => state.setSidebarItem);
  const selectServer = useAppStore((state) => state.selectServer);
  const selectScript = useAppStore((state) => state.selectScript);
  const selectSnippet = useAppStore((state) => state.selectSnippet);

  useEffect(() => {
    loadFavorites();
    loadServers();
    loadScripts();
    loadSnippets();
  }, [loadFavorites, loadServers, loadScripts, loadSnippets]);

  const getFavoriteDetails = (favorite: Favorite) => {
    switch (favorite.item_type) {
      case "server": {
        const server = servers.find((s) => s.id === favorite.item_id);
        return server
          ? { name: server.name, description: `${server.host}:${server.port}` }
          : null;
      }
      case "script": {
        const script = scripts.find((s) => s.id === favorite.item_id);
        return script
          ? { name: script.name, description: script.description || `${script.steps.length} steps` }
          : null;
      }
      case "snippet": {
        const snippet = snippets.find((s) => s.id === favorite.item_id);
        return snippet
          ? { name: snippet.name, description: snippet.category }
          : null;
      }
      default:
        return null;
    }
  };

  const handleFavoriteClick = (favorite: Favorite) => {
    switch (favorite.item_type) {
      case "server":
        if (onServerClick) {
          onServerClick(favorite.item_id);
        } else {
          selectServer(favorite.item_id);
          setSidebarItem("servers");
        }
        break;
      case "script":
        if (onScriptClick) {
          onScriptClick(favorite.item_id);
        } else {
          selectScript(favorite.item_id);
          setSidebarItem("scripts");
        }
        break;
      case "snippet":
        if (onSnippetClick) {
          onSnippetClick(favorite.item_id);
        } else {
          selectSnippet(favorite.item_id);
        }
        break;
    }
  };

  const handleToggleFavorite = async (favorite: Favorite) => {
    await removeFavorite(favorite.item_type, favorite.item_id);
  };

  // Filter out favorites where the item no longer exists
  const validFavorites = favorites
    .filter((f) => getFavoriteDetails(f) !== null)
    .slice(0, maxItems);

  if (isLoadingFavorites) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-500" />
          <h3 className="font-medium">Favorites</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Star className="w-5 h-5 text-yellow-500" />
        <h3 className="font-medium">Favorites</h3>
        {validFavorites.length > 0 && (
          <span className="text-xs text-muted-foreground">
            ({validFavorites.length})
          </span>
        )}
      </div>

      {validFavorites.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed border-border rounded-lg">
          <StarOff className="w-8 h-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No favorites yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Star servers or scripts for quick access
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {validFavorites.map((favorite) => {
            const details = getFavoriteDetails(favorite);
            if (!details) return null;

            return (
              <FavoriteItem
                key={`${favorite.item_type}-${favorite.item_id}`}
                type={favorite.item_type}
                name={details.name}
                description={details.description}
                isFavorite={true}
                onClick={() => handleFavoriteClick(favorite)}
                onToggleFavorite={() => handleToggleFavorite(favorite)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
