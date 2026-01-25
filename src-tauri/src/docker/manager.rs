use super::models::*;
use crate::server::Server;
use crate::ssh::SshClient;
use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::sync::Arc;

pub struct DockerManager {
    ssh_client: Arc<SshClient>,
}

impl DockerManager {
    pub fn new(ssh_client: Arc<SshClient>) -> Self {
        Self { ssh_client }
    }

    /// Get Docker system info
    pub fn get_info(&self, server: &Server) -> Result<DockerInfo> {
        let cmd = r#"docker info --format '{{json .}}' 2>/dev/null"#;
        let output = self.ssh_client.execute_command(server, cmd, Some(30))?;

        if output.exit_code != 0 {
            return Err(anyhow!("Docker not available: {}", output.stderr));
        }

        let info: serde_json::Value = serde_json::from_str(&output.stdout)?;

        Ok(DockerInfo {
            version: info["ServerVersion"].as_str().unwrap_or("").to_string(),
            api_version: info["ApiVersion"].as_str().unwrap_or("").to_string(),
            containers_running: info["ContainersRunning"].as_u64().unwrap_or(0) as u32,
            containers_paused: info["ContainersPaused"].as_u64().unwrap_or(0) as u32,
            containers_stopped: info["ContainersStopped"].as_u64().unwrap_or(0) as u32,
            images: info["Images"].as_u64().unwrap_or(0) as u32,
            storage_driver: info["Driver"].as_str().unwrap_or("").to_string(),
            os: info["OperatingSystem"].as_str().unwrap_or("").to_string(),
            architecture: info["Architecture"].as_str().unwrap_or("").to_string(),
            memory_total: info["MemTotal"].as_u64().unwrap_or(0),
            cpus: info["NCPU"].as_u64().unwrap_or(0) as u32,
        })
    }

    /// List all containers
    pub fn list_containers(&self, server: &Server, all: bool) -> Result<Vec<DockerContainer>> {
        let all_flag = if all { "-a" } else { "" };
        let cmd = format!(
            r#"docker ps {} --format '{{{{json .}}}}' 2>/dev/null"#,
            all_flag
        );
        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        if output.exit_code != 0 {
            return Err(anyhow!("Failed to list containers: {}", output.stderr));
        }

        let mut containers = Vec::new();
        for line in output.stdout.lines() {
            if line.trim().is_empty() {
                continue;
            }
            let c: serde_json::Value = serde_json::from_str(line)?;

            let state = match c["State"].as_str().unwrap_or("").to_lowercase().as_str() {
                "running" => ContainerState::Running,
                "paused" => ContainerState::Paused,
                "restarting" => ContainerState::Restarting,
                "exited" => ContainerState::Exited,
                "dead" => ContainerState::Dead,
                "created" => ContainerState::Created,
                _ => ContainerState::Exited,
            };

            let ports = self.parse_ports(c["Ports"].as_str().unwrap_or(""));
            let networks: Vec<String> = c["Networks"]
                .as_str()
                .unwrap_or("")
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();

            containers.push(DockerContainer {
                id: c["ID"].as_str().unwrap_or("").to_string(),
                name: c["Names"]
                    .as_str()
                    .unwrap_or("")
                    .trim_start_matches('/')
                    .to_string(),
                image: c["Image"].as_str().unwrap_or("").to_string(),
                status: c["Status"].as_str().unwrap_or("").to_string(),
                state,
                created: c["CreatedAt"].as_str().unwrap_or("").to_string(),
                ports,
                networks,
                mounts: Vec::new(),
                labels: HashMap::new(),
            });
        }
        Ok(containers)
    }

