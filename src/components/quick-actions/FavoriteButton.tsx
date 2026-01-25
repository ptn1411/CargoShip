import { useState } from "react";
import { Star, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import { FavoriteType } from "../../lib/tauri";

interface FavoriteButtonProps {
  itemType: FavoriteType;
  itemId: string;
  className?: string;
  size?: "sm" | "md";
}

/**
 * FavoriteButton component for starring/unstarring items
 * Requirements: 7.2
 */
export function FavoriteButton({
  itemType,
  itemId,
  className,
  size = "md",
}: FavoriteButtonProps) {
  const isFavorite = useAppStore((state) => state.isFavorite);
  const addFavorite = useAppStore((state) => state.addFavorite);
  const removeFavorite = useAppStore((state) => state.removeFavorite);

  const [isLoading, setIsLoading] = useState(false);
  const isFav = isFavorite(itemType, itemId);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    try {
      if (isFav) {
        await removeFavorite(itemType, itemId);
      } else {
        await addFavorite(itemType, itemId);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={cn(
        "p-1.5 rounded-md transition-colors",
        isFav
          ? "text-yellow-500 hover:text-yellow-600"
          : "text-muted-foreground hover:text-yellow-500",
        isLoading && "opacity-50 cursor-not-allowed",
        className
      )}
      title={isFav ? "Remove from favorites" : "Add to favorites"}
    >
      {isLoading ? (
        <Loader2 className={cn(iconSize, "animate-spin")} />
      ) : (
        <Star className={cn(iconSize, isFav && "fill-current")} />
      )}
    </button>
  );
}
