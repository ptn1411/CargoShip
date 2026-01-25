use super::models::*;
use super::pool::{authenticate_session, create_ssh_session, ConnectionPool};
use crate::credentials::CredentialStore;
use crate::error::{AppError, Result};
use crate::server::Server;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

/// Default timeout for commands in seconds
const DEFAULT_COMMAND_TIMEOUT_SECS: u64 = 60;

/// Maximum number of retry attempts for auto-reconnect
const MAX_RETRY_ATTEMPTS: u32 = 3;

/// OPTIMIZED: Reduced base delay from 1000ms to 300ms
const BASE_RETRY_DELAY_MS: u64 = 300;

use crate::ssh::SshKeyManager;

/// SSH client for managing connections and executing commands on remote servers
pub struct SshClient {
    connection_pool: Arc<ConnectionPool>,
    credential_store: Arc<CredentialStore>,
    ssh_key_manager: Arc<SshKeyManager>,
}

impl SshClient {
    pub fn new(
        connection_pool: Arc<ConnectionPool>,
        credential_store: Arc<CredentialStore>,
        ssh_key_manager: Arc<SshKeyManager>,
    ) -> Self {
        Self {
            connection_pool,
            credential_store,
            ssh_key_manager,
        }
    }

    pub fn connection_pool(&self) -> &Arc<ConnectionPool> {
        &self.connection_pool
    }

    /// OPTIMIZED: Faster test connection with early exit on success
    pub fn test_connection(&self, server: &Server) -> Result<ConnectionStatus> {
        let start = Instant::now();

        // Try to create SSH session with optimized timeouts
        let (session, tcp) = match create_ssh_session(&server.host, server.port) {
            Ok(s) => s,
            Err(e) => {
                return Ok(ConnectionStatus {
                    connected: false,
                    server_info: None,
                    error: Some(e.to_string()),
                    latency_ms: Some(start.elapsed().as_millis() as u64),
                });
            }
        };

        // Authenticate
        if let Err(e) = authenticate_session(
            &session,
            server,
            &self.credential_store,
            Some(&self.ssh_key_manager),
        ) {
            return Ok(ConnectionStatus {
                connected: false,
                server_info: None,
                error: Some(e.to_string()),
                latency_ms: Some(start.elapsed().as_millis() as u64),
            });
        }

        let latency = start.elapsed().as_millis() as u64;

        // OPTIMIZATION: Get server info in parallel or skip if not needed
        let server_info = self.get_server_info_internal(&session).ok();

        // Add connection to pool for reuse
        let _ = self
            .connection_pool
            .add_connection(&server.id, session, tcp);

        Ok(ConnectionStatus {
            connected: true,
            server_info,
            error: None,
            latency_ms: Some(latency),
        })
    }

