use crate::error::{AppError, Result};
use std::path::Path;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use std::process::Command;

/// Check if SSH Agent is properly configured and running
pub fn check_agent_status() -> AgentStatus {
    #[cfg(target_os = "windows")]
    {
        // Check if service exists
        let service_check = Command::new("sc")
            .args(["query", "ssh-agent"])
            .output();

        if service_check.is_err() {
            return AgentStatus::NotInstalled;
        }

        let output = service_check.unwrap();
        let stdout = String::from_utf8_lossy(&output.stdout);

        if stdout.contains("RUNNING") {
            // Check if we can actually connect to agent
            if can_connect_to_agent() {
                return AgentStatus::Running;
            } else {
                return AgentStatus::RunningButNotAccessible;
            }
        } else if stdout.contains("STOPPED") {
            return AgentStatus::Stopped;
        } else {
            return AgentStatus::NotInstalled;
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if can_connect_to_agent() {
            AgentStatus::Running
        } else {
            AgentStatus::Stopped
        }
    }
}

/// Try to connect to SSH agent
fn can_connect_to_agent() -> bool {
    let result = std::process::Command::new("ssh-add")
        .arg("-l")
        .output();

    if let Ok(output) = result {
        // Exit code 0 or 1 means agent is accessible (1 = no identities)
        let code = output.status.code().unwrap_or(-1);
        code == 0 || code == 1
    } else {
        false
    }
}

/// Attempt to automatically start SSH Agent service
#[cfg(target_os = "windows")]
pub fn auto_start_agent() -> Result<()> {
    // Try to start the service
    let start_result = Command::new("net")
        .args(["start", "ssh-agent"])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output();

    if let Ok(output) = start_result {
        if output.status.success() || 
           String::from_utf8_lossy(&output.stdout).contains("already been started") {
            // Wait a moment for service to be ready
            std::thread::sleep(std::time::Duration::from_millis(500));
            return Ok(());
        }
    }

    // If net start failed, try sc start
    let sc_result = Command::new("sc")
        .args(["start", "ssh-agent"])
        .creation_flags(0x08000000)
        .output();

    if let Ok(output) = sc_result {
        if output.status.success() {
            std::thread::sleep(std::time::Duration::from_millis(500));
            return Ok(());
        }
    }

    Err(AppError::AuthenticationFailed(
        "Failed to start SSH Agent service automatically. Manual setup required.".to_string()
    ))
}

#[cfg(not(target_os = "windows"))]
pub fn auto_start_agent() -> Result<()> {
    // On Unix, agent is usually already running or managed by system
    Ok(())
}

/// Configure SSH Agent to start automatically on boot
#[cfg(target_os = "windows")]
pub fn configure_auto_start() -> Result<()> {
    let config_result = Command::new("sc")
        .args(["config", "ssh-agent", "start=auto"])
        .creation_flags(0x08000000)
        .output();

    if let Ok(output) = config_result {
        if output.status.success() {
            return Ok(());
        }
    }

    Err(AppError::AuthenticationFailed(
        "Failed to configure SSH Agent auto-start. Administrator privileges may be required.".to_string()
    ))
}

#[cfg(not(target_os = "windows"))]
pub fn configure_auto_start() -> Result<()> {
    Ok(())
}

/// Add a key to SSH Agent
pub fn add_key_to_agent(key_path: &Path, passphrase: Option<&str>) -> Result<()> {
    // For keys with passphrase, we can't add them non-interactively
    // The user needs to run ssh-add manually
    if passphrase.is_some() {
        return Err(AppError::AuthenticationFailed(
            "Cannot add passphrase-protected key to agent automatically. \
            Please run: ssh-add <key_path>".to_string()
        ));
    }

    // For keys without passphrase, we can add them
    let result = std::process::Command::new("ssh-add")
        .arg(key_path)
        .output();

    match result {
        Ok(output) if output.status.success() => Ok(()),
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(AppError::AuthenticationFailed(format!(
                "Failed to add key to agent: {}",
                stderr
            )))
        }
        Err(e) => Err(AppError::AuthenticationFailed(format!(
            "Failed to run ssh-add: {}",
            e
        ))),
    }
}

/// Check if a specific key is already in the agent
pub fn is_key_in_agent(public_key_fingerprint: &str) -> bool {
    let result = std::process::Command::new("ssh-add")
        .arg("-l")
        .output();

    if let Ok(output) = result {
        let stdout = String::from_utf8_lossy(&output.stdout);
        stdout.contains(public_key_fingerprint)
    } else {
        false
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum AgentStatus {
    Running,
    Stopped,
    NotInstalled,
    RunningButNotAccessible,
}

impl AgentStatus {
    pub fn is_usable(&self) -> bool {
        matches!(self, AgentStatus::Running)
    }

    pub fn user_message(&self) -> String {
        match self {
            AgentStatus::Running => "SSH Agent is running".to_string(),
            AgentStatus::Stopped => "SSH Agent is stopped. Click to start it.".to_string(),
            AgentStatus::NotInstalled => {
                "SSH Agent is not installed. Please install OpenSSH Client.".to_string()
            }
            AgentStatus::RunningButNotAccessible => {
                "SSH Agent is running but not accessible. Try restarting it.".to_string()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_agent_status() {
        let status = check_agent_status();
        // Just ensure it doesn't panic
        println!("Agent status: {:?}", status);
    }

    #[test]
    fn test_can_connect_to_agent() {
        let can_connect = can_connect_to_agent();
        println!("Can connect to agent: {}", can_connect);
    }
}
