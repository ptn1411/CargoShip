use crate::error::{AppError, Result};
use crate::server::{AuthMethod, Server};
use crate::credentials::CredentialStore;
use ssh2::Session;
use std::collections::HashMap;
use std::net::TcpStream;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

/// Represents a pooled SSH connection with metadata for management
pub struct PooledConnection {
    pub session: Session,
    #[allow(dead_code)]
    tcp_stream: TcpStream, // Keep TCP stream alive
    pub created_at: Instant,
    pub last_used: Instant,
    pub in_use: bool,
}

impl PooledConnection {
    /// Check if the connection is still alive by testing the session
    pub fn is_alive(&self) -> bool {
        // Check if session is authenticated (basic health check)
        self.session.authenticated()
    }
}

/// Connection pool for managing SSH connections with reuse and limits
/// 
/// The pool maintains a configurable maximum number of connections and
/// supports connection reuse to avoid repeated authentication overhead.
pub struct ConnectionPool {
    connections: RwLock<HashMap<String, PooledConnection>>,
    max_connections: usize,
}

impl ConnectionPool {
    /// Create a new connection pool with specified maximum connections
    pub fn new(max_connections: usize) -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
            max_connections,
        }
    }

    /// Get the current number of connections in the pool
    pub fn connection_count(&self) -> usize {
        self.connections.read().unwrap().len()
    }

    /// Get the maximum number of connections allowed
    pub fn max_connections(&self) -> usize {
        self.max_connections
    }

    /// Try to get an existing connection from the pool
    /// Returns the session if available and marks it as in use
    pub fn get_connection(&self, server_id: &str) -> Option<bool> {
        let mut connections = self.connections.write().unwrap();
        if let Some(conn) = connections.get_mut(server_id) {
            if !conn.in_use && conn.is_alive() {
                conn.last_used = Instant::now();
                conn.in_use = true;
                return Some(true);
            }
        }
        None
    }

    /// Check if a connection exists for the given server
    pub fn has_connection(&self, server_id: &str) -> bool {
        let connections = self.connections.read().unwrap();
        if let Some(conn) = connections.get(server_id) {
            conn.is_alive()
        } else {
            false
        }
    }

    /// Check if we can add a new connection (haven't reached max)
    pub fn can_add_connection(&self) -> bool {
        self.connections.read().unwrap().len() < self.max_connections
    }

    /// Add a new connection to the pool
    /// If pool is full, removes the oldest unused connection first
    pub fn add_connection(&self, server_id: &str, session: Session, tcp_stream: TcpStream) -> Result<()> {
        let mut connections = self.connections.write().unwrap();
        
        // If connection already exists for this server, remove it first
        connections.remove(server_id);
        
        if connections.len() >= self.max_connections {
            // Try to remove oldest unused connection
            let oldest_unused = connections
                .iter()
                .filter(|(_, conn)| !conn.in_use)
                .min_by_key(|(_, conn)| conn.last_used)
                .map(|(k, _)| k.clone());
            
            if let Some(key) = oldest_unused {
                connections.remove(&key);
            } else {
                // All connections are in use
                return Err(AppError::ConnectionPoolExhausted(self.max_connections));
            }
        }

        let now = Instant::now();
        connections.insert(
            server_id.to_string(),
            PooledConnection {
                session,
                tcp_stream,
                created_at: now,
                last_used: now,
                in_use: false,
            },
        );
        Ok(())
    }

    /// Release a connection back to the pool (mark as not in use)
    pub fn release_connection(&self, server_id: &str) {
        let mut connections = self.connections.write().unwrap();
        if let Some(conn) = connections.get_mut(server_id) {
            conn.in_use = false;
            conn.last_used = Instant::now();
        }
    }

    /// Remove a connection from the pool entirely
    pub fn remove_connection(&self, server_id: &str) {
        let mut connections = self.connections.write().unwrap();
        connections.remove(server_id);
    }

    /// Close all connections and clear the pool
    pub fn close_all(&self) {
        let mut connections = self.connections.write().unwrap();
        connections.clear();
    }

    /// Remove stale connections that haven't been used for the specified duration
    pub fn cleanup_stale(&self, max_idle: Duration) {
        let mut connections = self.connections.write().unwrap();
        let now = Instant::now();
        connections.retain(|_, conn| {
            !conn.in_use || now.duration_since(conn.last_used) < max_idle
        });
    }

    /// Get a reference to the session for a server (for executing commands)
    /// This borrows the session without taking ownership
    pub fn with_session<F, T>(&self, server_id: &str, f: F) -> Option<T>
    where
        F: FnOnce(&Session) -> T,
    {
        let connections = self.connections.read().unwrap();
        connections.get(server_id).map(|conn| f(&conn.session))
    }
}

impl Default for ConnectionPool {
    fn default() -> Self {
        Self::new(10) // Default max 10 connections as per requirements
    }
}

