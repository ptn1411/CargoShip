import { useState, useEffect } from "react";
import { Download, Trash2, RefreshCw, Search } from "lucide-react";
import { dockerApi, DockerImage, PullImageInput } from "../../lib/tauri";
import { useAppStore } from "../../store";
import { LoadingSpinner } from "../ui";

interface ImageListProps {
  serverId: string;
  onRefresh?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function ImageList({ serverId, onRefresh }: ImageListProps) {
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [pullImage, setPullImage] = useState("");
  const [isPulling, setIsPulling] = useState(false);

  const loadImages = async () => {
    setIsLoading(true);
    try {
      const list = await dockerApi.listImages(serverId);
      setImages(list);
    } catch (err) {
      showError("Failed to load images", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadImages();
  }, [serverId]);

  const handlePull = async () => {
    if (!pullImage.trim()) return;
    setIsPulling(true);
    try {
      const [image, tag] = pullImage.split(":");
      const input: PullImageInput = { image, tag: tag || undefined };
      await dockerApi.pullImage(serverId, input);
      showSuccess("Image pulled", `Successfully pulled ${pullImage}`);
      setPullImage("");
      loadImages();
      onRefresh?.();
    } catch (err) {
      showError("Failed to pull image", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsPulling(false);
    }
  };

  const handleRemove = async (imageId: string) => {
    try {
      await dockerApi.removeImage(serverId, imageId, false);
      showSuccess("Image removed");
      loadImages();
      onRefresh?.();
    } catch (err) {
      showError("Failed to remove image", err instanceof Error ? err.message : "Unknown error");
    }
  };

  const filteredImages = images.filter((img) =>
    img.repository.toLowerCase().includes(searchQuery.toLowerCase()) ||
    img.tag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-4">
      {/* Pull Image */}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={pullImage}
          onChange={(e) => setPullImage(e.target.value)}
          placeholder="Pull image (e.g., nginx:latest)"
          className="flex-1 px-3 py-2 bg-secondary border border-border rounded-lg text-sm"
          onKeyDown={(e) => e.key === "Enter" && handlePull()}
        />
        <button
          onClick={handlePull}
          disabled={isPulling || !pullImage.trim()}
          className="flex items-center gap-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {isPulling ? "Pulling..." : "Pull"}
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center justify-between mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search images..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm w-64"
          />
        </div>
        <button onClick={loadImages} className="p-2 hover:bg-accent rounded-lg">
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Image List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : filteredImages.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {searchQuery ? "No images match your search" : "No images found"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 font-medium">Repository</th>
                <th className="text-left py-2 px-3 font-medium">Tag</th>
                <th className="text-left py-2 px-3 font-medium">ID</th>
                <th className="text-right py-2 px-3 font-medium">Size</th>
                <th className="text-right py-2 px-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredImages.map((image) => (
                <tr key={image.id} className="border-b border-border hover:bg-accent/50">
                  <td className="py-2 px-3 font-mono">{image.repository}</td>
                  <td className="py-2 px-3">
                    <span className="px-2 py-0.5 bg-accent rounded text-xs">{image.tag}</span>
                  </td>
                  <td className="py-2 px-3 font-mono text-muted-foreground">{image.id.substring(0, 12)}</td>
                  <td className="py-2 px-3 text-right">{formatBytes(image.size)}</td>
                  <td className="py-2 px-3 text-right">
                    <button
                      onClick={() => handleRemove(image.id)}
                      className="p-1 text-destructive hover:bg-destructive/10 rounded"
                      title="Remove image"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
