import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Docker Management Types
// ============================================================================

export type ContainerState = "running" | "paused" | "restarting" | "exited" | "dead" | "created" | "removing";

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: ContainerState;
  created: string;
  ports: PortMapping[];
  networks: string[];
  mounts: string[];
  labels: Record<string, string>;
}

export interface PortMapping {
  container_port: number;
  host_port: number | null;
  protocol: string;
  host_ip: string | null;
}

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: number;
  created: string;
}

export interface DockerVolume {
  name: string;
  driver: string;
  mountpoint: string;
  created: string;
  labels: Record<string, string>;
}

export interface DockerNetwork {
  id: string;
  name: string;
  driver: string;
  scope: string;
  internal: boolean;
  containers: string[];
}

export interface ContainerStats {
  cpu_percent: number;
  memory_usage: number;
  memory_limit: number;
  memory_percent: number;
  network_rx: number;
  network_tx: number;
  block_read: number;
  block_write: number;
}


export interface DockerInfo {
  version: string;
  api_version: string;
  containers_running: number;
  containers_paused: number;
  containers_stopped: number;
  images: number;
  storage_driver: string;
  os: string;
  architecture: string;
  memory_total: number;
  cpus: number;
}

export interface ContainerLogs {
  stdout: string;
  stderr: string;
}

export interface CreateContainerInput {
  name: string;
  image: string;
  ports: PortMappingInput[];
  env: string[];
  volumes: string[];
  network?: string;
  restart_policy?: string;
  command?: string;
  labels?: Record<string, string>;
}

export interface PortMappingInput {
  container_port: number;
  host_port: number;
  protocol?: string;
}

export interface PullImageInput {
  image: string;
  tag?: string;
}

export interface CreateVolumeInput {
  name: string;
  driver?: string;
  labels?: Record<string, string>;
}

export interface CreateNetworkInput {
  name: string;
  driver?: string;
  internal?: boolean;
  labels?: Record<string, string>;
}

export interface DockerComposeProject {
  name: string;
  status: string;
  services: ComposeService[];
  config_files: string[];
}

export interface ComposeService {
  name: string;
  status: string;
  container_id: string | null;
  image: string;
  ports: string[];
}

// ============================================================================
// Docker Management API
// ============================================================================

export const dockerApi = {
  // System Info
  getInfo: (serverId: string) =>
    invoke<DockerInfo>("docker_get_info", { serverId }),

  // Container Management
  listContainers: (serverId: string, all: boolean = true) =>
    invoke<DockerContainer[]>("docker_list_containers", { serverId, all }),
  startContainer: (serverId: string, containerId: string) =>
    invoke<void>("docker_start_container", { serverId, containerId }),
  stopContainer: (serverId: string, containerId: string) =>
    invoke<void>("docker_stop_container", { serverId, containerId }),
  restartContainer: (serverId: string, containerId: string) =>
    invoke<void>("docker_restart_container", { serverId, containerId }),
  pauseContainer: (serverId: string, containerId: string) =>
    invoke<void>("docker_pause_container", { serverId, containerId }),
  unpauseContainer: (serverId: string, containerId: string) =>
    invoke<void>("docker_unpause_container", { serverId, containerId }),
  removeContainer: (serverId: string, containerId: string, force: boolean = false) =>
    invoke<void>("docker_remove_container", { serverId, containerId, force }),
  getContainerLogs: (serverId: string, containerId: string, tail: number = 100) =>
    invoke<ContainerLogs>("docker_get_container_logs", { serverId, containerId, tail }),
  getContainerStats: (serverId: string, containerId: string) =>
    invoke<ContainerStats>("docker_get_container_stats", { serverId, containerId }),
  createContainer: (serverId: string, input: CreateContainerInput) =>
    invoke<string>("docker_create_container", { serverId, input }),
  execContainer: (serverId: string, containerId: string, command: string) =>
    invoke<string>("docker_exec_container", { serverId, containerId, command }),

  // Image Management
  listImages: (serverId: string) =>
    invoke<DockerImage[]>("docker_list_images", { serverId }),
  pullImage: (serverId: string, input: PullImageInput) =>
    invoke<void>("docker_pull_image", { serverId, input }),
  removeImage: (serverId: string, imageId: string, force: boolean = false) =>
    invoke<void>("docker_remove_image", { serverId, imageId, force }),

  // Volume Management
  listVolumes: (serverId: string) =>
    invoke<DockerVolume[]>("docker_list_volumes", { serverId }),
  createVolume: (serverId: string, input: CreateVolumeInput) =>
    invoke<void>("docker_create_volume", { serverId, input }),
  removeVolume: (serverId: string, name: string, force: boolean = false) =>
    invoke<void>("docker_remove_volume", { serverId, name, force }),

  // Network Management
  listNetworks: (serverId: string) =>
    invoke<DockerNetwork[]>("docker_list_networks", { serverId }),
  createNetwork: (serverId: string, input: CreateNetworkInput) =>
    invoke<void>("docker_create_network", { serverId, input }),
  removeNetwork: (serverId: string, name: string) =>
    invoke<void>("docker_remove_network", { serverId, name }),

  // Docker Compose
  listComposeProjects: (serverId: string) =>
    invoke<DockerComposeProject[]>("docker_list_compose_projects", { serverId }),
  composeUp: (serverId: string, projectPath: string, detach: boolean = true) =>
    invoke<void>("docker_compose_up", { serverId, projectPath, detach }),
  composeDown: (serverId: string, projectPath: string, removeVolumes: boolean = false) =>
    invoke<void>("docker_compose_down", { serverId, projectPath, removeVolumes }),

  // Cleanup
  prune: (serverId: string, pruneType: "containers" | "images" | "volumes" | "networks" | "all") =>
    invoke<string>("docker_prune", { serverId, pruneType }),
};
