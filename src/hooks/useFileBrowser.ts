import { useCallback } from "react";
import {
  useAppStore,
  useFileEntries,
  useBreadcrumbs,
  useCurrentPath,
  useIsLoadingFiles,
  useFileError,
} from "../store";
import type { FileEntry, Breadcrumb } from "../lib/tauri";

export interface UseFileBrowserReturn {
  currentPath: string;
  currentServerId: string | null;
  entries: FileEntry[];
  breadcrumbs: Breadcrumb[];
  isLoading: boolean;
  error: string | null;
  searchPattern: string;
  navigateToPath: (serverId: string, path: string) => Promise<void>;
  navigateToDirectory: (path: string) => Promise<void>;
  refreshDirectory: () => Promise<void>;
  searchFiles: (pattern: string) => Promise<void>;
  clearSearch: () => void;
  setServer: (serverId: string | null) => void;
}

export function useFileBrowser(): UseFileBrowserReturn {
  const entries = useFileEntries();
  const breadcrumbs = useBreadcrumbs();
  const currentPath = useCurrentPath();
  const isLoading = useIsLoadingFiles();
  const error = useFileError();

  const currentServerId = useAppStore((state) => state.currentServerId);
  const searchPattern = useAppStore((state) => state.searchPattern);
  const navigateToPath = useAppStore((state) => state.navigateToPath);
  const refreshDirectory = useAppStore((state) => state.refreshDirectory);
  const searchFiles = useAppStore((state) => state.searchFiles);
  const clearSearch = useAppStore((state) => state.clearSearch);
  const setFileBrowserServer = useAppStore((state) => state.setFileBrowserServer);

  // Navigate to a directory within the current server
  const navigateToDirectory = useCallback(
    async (path: string) => {
      if (currentServerId) {
        await navigateToPath(currentServerId, path);
      }
    },
    [currentServerId, navigateToPath]
  );

  return {
    currentPath,
    currentServerId,
    entries,
    breadcrumbs,
    isLoading,
    error,
    searchPattern,
    navigateToPath,
    navigateToDirectory,
    refreshDirectory,
    searchFiles,
    clearSearch,
    setServer: setFileBrowserServer,
  };
}
