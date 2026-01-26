mod agent_setup;
mod client;
mod embedded_agent;
mod key_utils;
mod keys;
mod models;
mod pool;

pub use agent_setup::{
    add_key_to_agent, auto_start_agent, check_agent_status, configure_auto_start, is_key_in_agent,
    AgentStatus,
};
pub use client::*;
pub use embedded_agent::{
    agent_manager, AgentStatusFlags, EmbeddedAgentConfig, EmbeddedAgentManager,
};
pub use key_utils::{
    analyze_key_file, ensure_key_in_agent, load_private_key, write_temp_key, KeyInfo, KeyType,
    LoadedKey,
};
pub use keys::{CreateSshKeyInput, GeneratedKey, SshKey, SshKeyManager, SshKeyType};
pub use models::*;
pub use pool::*;
pub use pool::{authenticate_with_key_content, create_ssh_session_with_retry};
