use serde::{Deserialize, Serialize};

/// Status of an SSH connection attempt
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStatus {
    /// Whether the connection was successful
    pub connected: bool,
    /// Server information if connection succeeded
    pub server_info: Option<ServerInfo>,
    /// Error message if connection failed
    pub error: Option<String>,
    /// Connection latency in milliseconds
    pub latency_ms: Option<u64>,
}

/// Information about a remote server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerInfo {
    /// Operating system name (e.g., "Linux", "Darwin")
    pub os: String,
    /// Server hostname
    pub hostname: String,
    /// Kernel version
    pub kernel: String,
}

/// Output from executing a command on a remote server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandOutput {
    /// Standard output from the command
    pub stdout: String,
    /// Standard error from the command
    pub stderr: String,
    /// Exit code of the command
    pub exit_code: i32,
    /// Duration of command execution in milliseconds
    pub duration_ms: u64,
}

impl CommandOutput {
    /// Check if the command completed successfully (exit code 0)
    pub fn is_success(&self) -> bool {
        self.exit_code == 0
    }

    /// Check if the command has any output (stdout or stderr)
    pub fn has_output(&self) -> bool {
        !self.stdout.is_empty() || !self.stderr.is_empty()
    }
}

/// Configuration for command execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandConfig {
    /// Timeout in seconds (default: 60)
    pub timeout_secs: Option<u64>,
    /// Whether to stream output progressively
    pub stream_output: bool,
}

impl Default for CommandConfig {
    fn default() -> Self {
        Self {
            timeout_secs: Some(60),
            stream_output: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_command_output_is_success() {
        let output = CommandOutput {
            stdout: "hello".to_string(),
            stderr: String::new(),
            exit_code: 0,
            duration_ms: 100,
        };
        assert!(output.is_success());

        let failed_output = CommandOutput {
            stdout: String::new(),
            stderr: "error".to_string(),
            exit_code: 1,
            duration_ms: 100,
        };
        assert!(!failed_output.is_success());
    }

    #[test]
    fn test_command_output_has_output() {
        let with_stdout = CommandOutput {
            stdout: "hello".to_string(),
            stderr: String::new(),
            exit_code: 0,
            duration_ms: 100,
        };
        assert!(with_stdout.has_output());

        let with_stderr = CommandOutput {
            stdout: String::new(),
            stderr: "error".to_string(),
            exit_code: 1,
            duration_ms: 100,
        };
        assert!(with_stderr.has_output());

        let empty = CommandOutput {
            stdout: String::new(),
            stderr: String::new(),
            exit_code: 0,
            duration_ms: 100,
        };
        assert!(!empty.has_output());
    }

    #[test]
    fn test_command_config_default() {
        let config = CommandConfig::default();
        assert_eq!(config.timeout_secs, Some(60));
        assert!(!config.stream_output);
    }
}
