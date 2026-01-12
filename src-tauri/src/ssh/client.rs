use crate::credentials::CredentialStore;
use crate::error::{AppError, Result};
use crate::server::Server;
use super::models::*;
use super::pool::{authenticate_session, create_ssh_session, ConnectionPool};
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

/// Default timeout for commands in seconds
const DEFAULT_COMMAND_TIMEOUT_SECS: u64 = 60;

/// Maximum number of retry attempts for auto-reconnect
const MAX_RETRY_ATTEMPTS: u32 = 3;

/// Base delay for exponential backoff in milliseconds
const BASE_RETRY_DELAY_MS: u64 = 1000;

/// SSH client for managing connections and executing commands on remote servers
/// 
/// Provides functionality for:
/// - Testing connections
/// - Retrieving server information
/// - Executing commands with timeout and cancellation support
/// - Auto-reconnect with exponential backoff
pub struct SshClient {
    connection_pool: Arc<ConnectionPool>,
    credential_store: Arc<CredentialStore>,
}

impl SshClient {
    /// Create a new SSH client with the given connection pool and credential store
    pub fn new(connection_pool: Arc<ConnectionPool>, credential_store: Arc<CredentialStore>) -> Self {
        Self {
            connection_pool,
            credential_store,
        }
    }

    /// Get a reference to the connection pool
    pub fn connection_pool(&self) -> &Arc<ConnectionPool> {
        &self.connection_pool
    }

    /// Test connection to a server and return connection status
    /// 
    /// This method attempts to connect and authenticate to the server,
    /// returning detailed status information including server info if successful.
    pub fn test_connection(&self, server: &Server) -> Result<ConnectionStatus> {
        let start = Instant::now();
        
        // Try to create SSH session
        let (session, tcp) = match create_ssh_session(&server.host, server.port) {
            Ok(s) => s,
            Err(e) => {
                return Ok(ConnectionStatus {
                    connected: false,
                    server_info: None,
                    error: Some(e.to_string()),
                    latency_ms: None,
                });
            }
        };

        // Authenticate
        if let Err(e) = authenticate_session(&session, server, &self.credential_store) {
            return Ok(ConnectionStatus {
                connected: false,
                server_info: None,
                error: Some(e.to_string()),
                latency_ms: Some(start.elapsed().as_millis() as u64),
            });
        }

        let latency = start.elapsed().as_millis() as u64;

        // Get server info
        let server_info = self.get_server_info_internal(&session).ok();

        // Add connection to pool for reuse
        let _ = self.connection_pool.add_connection(&server.id, session, tcp);

        Ok(ConnectionStatus {
            connected: true,
            server_info,
            error: None,
            latency_ms: Some(latency),
        })
    }

    /// Test connection with auto-reconnect using exponential backoff
    /// 
    /// Attempts to connect up to MAX_RETRY_ATTEMPTS times with increasing delays
    /// between attempts (exponential backoff).
    pub fn test_connection_with_retry(&self, server: &Server) -> Result<ConnectionStatus> {
        let mut last_error = None;
        
        for attempt in 0..MAX_RETRY_ATTEMPTS {
            if attempt > 0 {
                // Calculate exponential backoff delay
                let delay = calculate_backoff_delay(attempt);
                thread::sleep(delay);
            }

            match self.test_connection(server) {
                Ok(status) if status.connected => return Ok(status),
                Ok(status) => {
                    last_error = status.error;
                }
                Err(e) => {
                    last_error = Some(e.to_string());
                }
            }
        }

        Ok(ConnectionStatus {
            connected: false,
            server_info: None,
            error: last_error.or_else(|| Some("Connection failed after max retries".to_string())),
            latency_ms: None,
        })
    }

    /// Get server information (OS, hostname, kernel) from a connected server
    pub fn get_server_info(&self, server: &Server) -> Result<ServerInfo> {
        // Try to use existing connection from pool
        if self.connection_pool.has_connection(&server.id) {
            if let Some(info) = self.connection_pool.with_session(&server.id, |session| {
                self.get_server_info_internal(session)
            }) {
                if let Ok(info) = info {
                    return Ok(info);
                }
            }
        }

        // Create new connection
        let (session, tcp) = create_ssh_session(&server.host, server.port)?;
        authenticate_session(&session, server, &self.credential_store)?;
        
        let info = self.get_server_info_internal(&session)?;
        
        // Add to pool for future use
        let _ = self.connection_pool.add_connection(&server.id, session, tcp);
        
        Ok(info)
    }

