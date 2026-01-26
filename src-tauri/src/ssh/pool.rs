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

    for (attempt, kex) in kex_algorithms.iter().enumerate() {
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
                    attempt + 1,
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

use crate::ssh::{LoadedKey, SshKeyManager};

/// Get SSH key fingerprint for debugging
fn get_key_fingerprint(public_key_openssh: &str) -> String {
    use sha2::{Digest, Sha256};

    // Parse the public key to get the key data
    if let Ok(public_key) = ssh_key::PublicKey::from_openssh(public_key_openssh) {
        // Get the key data bytes
        let key_data = public_key.to_bytes().unwrap_or_default();

        // Calculate SHA256 fingerprint
        let mut hasher = Sha256::new();
        hasher.update(&key_data);
        let hash = hasher.finalize();

        // Format as SHA256:base64
        format!(
            "SHA256:{}",
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, hash)
        )
    } else {
        "Unable to calculate fingerprint".to_string()
    }
}

/// Authenticate using russh for Ed25519 keys on Windows
#[cfg(target_os = "windows")]
pub fn authenticate_ed25519_russh(
    host: &str,
    port: u16,
    username: &str,
    private_key_pem: &str,
) -> Result<()> {
    log::info!("🔧 Using russh library for Ed25519 authentication on Windows");
    
    // Clone the data we need to move into the async block
    let host = host.to_string();
    let username = username.to_string();
    let private_key_pem = private_key_pem.to_string();
    
    // Use tokio::task::block_in_place to run async code from sync context
    // This is safe because it moves the blocking operation to a dedicated thread
    tokio::task::block_in_place(|| {
        // Get the current runtime handle
        let handle = tokio::runtime::Handle::current();
        
        // Run the async authentication
        handle.block_on(async {
            // Add timeout to prevent hanging
            tokio::time::timeout(
                std::time::Duration::from_secs(30),
                crate::ssh::test_ed25519_auth(&host, port, &username, &private_key_pem)
            )
            .await
            .map_err(|_| {
                AppError::ConnectionFailed(
                    "Ed25519 authentication timed out after 30 seconds. \
                     Please check:\n\
                     1. Server is reachable\n\
                     2. Port is correct\n\
                     3. Firewall allows connection"
                        .to_string(),
                )
            })?
        })
    })
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

                    // For Ed25519 on Windows, use russh instead of libssh2
                    #[cfg(target_os = "windows")]
                    {
                        // Parse to check key type
                        if let Ok(parsed_key) = ssh_key::PrivateKey::from_openssh(private_key.as_bytes()) {
                            let decrypted_key = if parsed_key.is_encrypted() {
                                if let Some(pass) = passphrase.as_deref().filter(|p| !p.is_empty()) {
                                    parsed_key.decrypt(pass.as_bytes()).ok()
                                } else {
                                    None
                                }
                            } else {
                                Some(parsed_key)
                            };

                            if let Some(key) = decrypted_key {
                                if matches!(key.algorithm(), ssh_key::Algorithm::Ed25519) {
                                    log::info!("🔑 Detected Ed25519 key from database on Windows");
                                    let openssh_key = key.to_openssh(ssh_key::LineEnding::LF)
                                        .map_err(|e| AppError::AuthenticationFailed(format!("Failed to serialize key: {}", e)))?
                                        .to_string();
                                    
                                    return authenticate_ed25519_russh(
                                        &server.host,
                                        server.port,
                                        &server.username,
                                        &openssh_key,
                                    );
                                }
                            }
                        }
                    }

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
                    // For Ed25519 on Windows, use russh instead of libssh2
                    #[cfg(target_os = "windows")]
                    if loaded_key.key_type == crate::ssh::KeyType::Ed25519 {
                        log::info!("🔑 Detected Ed25519 key file on Windows, using russh");
                        return authenticate_ed25519_russh(
                            &server.host,
                            server.port,
                            &server.username,
                            &loaded_key.openssh_data,
                        );
                    }

                    if loaded_key.key_type == crate::ssh::KeyType::Ed25519 {
                        let agent_result = (|| -> Result<()> {
                            crate::ssh::ensure_key_in_agent(&loaded_key)?;

                            let mut agent = session.agent().map_err(|e| {
                                AppError::AuthenticationFailed(format!(
                                    "Failed to connect to embedded SSH agent: {}",
                                    e
                                ))
                            })?;

                            agent.connect().map_err(|e| {
                                AppError::AuthenticationFailed(format!(
                                    "Failed to connect to embedded SSH agent: {}",
                                    e
                                ))
                            })?;

                            agent.list_identities().map_err(|e| {
                                AppError::AuthenticationFailed(format!(
                                    "Failed to list embedded agent identities: {}",
                                    e
                                ))
                            })?;

                            let identities = agent.identities().map_err(|e| {
                                AppError::AuthenticationFailed(format!(
                                    "Failed to get embedded agent identities: {}",
                                    e
                                ))
                            })?;

                            for identity in identities {
                                if agent.userauth(&server.username, &identity).is_ok() {
                                    return Ok(());
                                }
                            }

                            Err(AppError::AuthenticationFailed(
                                "No matching identity found in embedded SSH agent".to_string(),
                            ))
                        })();

                        return agent_result.map_err(|err| {
                            AppError::AuthenticationFailed(format!(
                                "Embedded SSH Agent could not authenticate Ed25519 key: {}\nSSH_AUTH_SOCK={}",
                                err,
                                std::env::var("SSH_AUTH_SOCK").unwrap_or_else(|_| "unset".to_string())
                            ))
                        });
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

    // Parse the key first to check if it's encrypted
    let parsed_key = ssh_key::PrivateKey::from_openssh(private_key_pem.as_bytes()).map_err(|e| {
        AppError::AuthenticationFailed(format!("Failed to parse SSH key: {}", e))
    })?;

    // Decrypt only if the key is actually encrypted
    let private_key = if parsed_key.is_encrypted() {
        // Key is encrypted, we need a passphrase
        if let Some(pass) = passphrase.filter(|p| !p.is_empty()) {
            parsed_key.decrypt(pass.as_bytes()).map_err(|e| {
                AppError::AuthenticationFailed(format!(
                    "Failed to decrypt SSH key: {}. Please verify the passphrase is correct.",
                    e
                ))
            })?
        } else {
            return Err(AppError::AuthenticationFailed(
                "SSH key is encrypted but no passphrase was provided. \
                 Please configure the key passphrase in the server settings."
                    .to_string(),
            ));
        }
    } else {
        // Key is already decrypted, use it as-is
        parsed_key
    };

    let key_type = match private_key.algorithm() {
        ssh_key::Algorithm::Ed25519 => crate::ssh::KeyType::Ed25519,
        ssh_key::Algorithm::Rsa { .. } => crate::ssh::KeyType::Rsa,
        ssh_key::Algorithm::Ecdsa { .. } => crate::ssh::KeyType::Ecdsa,
        _ => crate::ssh::KeyType::Unknown,
    };

    log::debug!(
        "authenticate_with_key_content: key_type={:?}, algorithm={:?}",
        key_type,
        private_key.algorithm()
    );

    // Get unencrypted key in OpenSSH format
    let openssh_key = private_key
        .to_openssh(ssh_key::LineEnding::LF)
        .map_err(|e| AppError::AuthenticationFailed(format!("Failed to serialize key: {}", e)))?
        .to_string();

    // For RSA keys on Windows, convert to PKCS#1 PEM format for better libssh2 compatibility
    #[allow(unused_mut)]
    let mut final_key_data = openssh_key.clone();

    #[cfg(target_os = "windows")]
    if let ssh_key::Algorithm::Rsa { .. } = private_key.algorithm() {
        log::debug!("Converting RSA key to PKCS#1 PEM format for Windows");
        if let Some(key_data) = private_key.key_data().rsa() {
            use pkcs1::EncodeRsaPrivateKey;

            let n = rsa::BigUint::from_bytes_be(key_data.public.n.as_bytes());
            let e = rsa::BigUint::from_bytes_be(key_data.public.e.as_bytes());
            let d = rsa::BigUint::from_bytes_be(key_data.private.d.as_bytes());
            let p = rsa::BigUint::from_bytes_be(key_data.private.p.as_bytes());
            let q = rsa::BigUint::from_bytes_be(key_data.private.q.as_bytes());

            match rsa::RsaPrivateKey::from_components(n, e, d, vec![p, q]) {
                Ok(rsa_key) => {
                    match rsa_key.to_pkcs1_pem(rsa::pkcs8::LineEnding::LF) {
                        Ok(pem) => {
                            final_key_data = pem.to_string();
                            log::debug!("Successfully converted RSA key to PEM format");
                        }
                        Err(e) => {
                            log::warn!("Failed to convert RSA key to PEM: {}, using OpenSSH format", e);
                        }
                    }
                }
                Err(e) => {
                    log::warn!("Failed to reconstruct RSA key: {}, using OpenSSH format", e);
                }
            }
        }
    }

    log::debug!(
        "authenticate_with_key_content: final_key_data starts with: {:?}",
        final_key_data.chars().take(80).collect::<String>()
    );

    let public_key_openssh = private_key
        .public_key()
        .to_openssh()
        .map_err(|e| {
            AppError::AuthenticationFailed(format!("Failed to serialize public key: {}", e))
        })?
        .to_string();

    let loaded_key = LoadedKey {
        key_type,
        openssh_data: final_key_data,
        public_key_openssh: public_key_openssh.clone(),
    };

    // For Ed25519 on Windows, use russh library (libssh2 doesn't support it)
    #[cfg(target_os = "windows")]
    if key_type == crate::ssh::KeyType::Ed25519 {
        log::info!("🔧 Detected Ed25519 key on Windows - switching to russh library");
        log::info!("   (libssh2 does not support Ed25519 on Windows)");
        
        return Err(AppError::AuthenticationFailed(
            "⚠️  Ed25519 key detected on Windows\n\n\
             This authentication path uses libssh2 which does NOT support Ed25519 on Windows.\n\
             The connection will be retried using the russh library automatically.\n\n\
             If you see this message repeatedly, please:\n\
             1. Check that the public key is in ~/.ssh/authorized_keys on the server\n\
             2. Verify SSH permissions: chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys\n\
             3. Or use RSA keys instead (fully supported)"
                .to_string(),
        ));
    }

    // For Ed25519, try SSH agent first
    #[cfg(not(target_os = "windows"))]
    if key_type == crate::ssh::KeyType::Ed25519 {
        let agent_result = (|| -> Result<bool> {
            // Ensure embedded agent is running and key is loaded
            crate::ssh::ensure_key_in_agent(&loaded_key)?;

            // Log SSH_AUTH_SOCK for debugging
            let ssh_auth_sock = std::env::var("SSH_AUTH_SOCK")
                .unwrap_or_else(|_| "NOT SET".to_string());
            log::info!(
                "Attempting SSH agent authentication. SSH_AUTH_SOCK: {}",
                ssh_auth_sock
            );

            // Try to authenticate using agent
            let mut agent = session.agent().map_err(|e| {
                log::error!("Failed to initialize SSH agent: {}", e);
                AppError::AuthenticationFailed(format!("Failed to initialize SSH agent: {}", e))
            })?;

            agent.connect().map_err(|e| {
                log::error!("Failed to connect to SSH agent at {}: {}", ssh_auth_sock, e);
                AppError::AuthenticationFailed(format!("Failed to connect to SSH agent: {}", e))
            })?;

            log::debug!("Successfully connected to SSH agent");

            agent.list_identities().map_err(|e| {
                log::error!("Failed to list agent identities: {}", e);
                AppError::AuthenticationFailed(format!("Failed to list agent identities: {}", e))
            })?;

            let identities = agent.identities().map_err(|e| {
                log::error!("Failed to get agent identities: {}", e);
                AppError::AuthenticationFailed(format!("Failed to get agent identities: {}", e))
            })?;

            log::info!("Found {} identities in SSH agent", identities.len());

            if identities.is_empty() {
                return Err(AppError::AuthenticationFailed(
                    "No identities found in SSH agent after adding key".to_string(),
                ));
            }

            for (i, identity) in identities.iter().enumerate() {
                log::debug!("Trying identity {} for authentication", i);
                if agent.userauth(username, identity).is_ok() {
                    log::info!("Successfully authenticated with identity {}", i);
                    return Ok(true);
                }
            }

            Err(AppError::AuthenticationFailed(
                "Agent has identities but none matched for authentication".to_string(),
            ))
        })();

        if let Ok(true) = agent_result {
            return Ok(());
        }
        if let Err(e) = &agent_result {
            log::warn!("SSH agent authentication failed: {}. Falling back to direct key authentication.", e);
        }
    }

    // Fallback: Use direct key authentication
    // This works on Windows when libssh2 is built with OpenSSH support (vendored-openssl feature)
    log::info!("Attempting direct key file authentication for {:?}", key_type);
    
    let mut temp_file = tempfile::NamedTempFile::new().map_err(|e| {
        AppError::AuthenticationFailed(format!("Failed to create temp key file: {}", e))
    })?;
    temp_file
        .write_all(loaded_key.openssh_data.as_bytes())
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

    log::debug!("Attempting userauth_pubkey_file with temp key");
    
    // For Ed25519 on Windows, libssh2 may not support the key format
    // Try userauth_pubkey_file first, if it fails, we'll provide helpful error
    let auth_result = session.userauth_pubkey_file(username, None, temp_file.path(), None);
    
    if let Err(e) = auth_result {
        let error_msg = if key_type == crate::ssh::KeyType::Ed25519 {
            #[cfg(target_os = "windows")]
            {
                format!(
                    "❌ Ed25519 Authentication Failed\n\n\
                     Error: {}\n\n\
                     ⚠️  WINDOWS LIMITATION:\n\
                     libssh2 does NOT support Ed25519 keys on Windows.\n\
                     This is a known limitation of the SSH library.\n\n\
                     ✅ RECOMMENDED SOLUTION:\n\
                     Use RSA keys instead (fully supported on Windows):\n\
                     1. Generate new RSA key in the app (4096-bit recommended)\n\
                     2. Copy public key to server: ~/.ssh/authorized_keys\n\
                     3. Update server configuration to use RSA key\n\n\
                     📋 Your Ed25519 public key (for reference):\n\
                     {}\n\n\
                     Server: {} | Auth methods: {}",
                    e,
                    public_key_openssh.lines().next().unwrap_or(""),
                    username,
                    auth_methods
                )
            }
            
            #[cfg(not(target_os = "windows"))]
            {
                format!(
                    "Ed25519 key authentication failed: {}.\n\n\
                     Possible solutions:\n\
                     1. Verify public key in server's ~/.ssh/authorized_keys:\n\
                        {}\n\
                     2. Check SSH permissions:\n\
                        chmod 700 ~/.ssh\n\
                        chmod 600 ~/.ssh/authorized_keys\n\
                     3. Verify username: {}\n\n\
                     Server auth methods: {}",
                    e,
                    public_key_openssh.lines().next().unwrap_or(""),
                    username,
                    auth_methods
                )
            }
        } else {
            format!(
                "SSH key authentication failed: {}. Key type: {:?}\n\n\
                 Possible causes:\n\
                 1. Public key not in server's ~/.ssh/authorized_keys\n\
                 2. Wrong username (current: {})\n\
                 3. Server SSH permissions issue\n\
                 4. Key format incompatibility\n\n\
                 Server auth methods: {}",
                e, key_type, username, auth_methods
            )
        };
        return Err(AppError::AuthenticationFailed(error_msg));
    }

    log::info!("Successfully authenticated with direct key file method");
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
