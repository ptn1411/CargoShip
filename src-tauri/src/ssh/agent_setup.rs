use crate::error::Result;
use std::path::Path;

/// Check if SSH Agent is properly configured and running
pub fn check_agent_status() -> AgentStatus {
    let manager = crate::ssh::agent_manager();
    let flags = manager.status_flags();

    if !flags.enabled {
        AgentStatus::NotInstalled
    } else if flags.running {
        AgentStatus::Running
    } else {
        AgentStatus::Stopped
    }
}

/// Attempt to automatically start SSH Agent service
pub fn auto_start_agent() -> Result<()> {
    crate::ssh::agent_manager().ensure_runtime()
}

/// Configure SSH Agent to start automatically on boot
pub fn configure_auto_start() -> Result<()> {
    crate::ssh::agent_manager().set_auto_start(true);
    Ok(())
}

/// Add a key to SSH Agent
pub fn add_key_to_agent(key_path: &Path, passphrase: Option<&str>) -> Result<()> {
    let loaded = crate::ssh::load_private_key(key_path, passphrase)?;
    crate::ssh::ensure_key_in_agent(&loaded)
}

/// Check if a specific key is already in the agent
pub fn is_key_in_agent(public_key_fingerprint: &str) -> bool {
    crate::ssh::agent_manager().matches_fingerprint(public_key_fingerprint)
}

#[derive(Debug, Clone, PartialEq)]
pub enum AgentStatus {
    Running,
    Stopped,
    NotInstalled,
}

impl AgentStatus {
    pub fn is_usable(&self) -> bool {
        matches!(self, AgentStatus::Running)
    }

    pub fn user_message(&self) -> String {
        match self {
            AgentStatus::Running => "Embedded SSH Agent is running".to_string(),
            AgentStatus::Stopped => "Embedded SSH Agent is stopped. Click to start it.".to_string(),
            AgentStatus::NotInstalled => {
                "Embedded SSH Agent is disabled. Enable it in application settings.".to_string()
            }
        }
    }
}