    /// Internal method to get server info from an authenticated session
    fn get_server_info_internal(&self, session: &ssh2::Session) -> Result<ServerInfo> {
        let mut channel = session.channel_session()
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to open channel: {}", e)))?;
        
        // Execute command to get OS, hostname, and kernel info
        channel.exec("uname -s && hostname && uname -r")
            .map_err(|e| AppError::CommandFailed(format!("Failed to execute command: {}", e)))?;
        
        let mut output = String::new();
        channel.read_to_string(&mut output)
            .map_err(|e| AppError::CommandFailed(format!("Failed to read output: {}", e)))?;
        
        channel.wait_close()
            .map_err(|e| AppError::CommandFailed(format!("Failed to close channel: {}", e)))?;

        let lines: Vec<&str> = output.trim().lines().collect();
        
        Ok(ServerInfo {
            os: lines.first().unwrap_or(&"Unknown").to_string(),
            hostname: lines.get(1).unwrap_or(&"Unknown").to_string(),
            kernel: lines.get(2).unwrap_or(&"Unknown").to_string(),
        })
    }

    /// Execute a command on the remote server
    /// 
    /// # Arguments
    /// * `server` - The server to execute the command on
    /// * `command` - The command to execute
    /// * `timeout_secs` - Optional timeout in seconds (default: 60)
    /// 
    /// # Returns
    /// CommandOutput containing stdout, stderr, exit code, and duration
    pub fn execute_command(
        &self, 
        server: &Server, 
        command: &str, 
        timeout_secs: Option<u64>
    ) -> Result<CommandOutput> {
        let cancel_flag = Arc::new(AtomicBool::new(false));
        self.execute_command_with_cancel(server, command, timeout_secs, cancel_flag)
    }

    /// Execute a command with cancellation support
    /// 
    /// # Arguments
    /// * `server` - The server to execute the command on
    /// * `command` - The command to execute
    /// * `timeout_secs` - Optional timeout in seconds (default: 60)
    /// * `cancel_flag` - Atomic flag that can be set to cancel the command
    pub fn execute_command_with_cancel(
        &self,
        server: &Server,
        command: &str,
        timeout_secs: Option<u64>,
        cancel_flag: Arc<AtomicBool>,
    ) -> Result<CommandOutput> {
        let start = Instant::now();
        let timeout = Duration::from_secs(timeout_secs.unwrap_or(DEFAULT_COMMAND_TIMEOUT_SECS));

        // Create new connection for command execution
        let (session, _tcp) = create_ssh_session(&server.host, server.port)?;
        authenticate_session(&session, server, &self.credential_store)?;

        // Set session to non-blocking for timeout/cancel support
        session.set_blocking(false);

        let mut channel = session.channel_session()
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to open channel: {}", e)))?;
        
        channel.exec(command)
            .map_err(|e| AppError::CommandFailed(format!("Failed to execute command: {}", e)))?;

        // Read output with timeout and cancellation checks
        let mut stdout = Vec::new();
        let mut stderr = Vec::new();
        let mut buf = [0u8; 4096];

        loop {
            // Check for cancellation
            if cancel_flag.load(Ordering::Relaxed) {
                channel.send_eof().ok();
                channel.close().ok();
                return Err(AppError::CommandFailed("Command cancelled by user".to_string()));
            }

            // Check for timeout
            if start.elapsed() > timeout {
                channel.send_eof().ok();
                channel.close().ok();
                return Err(AppError::CommandFailed(format!(
                    "Command timed out after {} seconds",
                    timeout.as_secs()
                )));
            }

            // Try to read stdout
            match channel.read(&mut buf) {
                Ok(0) => break, // EOF
                Ok(n) => stdout.extend_from_slice(&buf[..n]),
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    // No data available, check stderr
                }
                Err(e) => {
                    return Err(AppError::CommandFailed(format!("Failed to read stdout: {}", e)));
                }
            }

            // Try to read stderr
            match channel.stderr().read(&mut buf) {
                Ok(0) => {} // EOF on stderr
                Ok(n) => stderr.extend_from_slice(&buf[..n]),
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    // No data available
                }
                Err(e) => {
                    return Err(AppError::CommandFailed(format!("Failed to read stderr: {}", e)));
                }
            }

