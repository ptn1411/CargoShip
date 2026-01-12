import { useEffect } from "react";
import {
  useAppStore,
  useServers as useServersSelector,
  useSelectedServer,
  useServerStatus,
  useIsLoadingServers,
  useServerError,
} from "../store";
import type { CreateServerInput, UpdateServerInput, ConnectionStatus } from "../lib/tauri";

export interface UseServersReturn {
  servers: ReturnType<typeof useServersSelector>;
  selectedServer: ReturnType<typeof useSelectedServer>;
  isLoading: boolean;
  error: string | null;
  loadServers: () => Promise<void>;
  addServer: (input: CreateServerInput, credential?: string) => Promise<void>;
  updateServer: (id: string, input: UpdateServerInput) => Promise<void>;
  deleteServer: (id: string) => Promise<void>;
  selectServer: (id: string | null) => void;
  testConnection: (id: string) => Promise<ConnectionStatus>;
  getServerStatus: (id: string) => "online" | "offline" | "connecting";
}

export function useServers(): UseServersReturn {
  const servers = useServersSelector();
  const selectedServer = useSelectedServer();
  const isLoading = useIsLoadingServers();
  const error = useServerError();

  const loadServers = useAppStore((state) => state.loadServers);
  const addServer = useAppStore((state) => state.addServer);
  const updateServer = useAppStore((state) => state.updateServer);
  const deleteServer = useAppStore((state) => state.deleteServer);
  const selectServer = useAppStore((state) => state.selectServer);
  const testConnection = useAppStore((state) => state.testConnection);
  const serverStatus = useAppStore((state) => state.serverStatus);

  // Load servers on mount
  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const getServerStatus = (id: string) => serverStatus[id] ?? "offline";

  return {
    servers,
    selectedServer,
    isLoading,
    error,
    loadServers,
    addServer: async (input, credential) => {
      await addServer(input, credential);
    },
    updateServer: async (id, input) => {
      await updateServer(id, input);
    },
    deleteServer: async (id) => {
      await deleteServer(id);
    },
    selectServer,
    testConnection,
    getServerStatus,
  };
}

// Hook to get status for a specific server
export function useServerConnectionStatus(serverId: string) {
  return useServerStatus(serverId);
}