    fn parse_ports(&self, ports_str: &str) -> Vec<PortMapping> {
        let mut ports = Vec::new();
        for part in ports_str.split(',') {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }

            // Parse formats like "0.0.0.0:8080->80/tcp" or "80/tcp"
            if let Some((host_part, container_part)) = part.split_once("->") {
                let (host_ip, host_port) = if let Some((ip, port)) = host_part.rsplit_once(':') {
                    (Some(ip.to_string()), port.parse().ok())
                } else {
                    (None, host_part.parse().ok())
                };

                let (container_port, protocol) =
                    if let Some((port, proto)) = container_part.split_once('/') {
                        (port.parse().unwrap_or(0), proto.to_string())
                    } else {
                        (container_part.parse().unwrap_or(0), "tcp".to_string())
                    };

                ports.push(PortMapping {
                    container_port,
                    host_port,
                    protocol,
                    host_ip,
                });
            } else if let Some((port, proto)) = part.split_once('/') {
                ports.push(PortMapping {
                    container_port: port.parse().unwrap_or(0),
                    host_port: None,
                    protocol: proto.to_string(),
                    host_ip: None,
                });
            }
        }
        ports
    }

    /// Start a container
    pub fn start_container(&self, server: &Server, container_id: &str) -> Result<()> {
        let cmd = format!("docker start {}", container_id);
        let output = self.ssh_client.execute_command(server, &cmd, Some(60))?;
        if output.exit_code != 0 {
            return Err(anyhow!("Failed to start container: {}", output.stderr));
        }
        Ok(())
    }

    /// Stop a container
    pub fn stop_container(&self, server: &Server, container_id: &str) -> Result<()> {
        let cmd = format!("docker stop {}", container_id);
        let output = self.ssh_client.execute_command(server, &cmd, Some(60))?;
        if output.exit_code != 0 {
            return Err(anyhow!("Failed to stop container: {}", output.stderr));
        }
        Ok(())
    }

    /// Restart a container
    pub fn restart_container(&self, server: &Server, container_id: &str) -> Result<()> {
        let cmd = format!("docker restart {}", container_id);
        let output = self.ssh_client.execute_command(server, &cmd, Some(60))?;
        if output.exit_code != 0 {
            return Err(anyhow!("Failed to restart container: {}", output.stderr));
        }
        Ok(())
    }

    /// Pause a container
    pub fn pause_container(&self, server: &Server, container_id: &str) -> Result<()> {
        let cmd = format!("docker pause {}", container_id);
        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;
        if output.exit_code != 0 {
            return Err(anyhow!("Failed to pause container: {}", output.stderr));
        }
        Ok(())
    }

    /// Unpause a container
    pub fn unpause_container(&self, server: &Server, container_id: &str) -> Result<()> {
        let cmd = format!("docker unpause {}", container_id);
        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;
        if output.exit_code != 0 {
            return Err(anyhow!("Failed to unpause container: {}", output.stderr));
        }
        Ok(())
    }

    /// Remove a container
    pub fn remove_container(&self, server: &Server, container_id: &str, force: bool) -> Result<()> {
        let force_flag = if force { "-f" } else { "" };
        let cmd = format!("docker rm {} {}", force_flag, container_id);
        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;
        if output.exit_code != 0 {
            return Err(anyhow!("Failed to remove container: {}", output.stderr));
        }
        Ok(())
    }

    /// Get container logs
    pub fn get_container_logs(
        &self,
        server: &Server,
        container_id: &str,
        tail: u32,
    ) -> Result<ContainerLogs> {
        let cmd = format!("docker logs --tail {} {} 2>&1", tail, container_id);
        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;
        Ok(ContainerLogs {
            stdout: output.stdout,
            stderr: output.stderr,
        })
    }

    /// Get container stats
    pub fn get_container_stats(
        &self,
        server: &Server,
        container_id: &str,
    ) -> Result<ContainerStats> {
        let cmd = format!(
            r#"docker stats {} --no-stream --format '{{{{json .}}}}'"#,
            container_id
        );
        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;

        if output.exit_code != 0 {
            return Err(anyhow!("Failed to get stats: {}", output.stderr));
        }

        let stats: serde_json::Value = serde_json::from_str(output.stdout.trim())?;

        Ok(ContainerStats {
            cpu_percent: Self::parse_percent(stats["CPUPerc"].as_str().unwrap_or("0%")),
            memory_usage: Self::parse_memory(stats["MemUsage"].as_str().unwrap_or("0B")),
            memory_limit: Self::parse_memory_limit(stats["MemUsage"].as_str().unwrap_or("0B")),
            memory_percent: Self::parse_percent(stats["MemPerc"].as_str().unwrap_or("0%")),
            network_rx: Self::parse_network(stats["NetIO"].as_str().unwrap_or("0B"), true),
            network_tx: Self::parse_network(stats["NetIO"].as_str().unwrap_or("0B"), false),
            block_read: Self::parse_network(stats["BlockIO"].as_str().unwrap_or("0B"), true),
            block_write: Self::parse_network(stats["BlockIO"].as_str().unwrap_or("0B"), false),
        })
    }

    fn parse_percent(s: &str) -> f64 {
        s.trim_end_matches('%').parse().unwrap_or(0.0)
    }

    fn parse_memory(s: &str) -> u64 {
        let parts: Vec<&str> = s.split('/').collect();
        Self::parse_size(parts.first().unwrap_or(&"0B").trim())
    }

    fn parse_memory_limit(s: &str) -> u64 {
        let parts: Vec<&str> = s.split('/').collect();
        Self::parse_size(parts.get(1).unwrap_or(&"0B").trim())
    }

    fn parse_network(s: &str, is_rx: bool) -> u64 {
        let parts: Vec<&str> = s.split('/').collect();
        let idx = if is_rx { 0 } else { 1 };
        Self::parse_size(parts.get(idx).unwrap_or(&"0B").trim())
    }

    fn parse_size(s: &str) -> u64 {
        let s = s.trim();
        let (num, unit) = if let Some(pos) = s.find(|c: char| c.is_alphabetic()) {
            (&s[..pos], &s[pos..])
        } else {
            (s, "B")
        };

        let num: f64 = num.parse().unwrap_or(0.0);
        let multiplier = match unit.to_uppercase().as_str() {
            "B" => 1u64,
            "KB" | "KIB" => 1024,
            "MB" | "MIB" => 1024 * 1024,
            "GB" | "GIB" => 1024 * 1024 * 1024,
            "TB" | "TIB" => 1024 * 1024 * 1024 * 1024,
            _ => 1,
        };
        (num * multiplier as f64) as u64
    }

    /// Create and run a new container
    pub fn create_container(&self, server: &Server, input: CreateContainerInput) -> Result<String> {
        let mut cmd = format!("docker run -d --name {}", input.name);

        for port in &input.ports {
            let proto = port.protocol.as_deref().unwrap_or("tcp");
            cmd.push_str(&format!(
                " -p {}:{}/{}",
                port.host_port, port.container_port, proto
            ));
        }

        for env in &input.env {
            cmd.push_str(&format!(" -e '{}'", env));
        }

        for vol in &input.volumes {
            cmd.push_str(&format!(" -v {}", vol));
        }

        if let Some(network) = &input.network {
            cmd.push_str(&format!(" --network {}", network));
        }

        if let Some(restart) = &input.restart_policy {
            cmd.push_str(&format!(" --restart {}", restart));
        }

        if let Some(labels) = &input.labels {
            for (k, v) in labels {
                cmd.push_str(&format!(" -l {}={}", k, v));
            }
        }

        cmd.push_str(&format!(" {}", input.image));

        if let Some(command) = &input.command {
            cmd.push_str(&format!(" {}", command));
        }

        let output = self.ssh_client.execute_command(server, &cmd, Some(120))?;
        if output.exit_code != 0 {
            return Err(anyhow!("Failed to create container: {}", output.stderr));
        }
        Ok(output.stdout.trim().to_string())
    }

    /// List images
    pub fn list_images(&self, server: &Server) -> Result<Vec<DockerImage>> {
        let cmd = r#"docker images --format '{{json .}}'"#;
        let output = self.ssh_client.execute_command(server, cmd, Some(30))?;

        if output.exit_code != 0 {
            return Err(anyhow!("Failed to list images: {}", output.stderr));
        }

        let mut images = Vec::new();
        for line in output.stdout.lines() {
            if line.trim().is_empty() {
                continue;
            }
            let img: serde_json::Value = serde_json::from_str(line)?;
            images.push(DockerImage {
                id: img["ID"].as_str().unwrap_or("").to_string(),
                repository: img["Repository"].as_str().unwrap_or("").to_string(),
                tag: img["Tag"].as_str().unwrap_or("").to_string(),
                size: Self::parse_size(img["Size"].as_str().unwrap_or("0B")),
                created: img["CreatedAt"].as_str().unwrap_or("").to_string(),
            });
        }
        Ok(images)
    }

    /// Pull an image
    pub fn pull_image(&self, server: &Server, input: PullImageInput) -> Result<()> {
        let image = if let Some(tag) = &input.tag {
            format!("{}:{}", input.image, tag)
        } else {
            input.image
        };

        let cmd = format!("docker pull {}", image);
        let output = self.ssh_client.execute_command(server, &cmd, Some(600))?;
        if output.exit_code != 0 {
            return Err(anyhow!("Failed to pull image: {}", output.stderr));
        }
        Ok(())
    }

    /// Remove an image
    pub fn remove_image(&self, server: &Server, image_id: &str, force: bool) -> Result<()> {
        let force_flag = if force { "-f" } else { "" };
        let cmd = format!("docker rmi {} {}", force_flag, image_id);
        let output = self.ssh_client.execute_command(server, &cmd, Some(60))?;
        if output.exit_code != 0 {
            return Err(anyhow!("Failed to remove image: {}", output.stderr));
        }
        Ok(())
    }

    /// List volumes
    pub fn list_volumes(&self, server: &Server) -> Result<Vec<DockerVolume>> {
        let cmd = r#"docker volume ls --format '{{json .}}'"#;
        let output = self.ssh_client.execute_command(server, cmd, Some(30))?;

        if output.exit_code != 0 {
            return Err(anyhow!("Failed to list volumes: {}", output.stderr));
        }

        let mut volumes = Vec::new();
        for line in output.stdout.lines() {
            if line.trim().is_empty() {
                continue;
            }
            let vol: serde_json::Value = serde_json::from_str(line)?;
            volumes.push(DockerVolume {
                name: vol["Name"].as_str().unwrap_or("").to_string(),
                driver: vol["Driver"].as_str().unwrap_or("").to_string(),
                mountpoint: vol["Mountpoint"].as_str().unwrap_or("").to_string(),
                created: "".to_string(),
                labels: HashMap::new(),
            });
        }
        Ok(volumes)
    }

    /// Create a volume
    pub fn create_volume(&self, server: &Server, input: CreateVolumeInput) -> Result<()> {
        let mut cmd = format!("docker volume create {}", input.name);
        if let Some(driver) = &input.driver {
            cmd.push_str(&format!(" --driver {}", driver));
        }
        if let Some(labels) = &input.labels {
            for (k, v) in labels {
                cmd.push_str(&format!(" --label {}={}", k, v));
            }
        }

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;
        if output.exit_code != 0 {
            return Err(anyhow!("Failed to create volume: {}", output.stderr));
        }
        Ok(())
    }

    /// Remove a volume
    pub fn remove_volume(&self, server: &Server, name: &str, force: bool) -> Result<()> {
        let force_flag = if force { "-f" } else { "" };
        let cmd = format!("docker volume rm {} {}", force_flag, name);
        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;
        if output.exit_code != 0 {
            return Err(anyhow!("Failed to remove volume: {}", output.stderr));
        }
        Ok(())
    }

    /// List networks
    pub fn list_networks(&self, server: &Server) -> Result<Vec<DockerNetwork>> {
        let cmd = r#"docker network ls --format '{{json .}}'"#;
        let output = self.ssh_client.execute_command(server, cmd, Some(30))?;

        if output.exit_code != 0 {
            return Err(anyhow!("Failed to list networks: {}", output.stderr));
        }

        let mut networks = Vec::new();
        for line in output.stdout.lines() {
            if line.trim().is_empty() {
                continue;
            }
            let net: serde_json::Value = serde_json::from_str(line)?;
            networks.push(DockerNetwork {
                id: net["ID"].as_str().unwrap_or("").to_string(),
                name: net["Name"].as_str().unwrap_or("").to_string(),
                driver: net["Driver"].as_str().unwrap_or("").to_string(),
                scope: net["Scope"].as_str().unwrap_or("").to_string(),
                internal: false,
                containers: Vec::new(),
            });
        }
        Ok(networks)
    }

    /// Create a network
    pub fn create_network(&self, server: &Server, input: CreateNetworkInput) -> Result<()> {
        let mut cmd = format!("docker network create {}", input.name);
        if let Some(driver) = &input.driver {
            cmd.push_str(&format!(" --driver {}", driver));
        }
        if input.internal.unwrap_or(false) {
            cmd.push_str(" --internal");
        }
        if let Some(labels) = &input.labels {
            for (k, v) in labels {
                cmd.push_str(&format!(" --label {}={}", k, v));
            }
        }

        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;
        if output.exit_code != 0 {
            return Err(anyhow!("Failed to create network: {}", output.stderr));
        }
        Ok(())
    }

    /// Remove a network
    pub fn remove_network(&self, server: &Server, name: &str) -> Result<()> {
        let cmd = format!("docker network rm {}", name);
        let output = self.ssh_client.execute_command(server, &cmd, Some(30))?;
        if output.exit_code != 0 {
            return Err(anyhow!("Failed to remove network: {}", output.stderr));
        }
        Ok(())
    }

    /// List Docker Compose projects
    pub fn list_compose_projects(&self, server: &Server) -> Result<Vec<DockerComposeProject>> {
        let cmd = r#"docker compose ls --format json 2>/dev/null || echo '[]'"#;
        let output = self.ssh_client.execute_command(server, cmd, Some(30))?;

        let projects: Vec<serde_json::Value> =
            serde_json::from_str(&output.stdout).unwrap_or_default();

        let mut result = Vec::new();
        for p in projects {
            result.push(DockerComposeProject {
                name: p["Name"].as_str().unwrap_or("").to_string(),
                status: p["Status"].as_str().unwrap_or("").to_string(),
                services: Vec::new(),
                config_files: p["ConfigFiles"]
                    .as_str()
                    .unwrap_or("")
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect(),
            });
        }
        Ok(result)
    }

    /// Docker Compose up
    pub fn compose_up(&self, server: &Server, project_path: &str, detach: bool) -> Result<()> {
        let detach_flag = if detach { "-d" } else { "" };
        let cmd = format!("cd {} && docker compose up {}", project_path, detach_flag);
        let output = self.ssh_client.execute_command(server, &cmd, Some(300))?;
        if output.exit_code != 0 {
            return Err(anyhow!("Failed to start compose: {}", output.stderr));
        }
        Ok(())
    }

    /// Docker Compose down
    pub fn compose_down(
        &self,
        server: &Server,
        project_path: &str,
        remove_volumes: bool,
    ) -> Result<()> {
        let vol_flag = if remove_volumes { "-v" } else { "" };
        let cmd = format!("cd {} && docker compose down {}", project_path, vol_flag);
        let output = self.ssh_client.execute_command(server, &cmd, Some(120))?;
        if output.exit_code != 0 {
            return Err(anyhow!("Failed to stop compose: {}", output.stderr));
        }
        Ok(())
    }

    /// Prune unused resources
    pub fn prune(&self, server: &Server, prune_type: &str) -> Result<String> {
        let cmd = match prune_type {
            "containers" => "docker container prune -f",
            "images" => "docker image prune -f",
            "volumes" => "docker volume prune -f",
            "networks" => "docker network prune -f",
            "all" => "docker system prune -af",
            _ => return Err(anyhow!("Invalid prune type")),
        };

        let output = self.ssh_client.execute_command(server, cmd, Some(120))?;
        if output.exit_code != 0 {
            return Err(anyhow!("Failed to prune: {}", output.stderr));
        }
        Ok(output.stdout)
    }

    /// Execute command in container
    pub fn exec_container(
        &self,
        server: &Server,
        container_id: &str,
        command: &str,
    ) -> Result<String> {
        let cmd = format!("docker exec {} {}", container_id, command);
        let output = self.ssh_client.execute_command(server, &cmd, Some(60))?;
        if output.exit_code != 0 {
            return Err(anyhow!("Exec failed: {}", output.stderr));
        }
        Ok(output.stdout)
    }
}
