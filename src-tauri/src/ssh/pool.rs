use crate::credentials::CredentialStore;
use crate::error::{AppError, Result};
use crate::server::{AuthMethod, Server};
use ssh2::Session;
use std::collections::HashMap;
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::{Duration, Instant};

/// Maximum number of connection retry attempts
const MAX_RETRY_ATTEMPTS: u32 = 3;
/// Delay between retry attempts in milliseconds
const RETRY_DELAY_MS: u64 = 500;

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

    pub fn add_connection(
        &self,
        server_id: &str,
        session: Session,
        tcp_stream: TcpStream,
    ) -> Result<()> {
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
        connections.retain(|_, conn| !conn.in_use || now.duration_since(conn.last_used) < max_idle);
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
    let socket_addrs: Vec<_> = addr
        .to_socket_addrs()
        .map_err(|e| {
            AppError::ConnectionFailed(format!("DNS resolution failed for {}: {}", addr, e))
        })?
        .collect();

    if socket_addrs.is_empty() {
        return Err(AppError::ConnectionFailed(format!(
            "No addresses resolved for {}",
            addr
        )));
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

    session.set_tcp_stream(
        tcp.try_clone().map_err(|e| {
            AppError::ConnectionFailed(format!("Failed to clone TCP stream: {}", e))
        })?,
    );

    // OPTIMIZATION 5: Set SSH timeout before handshake
    session.set_timeout(10000); // 10 seconds in milliseconds

    // Try handshake with different algorithm configurations
    let handshake_result = try_handshake_with_algorithms(&mut session);

    if let Err(e) = handshake_result {
        return Err(AppError::ConnectionFailed(format!(
            "SSH handshake failed: {}. \n\nPossible solutions:\n\
            1. Check if the server is reachable\n\
            2. On server, add to /etc/ssh/sshd_config:\n   \
               KexAlgorithms +diffie-hellman-group14-sha1,diffie-hellman-group-exchange-sha256\n\
            3. Restart SSH: sudo systemctl restart sshd",
            e
        )));
    }

    Ok((session, tcp))
}

/// Try handshake with different algorithm configurations
fn try_handshake_with_algorithms(session: &mut Session) -> std::result::Result<(), String> {
    // Algorithm preference sets to try (from most compatible to most secure)
    let kex_algorithms = [
        // Try 1: Modern algorithms first
        "curve25519-sha256,curve25519-sha256@libssh.org,ecdh-sha2-nistp256,ecdh-sha2-nistp384,diffie-hellman-group-exchange-sha256,diffie-hellman-group16-sha512,diffie-hellman-group14-sha256",
        // Try 2: Include older algorithms for compatibility
        "diffie-hellman-group-exchange-sha256,diffie-hellman-group14-sha256,diffie-hellman-group14-sha1,ecdh-sha2-nistp256,curve25519-sha256",
        // Try 3: Legacy algorithms for old servers
        "diffie-hellman-group14-sha1,diffie-hellman-group-exchange-sha1,diffie-hellman-group1-sha1",
    ];

    let host_key_algorithms =
        "ssh-ed25519,ecdsa-sha2-nistp256,ecdsa-sha2-nistp384,rsa-sha2-512,rsa-sha2-256,ssh-rsa";
    let cipher_algorithms = "aes256-ctr,aes192-ctr,aes128-ctr,aes256-cbc,aes192-cbc,aes128-cbc,chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com";

    let mut last_error = String::new();

    for (i, kex) in kex_algorithms.iter().enumerate() {
        // Set algorithm preferences (ignore errors - not all algorithms may be supported)
        let _ = session.method_pref(ssh2::MethodType::Kex, kex);
        let _ = session.method_pref(ssh2::MethodType::HostKey, host_key_algorithms);
        let _ = session.method_pref(ssh2::MethodType::CryptCs, cipher_algorithms);
        let _ = session.method_pref(ssh2::MethodType::CryptSc, cipher_algorithms);

        match session.handshake() {
            Ok(_) => return Ok(()),
            Err(e) => {
                last_error = e.to_string();
                // Only retry if it's a key exchange error
                if !last_error.contains("Unable to exchange")
                    && !last_error.contains("key exchange")
                {
                    break;
                }
                // Log retry attempt (in debug builds)
                #[cfg(debug_assertions)]
                eprintln!(
                    "SSH handshake attempt {} failed: {}, trying next algorithm set...",
                    i + 1,
                    e
                );
            }
        }
    }

    // Final attempt without any preferences (let libssh2 decide)
    match session.handshake() {
        Ok(_) => Ok(()),
        Err(_) => Err(last_error),
    }
}

/// Create SSH session with automatic retry on transient failures
pub fn create_ssh_session_with_retry(host: &str, port: u16) -> Result<(Session, TcpStream)> {
    let mut last_error = None;

    for attempt in 1..=MAX_RETRY_ATTEMPTS {
        match create_ssh_session(host, port) {
            Ok(result) => return Ok(result),
            Err(e) => {
                let error_str = e.to_string();
                // Only retry on transient errors
                let is_transient = error_str.contains("Unable to exchange")
                    || error_str.contains("Connection reset")
                    || error_str.contains("Connection refused")
                    || error_str.contains("timed out")
                    || error_str.contains("temporarily unavailable");

                if !is_transient || attempt == MAX_RETRY_ATTEMPTS {
                    return Err(e);
                }

                last_error = Some(e);

                // Wait before retry with exponential backoff
                let delay = RETRY_DELAY_MS * (1 << (attempt - 1));
                thread::sleep(Duration::from_millis(delay));
            }
        }
    }

    Err(last_error.unwrap_or_else(|| {
        AppError::ConnectionFailed("Connection failed after retries".to_string())
    }))
}

/// Helper function to connect with explicit timeout
fn connect_with_timeout(
    addr: &std::net::SocketAddr,
    timeout: Duration,
) -> std::io::Result<TcpStream> {
    // Platform-specific connection with timeout
    #[cfg(unix)]
    {
        let socket = socket2::Socket::new(
            if addr.is_ipv4() {
                socket2::Domain::IPV4
            } else {
                socket2::Domain::IPV6
            },
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
            if addr.is_ipv4() {
                socket2::Domain::IPV4
            } else {
                socket2::Domain::IPV6
            },
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

use crate::ssh::SshKeyManager;

/// Get SSH key fingerprint for debugging
fn get_key_fingerprint(public_key_openssh: &str) -> String {
    use sha2::{Sha256, Digest};
    
    // Parse the public key to get the key data
    if let Ok(public_key) = ssh_key::PublicKey::from_openssh(public_key_openssh) {
        // Get the key data bytes
        let key_data = public_key.to_bytes().unwrap_or_default();
        
        // Calculate SHA256 fingerprint
        let mut hasher = Sha256::new();
        hasher.update(&key_data);
        let hash = hasher.finalize();
        
        // Format as SHA256:base64
        format!("SHA256:{}", base64::Engine::encode(&base64::engine::general_purpose::STANDARD, hash))
    } else {
        "Unable to calculate fingerprint".to_string()
    }
}

/// Authenticate an SSH session using the provided server credentials
pub fn authenticate_session(
    session: &Session,
    server: &Server,
    credential_store: &Arc<CredentialStore>,
    ssh_key_manager: Option<&SshKeyManager>,
) -> Result<()> {
    match server.auth_method {
        AuthMethod::Password => {
            let password = credential_store.retrieve_password(&server.id)?;
            session
                .userauth_password(&server.username, &password)
                .map_err(|e| {
                    AppError::AuthenticationFailed(format!("Password authentication failed: {}", e))
                })?;
        }
        AuthMethod::SshKey => {
            // Check if server has ssh_key_id (key from database)
            if let Some(key_id) = &server.ssh_key_id {
                if let Some(manager) = ssh_key_manager {
                    let private_key = manager.retrieve_private_key(key_id)?;
                    let passphrase = credential_store.retrieve_key_passphrase(&server.id)?;

                    authenticate_with_key_content(
                        session,
                        &server.username,
                        &private_key,
                        passphrase.as_deref(),
                    )?;
                    return Ok(());
                } else {
                    return Err(AppError::AuthenticationFailed(
                        "SSH Key Manager not available for database-stored key".to_string(),
                    ));
                }
            }

            // Otherwise, use the key_path from credential_store
            let key_path = credential_store.retrieve_key_path(&server.id)?;
            let key_path_obj = std::path::Path::new(&key_path);

            if !key_path_obj.exists() {
                return Err(AppError::AuthenticationFailed(format!(
                    "SSH key file not found: {}",
                    key_path
                )));
            }

            let passphrase = credential_store.retrieve_key_passphrase(&server.id)?;

            match crate::ssh::load_private_key(key_path_obj, passphrase.as_deref()) {
                Ok(loaded_key) => {
                    if loaded_key.key_type == crate::ssh::KeyType::Ed25519 {
                        // For Ed25519, ALWAYS try agent first on Windows
                        #[cfg(target_os = "windows")]
                        {
                            let agent_result = (|| -> Result<()> {
                                // Try to ensure key is in agent
                                let _ = crate::ssh::ensure_key_in_agent(key_path_obj, passphrase.as_deref());
                                
                                // Try agent authentication
                                let mut agent = session.agent().map_err(|e| {
                                    AppError::AuthenticationFailed(format!("Failed to connect to SSH agent: {}", e))
                                })?;
                                
                                agent.connect().map_err(|e| {
                                    AppError::AuthenticationFailed(format!("Failed to connect to SSH agent: {}", e))
                                })?;
                                
                                agent.list_identities().map_err(|e| {
                                    AppError::AuthenticationFailed(format!("Failed to list agent identities: {}", e))
                                })?;
                                
                                let identities = agent.identities().map_err(|e| {
                                    AppError::AuthenticationFailed(format!("Failed to get agent identities: {}", e))
                                })?;
                                
                                for identity in identities {
                                    if agent.userauth(&server.username, &identity).is_ok() {
                                        return Ok(());
                                    }
                                }
                                
                                Err(AppError::AuthenticationFailed(
                                    "No matching identity found in SSH agent".to_string()
                                ))
                            })();

                            if agent_result.is_ok() {
                                return Ok(());
                            }
                            
                            // If agent fails, return helpful error
                            return Err(AppError::AuthenticationFailed(format!(
                                "Ed25519 key authentication failed.\n\n\
                                Ed25519 keys require SSH Agent on Windows.\n\
                                Please add your key to the agent:\n\n\
                                1. Open PowerShell\n\
                                2. Run: ssh-add {}\n\
                                3. Enter your passphrase when prompted\n\
                                4. Retry the connection\n\n\
                                Agent error: {:?}",
                                key_path,
                                agent_result.err()
                            )));
                        }

                        #[cfg(not(target_os = "windows"))]
                        {
                            // On Unix, try agent first but fall through to file auth
                            let agent_auth_success = (|| -> Result<bool> {
                                crate::ssh::ensure_key_in_agent(key_path_obj, passphrase.as_deref())?;
                                if let Ok(mut agent) = session.agent() {
                                    if agent.connect().is_ok() && agent.list_identities().is_ok() {
                                        for identity in agent.identities().unwrap_or_default() {
                                            if agent.userauth(&server.username, &identity).is_ok() {
                                                return Ok(true);
                                            }
                                        }
                                    }
                                }
                                Ok(false)
                            })()
                            .unwrap_or(false);

                            if agent_auth_success {
                                return Ok(());
                            }
                        }
                    }

                    let temp_key = crate::ssh::write_temp_key(&loaded_key).map_err(|e| {
                        AppError::AuthenticationFailed(format!(
                            "Failed to prepare key for authentication: {}",
                            e
                        ))
                    })?;

                    // First, check what authentication methods are available
                    let auth_methods = session.auth_methods(&server.username).unwrap_or_default();
                    
                    if !auth_methods.contains("publickey") {
                        return Err(AppError::AuthenticationFailed(format!(
                            "Server does not support public key authentication. Available methods: {}",
                            auth_methods
                        )));
                    }

                    // Get public key fingerprint for debugging
                    let fingerprint = get_key_fingerprint(&loaded_key.public_key_openssh);

                    session
                        .userauth_pubkey_file(&server.username, None, temp_key.path(), None)
                        .map_err(|e| {
                            let error_msg = format!(
                                "SSH key authentication failed: {}. Key type: {:?}\n\n\
                                Possible causes:\n\
                                1. Public key not in server's ~/.ssh/authorized_keys\n\
                                2. Wrong username (current: {})\n\
                                3. Server SSH permissions issue (check ~/.ssh folder permissions)\n\
                                4. Key format incompatibility\n\n\
                                Debug info:\n\
                                - Key path: {}\n\
                                - Server auth methods: {}\n\
                                - Public key fingerprint: {}\n\n\
                                To verify, run on server:\n\
                                ssh-keygen -lf ~/.ssh/authorized_keys",
                                e, 
                                loaded_key.key_type,
                                server.username,
                                key_path,
                                auth_methods,
                                fingerprint
                            );
                            AppError::AuthenticationFailed(error_msg)
                        })?;
                }
                Err(e) => {
                    // Manual signing fallback for Ed25519 or if file load failed
                    // This handles cases where libssh2 cannot parse the key file directly
                    if passphrase.is_some() {
                        // If we have a passphrase and standard loading failed, likely we just can't read it
                        // Attempt to load purely in Rust
                        let content = std::fs::read_to_string(key_path_obj).map_err(|io_e| {
                            AppError::AuthenticationFailed(format!(
                                "Failed to read key file: {}",
                                io_e
                            ))
                        })?;
                        authenticate_with_key_content(
                            session,
                            &server.username,
                            &content,
                            passphrase.as_deref(),
                        )?;
                        return Ok(());
                    }

                    // Otherwise try standard fallback
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

/// Authenticate using SSH key content directly (from database)
pub fn authenticate_with_key_content(
    session: &Session,
    username: &str,
    private_key_pem: &str,
    passphrase: Option<&str>,
) -> Result<()> {
    use std::io::Write;

    // Parse the key to determine type
    let private_key = if let Some(pass) = passphrase.filter(|p| !p.is_empty()) {
        let encrypted_key =
            ssh_key::PrivateKey::from_openssh(private_key_pem.as_bytes()).map_err(|e| {
                AppError::AuthenticationFailed(format!("Failed to parse SSH key: {}", e))
            })?;
        encrypted_key.decrypt(pass.as_bytes()).map_err(|e| {
            AppError::AuthenticationFailed(format!("Failed to decrypt SSH key: {}", e))
        })?
    } else {
        ssh_key::PrivateKey::from_openssh(private_key_pem.as_bytes()).map_err(|e| {
            AppError::AuthenticationFailed(format!("Failed to parse SSH key: {}", e))
        })?
    };

    let key_type = match private_key.algorithm() {
        ssh_key::Algorithm::Ed25519 => crate::ssh::KeyType::Ed25519,
        ssh_key::Algorithm::Rsa { .. } => crate::ssh::KeyType::Rsa,
        ssh_key::Algorithm::Ecdsa { .. } => crate::ssh::KeyType::Ecdsa,
        _ => crate::ssh::KeyType::Unknown,
    };

    // Get unencrypted key in OpenSSH format
    let openssh_data = private_key
        .to_openssh(ssh_key::LineEnding::LF)
        .map_err(|e| AppError::AuthenticationFailed(format!("Failed to serialize key: {}", e)))?;

    let mut agent_error_msg = String::from("Not attempted");

    // For Ed25519, try SSH agent first
    if key_type == crate::ssh::KeyType::Ed25519 {
        let agent_result = (|| -> Result<bool> {
            // Write temp key for agent (agent needs a file path usually, unfortunately)
            let mut temp_file = tempfile::NamedTempFile::new().map_err(|e| {
                AppError::AuthenticationFailed(format!("Failed to create temp key file: {}", e))
            })?;
            temp_file.write_all(openssh_data.as_bytes()).map_err(|e| {
                AppError::AuthenticationFailed(format!("Failed to write temp key: {}", e))
            })?;
            temp_file.flush().map_err(|e| {
                AppError::AuthenticationFailed(format!("Failed to flush temp key: {}", e))
            })?;

            // Try to add key to agent
            crate::ssh::ensure_key_in_agent(temp_file.path(), None)?;

            // Try to authenticate using agent
            let mut agent = session.agent().map_err(|e| {
                AppError::AuthenticationFailed(format!("Failed to initialize SSH agent: {}", e))
            })?;
            
            agent.connect().map_err(|e| {
                AppError::AuthenticationFailed(format!("Failed to connect to SSH agent: {}", e))
            })?;
            
            agent.list_identities().map_err(|e| {
                AppError::AuthenticationFailed(format!("Failed to list agent identities: {}", e))
            })?;
            
            let identities = agent.identities().map_err(|e| {
                AppError::AuthenticationFailed(format!("Failed to get agent identities: {}", e))
            })?;
            
            if identities.is_empty() {
                return Err(AppError::AuthenticationFailed(
                    "No identities found in SSH agent after adding key".to_string()
                ));
            }
            
            for identity in identities {
                if agent.userauth(username, &identity).is_ok() {
                    return Ok(true);
                }
            }
            
            Err(AppError::AuthenticationFailed(
                "Agent has identities but none matched for authentication".to_string()
            ))
        })();

        if let Ok(true) = agent_result {
            return Ok(());
        }
        if let Err(e) = &agent_result {
            agent_error_msg = e.to_string();
        }
    }

    // For Ed25519, standard temp file method works if libssh2 is built with OpenSSL (via vendored-openssl feature)
    // or if we use SSH Agent.

    // Fallback to temp file (works with vendored-openssl for Ed25519)
    let mut temp_file = tempfile::NamedTempFile::new().map_err(|e| {
        AppError::AuthenticationFailed(format!("Failed to create temp key file: {}", e))
    })?;
    temp_file
        .write_all(openssh_data.as_bytes())
        .map_err(|e| AppError::AuthenticationFailed(format!("Failed to write temp key: {}", e)))?;
    temp_file
        .flush()
        .map_err(|e| AppError::AuthenticationFailed(format!("Failed to flush temp key: {}", e)))?;

    // Check available auth methods
    let auth_methods = session.auth_methods(username).unwrap_or_default();
    
    if !auth_methods.contains("publickey") {
        return Err(AppError::AuthenticationFailed(format!(
            "Server does not support public key authentication. Available methods: {}",
            auth_methods
        )));
    }

    session
        .userauth_pubkey_file(username, None, temp_file.path(), None)
        .map_err(|e| {
            if key_type == crate::ssh::KeyType::Ed25519 {
                AppError::AuthenticationFailed(format!(
                    "Ed25519 authentication failed: {}. \n\
                     Agent Error: '{}'. \n\n\
                     Ed25519 keys require SSH Agent on Windows. Please:\n\
                     1. Open PowerShell as Administrator\n\
                     2. Run: Set-Service ssh-agent -StartupType Automatic\n\
                     3. Run: Start-Service ssh-agent\n\
                     4. Retry the connection\n\n\
                     Server auth methods: {}",
                    e, agent_error_msg, auth_methods
                ))
            } else {
                AppError::AuthenticationFailed(format!(
                    "SSH key authentication failed: {}. Key type: {:?}\n\n\
                     Possible causes:\n\
                     1. Public key not in server's ~/.ssh/authorized_keys\n\
                     2. Wrong username (current: {})\n\
                     3. Server SSH permissions issue\n\
                     4. Key format incompatibility\n\n\
                     Server auth methods: {}",
                    e, key_type, username, auth_methods
                ))
            }
        })?;

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
