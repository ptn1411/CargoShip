use crate::error::{AppError, Result};
use crate::server::{AuthMethod, Server};
use crate::credentials::CredentialStore;
use ssh2::Session;
use std::collections::HashMap;
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

/// Represents a pooled SSH connection with metadata for management
pub struct PooledConnection {
    pub session: Session,
    #[allow(dead_code)]
    tcp_stream: TcpStream,
    pub created_at: Instant,
    pub last_used: Instant,
    pub in_use: bool,
}

impl PooledConnection {
    /// Check if the connection is still alive by testing the session
    pub fn is_alive(&self) -> bool {
        self.session.authenticated()
    }
}

/// Connection pool for managing SSH connections with reuse and limits
pub struct ConnectionPool {
    connections: RwLock<HashMap<String, PooledConnection>>,
    max_connections: usize,
}

impl ConnectionPool {
    pub fn new(max_connections: usize) -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
            max_connections,
        }
    }

    pub fn connection_count(&self) -> usize {
        self.connections.read().unwrap().len()
    }

    pub fn max_connections(&self) -> usize {
        self.max_connections
    }

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

    pub fn has_connection(&self, server_id: &str) -> bool {
        let connections = self.connections.read().unwrap();
        if let Some(conn) = connections.get(server_id) {
            conn.is_alive()
        } else {
            false
        }
    }

    pub fn can_add_connection(&self) -> bool {
        self.connections.read().unwrap().len() < self.max_connections
    }

    pub fn add_connection(&self, server_id: &str, session: Session, tcp_stream: TcpStream) -> Result<()> {
        let mut connections = self.connections.write().unwrap();
        
        connections.remove(server_id);
        
        if connections.len() >= self.max_connections {
            let oldest_unused = connections
                .iter()
                .filter(|(_, conn)| !conn.in_use)
                .min_by_key(|(_, conn)| conn.last_used)
                .map(|(k, _)| k.clone());
            
            if let Some(key) = oldest_unused {
                connections.remove(&key);
            } else {
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

    pub fn release_connection(&self, server_id: &str) {
        let mut connections = self.connections.write().unwrap();
        if let Some(conn) = connections.get_mut(server_id) {
            conn.in_use = false;
            conn.last_used = Instant::now();
        }
    }

    pub fn remove_connection(&self, server_id: &str) {
        let mut connections = self.connections.write().unwrap();
        connections.remove(server_id);
    }

    pub fn close_all(&self) {
        let mut connections = self.connections.write().unwrap();
        connections.clear();
    }

    pub fn cleanup_stale(&self, max_idle: Duration) {
        let mut connections = self.connections.write().unwrap();
        let now = Instant::now();
        connections.retain(|_, conn| {
            !conn.in_use || now.duration_since(conn.last_used) < max_idle
        });
    }

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
        Self::new(10)
    }
}

/// OPTIMIZED: Create SSH session with faster timeouts
pub fn create_ssh_session(host: &str, port: u16) -> Result<(Session, TcpStream)> {
    let addr = format!("{}:{}", host, port);
    
    // OPTIMIZATION 1: Resolve DNS first with timeout
    let socket_addrs: Vec<_> = addr.to_socket_addrs()
        .map_err(|e| AppError::ConnectionFailed(format!("DNS resolution failed for {}: {}", addr, e)))?
        .collect();
    
    if socket_addrs.is_empty() {
        return Err(AppError::ConnectionFailed(format!("No addresses resolved for {}", addr)));
    }
    
    // OPTIMIZATION 2: Try connection with shorter timeout (5 seconds instead of default)
    let tcp = connect_with_timeout(&socket_addrs[0], Duration::from_secs(5))
        .map_err(|e| AppError::ConnectionFailed(format!("Failed to connect to {}: {}", addr, e)))?;
    
    // OPTIMIZATION 3: Reduce read/write timeouts from 30s to 10s
    tcp.set_read_timeout(Some(Duration::from_secs(10)))
        .map_err(|e| AppError::ConnectionFailed(format!("Failed to set read timeout: {}", e)))?;
    tcp.set_write_timeout(Some(Duration::from_secs(10)))
        .map_err(|e| AppError::ConnectionFailed(format!("Failed to set write timeout: {}", e)))?;
    
    // OPTIMIZATION 4: Enable TCP_NODELAY to reduce latency
    tcp.set_nodelay(true)
        .map_err(|e| AppError::ConnectionFailed(format!("Failed to set TCP_NODELAY: {}", e)))?;

    let mut session = Session::new()
        .map_err(|e| AppError::ConnectionFailed(format!("Failed to create SSH session: {}", e)))?;
    
    session.set_tcp_stream(tcp.try_clone()
        .map_err(|e| AppError::ConnectionFailed(format!("Failed to clone TCP stream: {}", e)))?);
    
    // OPTIMIZATION 5: Set SSH timeout before handshake
    session.set_timeout(8000); // 8 seconds in milliseconds
    
    session.handshake()
        .map_err(|e| AppError::ConnectionFailed(format!("SSH handshake failed: {}", e)))?;

    Ok((session, tcp))
}

/// Helper function to connect with explicit timeout
fn connect_with_timeout(addr: &std::net::SocketAddr, timeout: Duration) -> std::io::Result<TcpStream> {
    use std::net::TcpStream;
    
    // Platform-specific connection with timeout
    #[cfg(unix)]
    {
        use std::os::unix::io::AsRawFd;
        use nix::sys::socket::{connect, SockaddrStorage};
        use nix::fcntl::{fcntl, FcntlArg, OFlag};
        use std::os::unix::io::FromRawFd;
        
        let socket = socket2::Socket::new(
            if addr.is_ipv4() { socket2::Domain::IPV4 } else { socket2::Domain::IPV6 },
            socket2::Type::STREAM,
            Some(socket2::Protocol::TCP),
        )?;
        
        socket.set_nonblocking(true)?;
        
        match socket.connect_timeout(&(*addr).into(), timeout) {
            Ok(_) => {
                socket.set_nonblocking(false)?;
                Ok(socket.into())
            }
            Err(e) => Err(e),
        }
    }
    
    #[cfg(windows)]
    {
        let socket = socket2::Socket::new(
            if addr.is_ipv4() { socket2::Domain::IPV4 } else { socket2::Domain::IPV6 },
            socket2::Type::STREAM,
            Some(socket2::Protocol::TCP),
        )?;
        
        socket.connect_timeout(&(*addr).into(), timeout)?;
        Ok(socket.into())
    }
    
    #[cfg(not(any(unix, windows)))]
    {
        // Fallback for other platforms
        TcpStream::connect_timeout(addr, timeout)
    }
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
            
            if !key_path_obj.exists() {
                return Err(AppError::AuthenticationFailed(format!(
                    "SSH key file not found: {}", key_path
                )));
            }
            
            let passphrase = credential_store.retrieve_key_passphrase(&server.id)?;
            
            match crate::ssh::load_private_key(key_path_obj, passphrase.as_deref()) {
                Ok(loaded_key) => {
                    if loaded_key.key_type == crate::ssh::KeyType::Ed25519 {
                        crate::ssh::ensure_key_in_agent(key_path_obj, passphrase.as_deref())?;
                        
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
                        
                        return Err(AppError::AuthenticationFailed(
                            "Ed25519 key authentication failed. SSH Agent may not be running.\n\
                            Please run in PowerShell (Admin):\n\
                            Set-Service ssh-agent -StartupType Automatic\n\
                            Start-Service ssh-agent\n\n\
                            Then restart the application.".to_string()
                        ));
                    }
                    
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
}