            // Check if channel is at EOF
            if channel.eof() {
                break;
            }

            // Small sleep to prevent busy-waiting
            thread::sleep(Duration::from_millis(10));
        }

        // Set back to blocking for cleanup
        session.set_blocking(true);

        channel.wait_close()
            .map_err(|e| AppError::CommandFailed(format!("Failed to close channel: {}", e)))?;

        let exit_code = channel.exit_status()
            .map_err(|e| AppError::CommandFailed(format!("Failed to get exit status: {}", e)))?;

        let duration = start.elapsed();

        Ok(CommandOutput {
            stdout: String::from_utf8_lossy(&stdout).to_string(),
            stderr: String::from_utf8_lossy(&stderr).to_string(),
            exit_code,
            duration_ms: duration.as_millis() as u64,
        })
    }

    /// Execute a command with auto-reconnect on failure
    /// 
    /// If the command fails due to connection issues, this method will
    /// attempt to reconnect using exponential backoff before retrying.
    pub fn execute_command_with_retry(
        &self,
        server: &Server,
        command: &str,
        timeout_secs: Option<u64>,
    ) -> Result<CommandOutput> {
        let mut last_error = None;

        for attempt in 0..MAX_RETRY_ATTEMPTS {
            if attempt > 0 {
                // Remove stale connection and wait before retry
                self.connection_pool.remove_connection(&server.id);
                let delay = calculate_backoff_delay(attempt);
                thread::sleep(delay);
            }

            match self.execute_command(server, command, timeout_secs) {
                Ok(output) => return Ok(output),
                Err(AppError::ConnectionFailed(msg)) => {
                    last_error = Some(AppError::ConnectionFailed(msg));
                    // Connection failed, will retry
                }
                Err(AppError::AuthenticationFailed(msg)) => {
                    // Auth failures shouldn't be retried
                    return Err(AppError::AuthenticationFailed(msg));
                }
                Err(e) => {
                    // Other errors, try to retry
                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| {
            AppError::CommandFailed("Command failed after max retries".to_string())
        }))
    }

    /// Create a cancellation flag for use with execute_command_with_cancel
    pub fn create_cancel_flag() -> Arc<AtomicBool> {
        Arc::new(AtomicBool::new(false))
    }
}

/// Calculate exponential backoff delay for retry attempt
/// 
/// Uses the formula: base_delay * 2^attempt
/// For attempt 0: 1000ms, attempt 1: 2000ms, attempt 2: 4000ms
pub fn calculate_backoff_delay(attempt: u32) -> Duration {
    let delay_ms = BASE_RETRY_DELAY_MS * (1 << attempt.min(10)); // Cap at 2^10 to prevent overflow
    Duration::from_millis(delay_ms)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_backoff_delay() {
        // Attempt 0: 1000ms
        assert_eq!(calculate_backoff_delay(0), Duration::from_millis(1000));
        // Attempt 1: 2000ms
        assert_eq!(calculate_backoff_delay(1), Duration::from_millis(2000));
        // Attempt 2: 4000ms
        assert_eq!(calculate_backoff_delay(2), Duration::from_millis(4000));
        // Attempt 3: 8000ms
        assert_eq!(calculate_backoff_delay(3), Duration::from_millis(8000));
    }

    #[test]
    fn test_backoff_delay_exponential_growth() {
        // Verify that each delay is greater than the previous (exponential growth)
        for i in 0..MAX_RETRY_ATTEMPTS - 1 {
            let delay_n = calculate_backoff_delay(i);
            let delay_n_plus_1 = calculate_backoff_delay(i + 1);
            assert!(delay_n_plus_1 > delay_n, 
                "Delay at attempt {} ({:?}) should be greater than delay at attempt {} ({:?})",
                i + 1, delay_n_plus_1, i, delay_n);
        }
    }

    #[test]
    fn test_create_cancel_flag() {
        let flag = SshClient::create_cancel_flag();
        assert!(!flag.load(Ordering::Relaxed));
        flag.store(true, Ordering::Relaxed);
        assert!(flag.load(Ordering::Relaxed));
    }
}