/// Create a new SSH session and perform handshake
pub fn create_ssh_session(host: &str, port: u16) -> Result<(Session, TcpStream)> {
    let addr = format!("{}:{}", host, port);
    let tcp = TcpStream::connect(&addr)
        .map_err(|e| AppError::ConnectionFailed(format!("Failed to connect to {}: {}", addr, e)))?;
    
    // Set timeouts for the TCP stream
    tcp.set_read_timeout(Some(Duration::from_secs(30)))
        .map_err(|e| AppError::ConnectionFailed(format!("Failed to set read timeout: {}", e)))?;
    tcp.set_write_timeout(Some(Duration::from_secs(30)))
        .map_err(|e| AppError::ConnectionFailed(format!("Failed to set write timeout: {}", e)))?;

    let mut session = Session::new()
        .map_err(|e| AppError::ConnectionFailed(format!("Failed to create SSH session: {}", e)))?;
    
    session.set_tcp_stream(tcp.try_clone()
        .map_err(|e| AppError::ConnectionFailed(format!("Failed to clone TCP stream: {}", e)))?);
    session.handshake()
        .map_err(|e| AppError::ConnectionFailed(format!("SSH handshake failed: {}", e)))?;

    Ok((session, tcp))
}

/// Authenticate an SSH session using the provided server credentials
pub fn authenticate_session(
    session: &Session,
    server: &Server,
    credential_store: &Arc<CredentialStore>,
) -> Result<()> {
    match server.auth_method {
        AuthMethod::Password => {
            let password = credential_store.retrieve_password(&server.id)?;
            session.userauth_password(&server.username, &password)
                .map_err(|e| AppError::AuthenticationFailed(format!("Password authentication failed: {}", e)))?;
        }
        AuthMethod::SshKey => {
            let key_path = credential_store.retrieve_key_path(&server.id)?;
            let key_path_obj = std::path::Path::new(&key_path);
            
            // Validate key file exists
            if !key_path_obj.exists() {
                return Err(AppError::AuthenticationFailed(format!(
                    "SSH key file not found: {}", key_path
                )));
            }
            
            let passphrase = credential_store.retrieve_key_passphrase(&server.id)?;
            
            // Try to load and parse the key using our key_utils
            match crate::ssh::load_private_key(key_path_obj, passphrase.as_deref()) {
                Ok(loaded_key) => {
                    // Check if it's Ed25519 - libssh2 on Windows doesn't support it natively
                    if loaded_key.key_type == crate::ssh::KeyType::Ed25519 {
                        // Auto-add key to ssh-agent
                        crate::ssh::ensure_key_in_agent(key_path_obj, passphrase.as_deref())?;
                        
                        // Try ssh-agent authentication
                        if let Ok(mut agent) = session.agent() {
                            if agent.connect().is_ok() {
                                if agent.list_identities().is_ok() {
                                    for identity in agent.identities().unwrap_or_default() {
                                        if agent.userauth(&server.username, &identity).is_ok() {
                                            return Ok(());
                                        }
                                    }
                                }
                            }
                        }
                        
                        // If ssh-agent doesn't work, provide helpful error
                        return Err(AppError::AuthenticationFailed(
                            "Ed25519 key authentication failed. SSH Agent may not be running.\n\
                            Please run in PowerShell (Admin):\n\
                            Set-Service ssh-agent -StartupType Automatic\n\
                            Start-Service ssh-agent\n\n\
                            Then restart the application.".to_string()
                        ));
                    }
                    
                    // For RSA/ECDSA keys, write to temp file and authenticate
                    let temp_key = crate::ssh::write_temp_key(&loaded_key).map_err(|e| {
                        AppError::AuthenticationFailed(format!(
                            "Failed to prepare key for authentication: {}", e
                        ))
                    })?;
                    
                    session.userauth_pubkey_file(
                        &server.username,
                        None,
                        temp_key.path(),
                        None,
                    ).map_err(|e| {
                        AppError::AuthenticationFailed(format!(
                            "SSH key authentication failed: {}. Key type: {:?}",
                            e, loaded_key.key_type
                        ))
                    })?;
                }
                Err(e) => {
                    // If key parsing fails, try direct file-based auth as fallback
                    let fallback_result = session.userauth_pubkey_file(
                        &server.username,
                        None,
                        key_path_obj,
                        passphrase.as_deref(),
                    );
                    
                    if fallback_result.is_err() {
                        return Err(e);
                    }
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_connection_pool_new() {
        let pool = ConnectionPool::new(5);
        assert_eq!(pool.max_connections(), 5);
        assert_eq!(pool.connection_count(), 0);
    }

    #[test]
    fn test_connection_pool_default() {
        let pool = ConnectionPool::default();
        assert_eq!(pool.max_connections(), 10);
    }

    #[test]
    fn test_can_add_connection() {
        let pool = ConnectionPool::new(2);
        assert!(pool.can_add_connection());
    }

    #[test]
    fn test_has_connection_empty() {
        let pool = ConnectionPool::new(5);
        assert!(!pool.has_connection("server1"));
    }

    #[test]
    fn test_release_nonexistent_connection() {
        let pool = ConnectionPool::new(5);
        // Should not panic
        pool.release_connection("nonexistent");
    }

    #[test]
    fn test_close_all() {
        let pool = ConnectionPool::new(5);
        pool.close_all();
        assert_eq!(pool.connection_count(), 0);
    }
}