    /// OPTIMIZED: Faster retry with jitter to avoid thundering herd
    pub fn test_connection_with_retry(&self, server: &Server) -> Result<ConnectionStatus> {
        let mut last_error = None;

        for attempt in 0..MAX_RETRY_ATTEMPTS {
            if attempt > 0 {
                // Add jitter to prevent multiple clients from retrying simultaneously
                let delay = calculate_backoff_delay_with_jitter(attempt);
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

    /// Get server information from a connected server
    pub fn get_server_info(&self, server: &Server) -> Result<ServerInfo> {
        // Try to use existing connection from pool
        if self.connection_pool.has_connection(&server.id) {
            if let Some(info) = self
                .connection_pool
                .with_session(&server.id, |session| self.get_server_info_internal(session))
            {
                if let Ok(info) = info {
                    return Ok(info);
                }
            }
        }

        // Create new connection
        let (session, tcp) = create_ssh_session(&server.host, server.port)?;
        authenticate_session(
            &session,
            server,
            &self.credential_store,
            Some(&self.ssh_key_manager),
        )?;

        let info = self.get_server_info_internal(&session)?;

        let _ = self
            .connection_pool
            .add_connection(&server.id, session, tcp);

        Ok(info)
    }

    /// Internal method to get server info from an authenticated session
    fn get_server_info_internal(&self, session: &ssh2::Session) -> Result<ServerInfo> {
        let mut channel = session
            .channel_session()
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to open channel: {}", e)))?;

        channel
            .exec("uname -s && hostname && uname -r")
            .map_err(|e| AppError::CommandFailed(format!("Failed to execute command: {}", e)))?;

        let mut output = String::new();
        channel
            .read_to_string(&mut output)
            .map_err(|e| AppError::CommandFailed(format!("Failed to read output: {}", e)))?;

        channel
            .wait_close()
            .map_err(|e| AppError::CommandFailed(format!("Failed to close channel: {}", e)))?;

        let lines: Vec<&str> = output.trim().lines().collect();

        Ok(ServerInfo {
            os: lines.first().unwrap_or(&"Unknown").to_string(),
            hostname: lines.get(1).unwrap_or(&"Unknown").to_string(),
            kernel: lines.get(2).unwrap_or(&"Unknown").to_string(),
        })
    }

    pub fn execute_command(
        &self,
        server: &Server,
        command: &str,
        timeout_secs: Option<u64>,
    ) -> Result<CommandOutput> {
        let cancel_flag = Arc::new(AtomicBool::new(false));
        // execute_command uses timeout (for conditions, quick checks)
        self.execute_command_internal(server, command, timeout_secs, cancel_flag, true)
    }

    pub fn execute_command_with_cancel(
        &self,
        server: &Server,
        command: &str,
        timeout_secs: Option<u64>,
        cancel_flag: Arc<AtomicBool>,
    ) -> Result<CommandOutput> {
        // Use timeout if provided, otherwise wait indefinitely
        // For script steps, timeout is optional safety net
        self.execute_command_internal(
            server,
            command,
            timeout_secs,
            cancel_flag,
            timeout_secs.is_some(),
        )
    }

    fn execute_command_internal(
        &self,
        server: &Server,
        command: &str,
        timeout_secs: Option<u64>,
        cancel_flag: Arc<AtomicBool>,
        use_timeout: bool,
    ) -> Result<CommandOutput> {
        let start = Instant::now();
        let timeout = Duration::from_secs(timeout_secs.unwrap_or(DEFAULT_COMMAND_TIMEOUT_SECS));

        let (session, _tcp) = create_ssh_session(&server.host, server.port)?;
        authenticate_session(
            &session,
            server,
            &self.credential_store,
            Some(&self.ssh_key_manager),
        )?;

        let mut channel = session
            .channel_session()
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to open channel: {}", e)))?;

        channel
            .exec(command)
            .map_err(|e| AppError::CommandFailed(format!("Failed to execute command: {}", e)))?;

        session.set_blocking(false);

        let mut stdout = Vec::new();
        let mut stderr = Vec::new();
        let mut buf = [0u8; 4096];

        loop {
            // Check for user cancellation
            if cancel_flag.load(Ordering::Relaxed) {
                channel.send_eof().ok();
                channel.close().ok();
                return Err(AppError::CommandFailed(
                    "Command cancelled by user".to_string(),
                ));
            }

            // Check timeout only if use_timeout is true
            if use_timeout && start.elapsed() > timeout {
                channel.send_eof().ok();
                channel.close().ok();
                return Err(AppError::CommandFailed(format!(
                    "Command timed out after {} seconds",
                    timeout.as_secs()
                )));
            }

            match channel.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => stdout.extend_from_slice(&buf[..n]),
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(e) => {
                    return Err(AppError::CommandFailed(format!(
                        "Failed to read stdout: {}",
                        e
                    )));
                }
            }

            match channel.stderr().read(&mut buf) {
                Ok(0) => {}
                Ok(n) => stderr.extend_from_slice(&buf[..n]),
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(e) => {
                    return Err(AppError::CommandFailed(format!(
                        "Failed to read stderr: {}",
                        e
                    )));
                }
            }

            if channel.eof() {
                break;
            }

            thread::sleep(Duration::from_millis(10));
        }

        session.set_blocking(true);

        channel
            .wait_close()
            .map_err(|e| AppError::CommandFailed(format!("Failed to close channel: {}", e)))?;

        let exit_code = channel
            .exit_status()
            .map_err(|e| AppError::CommandFailed(format!("Failed to get exit status: {}", e)))?;

        let duration = start.elapsed();

        Ok(CommandOutput {
            stdout: String::from_utf8_lossy(&stdout).to_string(),
            stderr: String::from_utf8_lossy(&stderr).to_string(),
            exit_code,
            duration_ms: duration.as_millis() as u64,
        })
    }

    pub fn execute_command_with_retry(
        &self,
        server: &Server,
        command: &str,
        timeout_secs: Option<u64>,
    ) -> Result<CommandOutput> {
        let mut last_error = None;

        for attempt in 0..MAX_RETRY_ATTEMPTS {
            if attempt > 0 {
                self.connection_pool.remove_connection(&server.id);
                let delay = calculate_backoff_delay_with_jitter(attempt);
                thread::sleep(delay);
            }

            match self.execute_command(server, command, timeout_secs) {
                Ok(output) => return Ok(output),
                Err(AppError::ConnectionFailed(msg)) => {
                    last_error = Some(AppError::ConnectionFailed(msg));
                }
                Err(AppError::AuthenticationFailed(msg)) => {
                    return Err(AppError::AuthenticationFailed(msg));
                }
                Err(e) => {
                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| {
            AppError::CommandFailed("Command failed after max retries".to_string())
        }))
    }

    pub fn create_cancel_flag() -> Arc<AtomicBool> {
        Arc::new(AtomicBool::new(false))
    }
}

/// OPTIMIZED: Calculate backoff delay with reduced base time
pub fn calculate_backoff_delay(attempt: u32) -> Duration {
    let delay_ms = BASE_RETRY_DELAY_MS * (1 << attempt.min(10));
    Duration::from_millis(delay_ms)
}

/// OPTIMIZED: Add jitter to prevent thundering herd problem
pub fn calculate_backoff_delay_with_jitter(attempt: u32) -> Duration {
    use rand::Rng;
    let base_delay = calculate_backoff_delay(attempt);
    let jitter_ms = rand::thread_rng().gen_range(0..=100); // 0-100ms jitter
    base_delay + Duration::from_millis(jitter_ms)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_backoff_delay() {
        // Attempt 0: 300ms (reduced from 1000ms)
        assert_eq!(calculate_backoff_delay(0), Duration::from_millis(300));
        // Attempt 1: 600ms
        assert_eq!(calculate_backoff_delay(1), Duration::from_millis(600));
        // Attempt 2: 1200ms
        assert_eq!(calculate_backoff_delay(2), Duration::from_millis(1200));
    }

    #[test]
    fn test_backoff_delay_exponential_growth() {
        for i in 0..MAX_RETRY_ATTEMPTS - 1 {
            let delay_n = calculate_backoff_delay(i);
            let delay_n_plus_1 = calculate_backoff_delay(i + 1);
            assert!(delay_n_plus_1 > delay_n);
        }
    }

    #[test]
    fn test_create_cancel_flag() {
        let flag = SshClient::create_cancel_flag();
        assert!(!flag.load(Ordering::Relaxed));
        flag.store(true, Ordering::Relaxed);
        assert!(flag.load(Ordering::Relaxed));
    }

    #[test]
    fn test_backoff_with_jitter() {
        let delay1 = calculate_backoff_delay_with_jitter(0);
        let delay2 = calculate_backoff_delay_with_jitter(0);
        // Jitter should make delays slightly different
        let base = calculate_backoff_delay(0);
        assert!(delay1 >= base && delay1 <= base + Duration::from_millis(100));
        assert!(delay2 >= base && delay2 <= base + Duration::from_millis(100));
    }
}
