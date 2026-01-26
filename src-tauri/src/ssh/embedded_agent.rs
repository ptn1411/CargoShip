use super::{KeyType, LoadedKey};
use crate::error::{AppError, Result};

use ed25519_dalek::{Signer, SigningKey};
use std::convert::TryInto;
use std::io::Cursor;
#[cfg(not(target_os = "windows"))]
use std::path::PathBuf;
#[cfg(target_os = "windows")]
use std::sync::atomic::AtomicUsize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, OnceLock, RwLock,
};
use std::time::{Duration, Instant};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::sync::watch;
use tokio::time::sleep;
use zeroize::Zeroizing;

const SSH_AGENT_FAILURE: u8 = 5;
const SSH_AGENT_REQUEST_IDENTITIES: u8 = 11;
const SSH_AGENT_IDENTITIES_ANSWER: u8 = 12;
const SSH_AGENT_SIGN_REQUEST: u8 = 13;
const SSH_AGENT_SIGN_RESPONSE: u8 = 14;
const MAX_AGENT_MESSAGE_SIZE: usize = 256 * 1024;

pub fn agent_manager() -> &'static EmbeddedAgentManager {
    static INSTANCE: OnceLock<EmbeddedAgentManager> = OnceLock::new();
    INSTANCE.get_or_init(|| EmbeddedAgentManager::new(EmbeddedAgentConfig::default()))
}

#[derive(Clone, Debug)]
pub struct EmbeddedAgentConfig {
    pub enabled: bool,
    pub pipe_name: String,
    #[cfg(not(target_os = "windows"))]
    pub socket_dir: Option<PathBuf>,
}

impl Default for EmbeddedAgentConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            pipe_name: "devops-commander-ssh-agent".to_string(),
            #[cfg(not(target_os = "windows"))]
            socket_dir: None,
        }
    }
}

pub struct EmbeddedAgentManager {
    config: EmbeddedAgentConfig,
    state: Mutex<AgentState>,
}

struct AgentState {
    handle: Option<EmbeddedAgentHandle>,
    auto_start_enabled: bool,
}

impl EmbeddedAgentManager {
    pub fn new(config: EmbeddedAgentConfig) -> Self {
        Self {
            config,
            state: Mutex::new(AgentState {
                handle: None,
                auto_start_enabled: false,
            }),
        }
    }

    pub fn ensure_runtime(&self) -> Result<()> {
        if !self.config.enabled {
            return Err(AppError::SshError(
                "Embedded SSH agent is disabled in configuration".to_string(),
            ));
        }

        let mut state = self.state.lock().unwrap();
        if state.handle.is_none() {
            let endpoint = AgentEndpoint::from_config(&self.config)?;
            let handle = EmbeddedAgentHandle::start(endpoint)?;
            state.handle = Some(handle);
        }
        Ok(())
    }

    pub fn ensure_identity_loaded(&self, loaded_key: &LoadedKey) -> Result<()> {
        if loaded_key.key_type != KeyType::Ed25519 {
            return Ok(());
        }

        self.ensure_runtime()?;

        let mut state = self.state.lock().unwrap();
        let handle = state.handle.as_mut().ok_or_else(|| {
            AppError::SshError("Embedded agent handle missing after startup".to_string())
        })?;

        handle.install_identity(loaded_key)
    }

    pub fn status_flags(&self) -> AgentStatusFlags {
        let state = self.state.lock().unwrap();
        AgentStatusFlags {
            enabled: self.config.enabled,
            running: state.handle.is_some(),
        }
    }

    pub fn set_auto_start(&self, enabled: bool) {
        let mut state = self.state.lock().unwrap();
        state.auto_start_enabled = enabled;
    }

    pub fn socket_path(&self) -> Option<String> {
        let state = self.state.lock().unwrap();
        state.handle.as_ref().map(|h| h.socket_path())
    }

    pub fn matches_fingerprint(&self, fingerprint: &str) -> bool {
        let state = self.state.lock().unwrap();
        state
            .handle
            .as_ref()
            .map(|h| h.identity_store.matches_fingerprint(fingerprint))
            .unwrap_or(false)
    }
}

pub struct AgentStatusFlags {
    pub enabled: bool,
    pub running: bool,
}

struct EmbeddedAgentHandle {
    endpoint: AgentEndpoint,
    shutdown_tx: Option<watch::Sender<bool>>,
    runtime_thread: Option<std::thread::JoinHandle<()>>,
    shutdown_triggered: Arc<AtomicBool>,
    identity_store: Arc<IdentityStore>,
}

impl EmbeddedAgentHandle {
    fn start(endpoint: AgentEndpoint) -> Result<Self> {
        #[cfg(not(target_os = "windows"))]
        {
            let path = match &endpoint {
                AgentEndpoint::Unix { path } => path,
            };
            if path.exists() {
                std::fs::remove_file(path).ok();
            }
        }

        let identity_store = Arc::new(IdentityStore::default());
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let endpoint_clone = endpoint.clone();
        let store_clone = identity_store.clone();
        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let shutdown_flag_thread = shutdown_flag.clone();

        let thread = std::thread::Builder::new()
            .name("embedded-ssh-agent".to_string())
            .spawn(move || {
                log::info!(
                    "Embedded SSH agent starting on {}",
                    endpoint_clone.log_target()
                );

                let runtime = tokio::runtime::Builder::new_multi_thread()
                    .worker_threads(1)
                    .max_blocking_threads(1)
                    .enable_io()
                    .enable_time()
                    .build()
                    .expect("Failed to create embedded agent runtime");

                if let Err(err) =
                    runtime.block_on(run_agent_loop(endpoint_clone, store_clone, shutdown_rx))
                {
                    log::error!("Embedded SSH agent loop exited: {}", err);
                }

                shutdown_flag_thread.store(true, Ordering::SeqCst);
            })
            .map_err(|e| AppError::SshError(format!("Failed to start agent thread: {}", e)))?;

        std::env::set_var("SSH_AUTH_SOCK", endpoint.socket_env_value());

        Ok(Self {
            endpoint,
            shutdown_tx: Some(shutdown_tx),
            runtime_thread: Some(thread),
            shutdown_triggered: shutdown_flag,
            identity_store,
        })
    }

    fn install_identity(&mut self, loaded_key: &LoadedKey) -> Result<()> {
        let resident = ResidentKey::from_loaded_key(loaded_key)?;
        self.identity_store.load(resident);
        Ok(())
    }

    fn socket_path(&self) -> String {
        self.endpoint.socket_env_value()
    }

    fn shutdown(&mut self) -> Result<()> {
        self.shutdown_gracefully(Duration::from_secs(2))
    }

    pub fn shutdown_gracefully(&mut self, timeout: Duration) -> Result<()> {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(true);
        }

        if let Some(handle) = self.runtime_thread.take() {
            let start = Instant::now();
            while !self.shutdown_triggered.load(Ordering::SeqCst) {
                if start.elapsed() > timeout {
                    log::warn!("Embedded SSH agent shutdown timed out, forcing cleanup");
                    break;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            let _ = handle.join();
        }

        self.cleanup_resources()
    }

    fn cleanup_resources(&self) -> Result<()> {
        #[cfg(not(target_os = "windows"))]
        {
            let path = match &self.endpoint {
                AgentEndpoint::Unix { path } => path,
            };
            if path.exists() {
                std::fs::remove_file(path).ok();
            }
        }

        std::env::remove_var("SSH_AUTH_SOCK");
        Ok(())
    }
}

impl Drop for EmbeddedAgentHandle {
    fn drop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(true);
        }

        if let Some(handle) = self.runtime_thread.take() {
            if handle.is_finished() {
                let _ = handle.join();
            }
        }

        let _ = self.cleanup_resources();
    }
}

#[derive(Clone)]
enum AgentEndpoint {
    #[cfg(target_os = "windows")]
    Windows {
        pipe_name: String,
        full_path: String,
    },
    #[cfg(not(target_os = "windows"))]
    Unix { path: PathBuf },
}

impl AgentEndpoint {
    fn from_config(config: &EmbeddedAgentConfig) -> Result<Self> {
        #[cfg(target_os = "windows")]
        {
            let sanitized = config.pipe_name.replace(':', "-");
            let path = format!(r"\\.\pipe\{}", sanitized);
            Ok(AgentEndpoint::Windows {
                pipe_name: sanitized,
                full_path: path,
            })
        }

        #[cfg(not(target_os = "windows"))]
        {
            let dir = config.socket_dir.clone().unwrap_or_else(std::env::temp_dir);
            let path = dir.join(&config.pipe_name);
            Ok(AgentEndpoint::Unix { path })
        }
    }

    fn socket_env_value(&self) -> String {
        match self {
            #[cfg(target_os = "windows")]
            AgentEndpoint::Windows { full_path, .. } => full_path.clone(),
            #[cfg(not(target_os = "windows"))]
            AgentEndpoint::Unix { path } => path.to_string_lossy().to_string(),
        }
    }

    fn log_target(&self) -> String {
        match self {
            #[cfg(target_os = "windows")]
            AgentEndpoint::Windows { full_path, .. } => full_path.clone(),
            #[cfg(not(target_os = "windows"))]
            AgentEndpoint::Unix { path } => path.to_string_lossy().to_string(),
        }
    }
}

async fn run_agent_loop(
    endpoint: AgentEndpoint,
    identities: Arc<IdentityStore>,
    shutdown_rx: watch::Receiver<bool>,
) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        run_pipe_server(endpoint, identities, shutdown_rx).await
    }

    #[cfg(not(target_os = "windows"))]
    {
        run_unix_server(endpoint, identities, shutdown_rx).await
    }
}

#[cfg(target_os = "windows")]
async fn run_pipe_server(
    endpoint: AgentEndpoint,
    identities: Arc<IdentityStore>,
    mut shutdown_rx: watch::Receiver<bool>,
) -> Result<()> {
    use tokio::net::windows::named_pipe::{PipeMode, ServerOptions};

    let AgentEndpoint::Windows { full_path, .. } = endpoint;
    let pipe_path = full_path;
    let max_instances = 32;
    let active_connections = Arc::new(AtomicUsize::new(0));

    loop {
        if *shutdown_rx.borrow() {
            break;
        }

        if active_connections.load(Ordering::SeqCst) >= max_instances {
            tokio::select! {
                _ = shutdown_rx.changed() => {
                    if *shutdown_rx.borrow() {
                        break;
                    }
                }
                _ = sleep(Duration::from_millis(100)) => {}
            }
            continue;
        }

        let server = ServerOptions::new()
            .pipe_mode(PipeMode::Message)
            .max_instances(max_instances)
            .create(&pipe_path)
            .map_err(|e| AppError::SshError(format!("Failed to bind named pipe: {}", e)))?;

        active_connections.fetch_add(1, Ordering::SeqCst);
        let mut watcher = shutdown_rx.clone();
        let identity_clone = identities.clone();
        let active_clone = active_connections.clone();

        tokio::spawn(async move {
            tokio::select! {
                res = wait_and_handle(server, identity_clone) => {
                    if let Err(err) = res {
                        log::warn!("SSH agent pipe session ended: {}", err);
                    }
                }
                _ = watcher.changed() => {}
            }
            active_clone.fetch_sub(1, Ordering::SeqCst);
        });

        tokio::select! {
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    break;
                }
            }
            _ = sleep(Duration::from_millis(10)) => {}
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
async fn wait_and_handle(
    server: tokio::net::windows::named_pipe::NamedPipeServer,
    identities: Arc<IdentityStore>,
) -> Result<()> {
    server
        .connect()
        .await
        .map_err(|e| AppError::SshError(format!("Pipe connection failed: {}", e)))?;
    handle_connection(server, identities).await
}

#[cfg(not(target_os = "windows"))]
async fn run_unix_server(
    endpoint: AgentEndpoint,
    identities: Arc<IdentityStore>,
    mut shutdown_rx: watch::Receiver<bool>,
) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    use tokio::net::UnixListener;

    let AgentEndpoint::Unix { path } = endpoint;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let listener = UnixListener::bind(&path).map_err(|e| {
        AppError::SshError(format!(
            "Failed to bind unix socket {}: {}",
            path.display(),
            e
        ))
    })?;

    let perms = std::fs::Permissions::from_mode(0o600);
    std::fs::set_permissions(&path, perms).map_err(|e| {
        AppError::SshError(format!(
            "Failed to set permissions on {}: {}",
            path.display(),
            e
        ))
    })?;

    loop {
        tokio::select! {
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    break;
                }
            }
            accept_res = listener.accept() => {
                match accept_res {
                    Ok((stream, _addr)) => {
                        let identities = identities.clone();
                        tokio::spawn(async move {
                            if let Err(err) = handle_connection(stream, identities).await {
                                log::warn!("SSH agent unix session ended: {}", err);
                            }
                        });
                    }
                    Err(err) => {
                        log::warn!("Failed to accept agent connection: {}", err);
                        sleep(Duration::from_millis(100)).await;
                    }
                }
            }
        }
    }

    Ok(())
}

async fn handle_connection<S>(mut stream: S, identities: Arc<IdentityStore>) -> Result<()>
where
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let mut len_buf = [0u8; 4];
    loop {
        match stream.read_exact(&mut len_buf).await {
            Ok(_) => {}
            Err(err) if err.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(err) => {
                return Err(AppError::SshError(format!(
                    "Failed to read agent frame: {}",
                    err
                )));
            }
        }

        let frame_len = u32::from_be_bytes(len_buf) as usize;
        if frame_len == 0 || frame_len > MAX_AGENT_MESSAGE_SIZE {
            log::warn!("Invalid agent frame size: {}", frame_len);
            write_failure(&mut stream).await?;
            continue;
        }

        let mut payload = vec![0u8; frame_len];
        stream
            .read_exact(&mut payload)
            .await
            .map_err(|e| AppError::SshError(format!("Failed to read agent payload: {}", e)))?;

        let response = process_agent_request(&payload, &identities)?;
        stream
            .write_all(&(response.len() as u32).to_be_bytes())
            .await
            .map_err(|e| AppError::SshError(format!("Failed to write agent header: {}", e)))?;
        stream
            .write_all(&response)
            .await
            .map_err(|e| AppError::SshError(format!("Failed to write agent response: {}", e)))?;
        stream.flush().await.map_err(|e| {
            AppError::SshError(format!("Failed to flush agent response to client: {}", e))
        })?;
    }

    Ok(())
}

async fn write_failure<S>(stream: &mut S) -> Result<()>
where
    S: AsyncWrite + Unpin,
{
    let body = [SSH_AGENT_FAILURE];
    stream
        .write_all(&(body.len() as u32).to_be_bytes())
        .await
        .map_err(|e| AppError::SshError(format!("Failed to send failure header: {}", e)))?;
    stream
        .write_all(&body)
        .await
        .map_err(|e| AppError::SshError(format!("Failed to send failure: {}", e)))
}

fn process_agent_request(payload: &[u8], identities: &IdentityStore) -> Result<Vec<u8>> {
    if payload.is_empty() {
        log::warn!("Agent request payload was empty");
        return Ok(vec![SSH_AGENT_FAILURE]);
    }

    match payload[0] {
        SSH_AGENT_REQUEST_IDENTITIES => Ok(encode_identities_answer(identities)),
        SSH_AGENT_SIGN_REQUEST => handle_sign_request(&payload[1..], identities),
        unsupported => {
            log::warn!("Unsupported SSH agent request: {}", unsupported);
            Ok(vec![SSH_AGENT_FAILURE])
        }
    }
}

fn encode_identities_answer(store: &IdentityStore) -> Vec<u8> {
    let mut response = Vec::new();
    response.push(SSH_AGENT_IDENTITIES_ANSWER);

    if let Some(identity) = store.current_identity() {
        response.extend_from_slice(&1u32.to_be_bytes());
        append_ssh_string(&mut response, identity.public_blob());
        append_ssh_string(&mut response, identity.comment.as_bytes());
    } else {
        response.extend_from_slice(&0u32.to_be_bytes());
    }

    response
}

fn handle_sign_request(body: &[u8], store: &IdentityStore) -> Result<Vec<u8>> {
    let identity = match store.current_identity() {
        Some(identity) => identity,
        None => {
            log::warn!("SIGN_REQUEST received but no identity loaded");
            return Ok(vec![SSH_AGENT_FAILURE]);
        }
    };

    let mut cursor = Cursor::new(body);
    let key_blob = read_ssh_string(&mut cursor)?;
    let data = read_ssh_string(&mut cursor)?;
    let _flags = read_u32(&mut cursor).unwrap_or(0);

    if !identity.matches_blob(&key_blob) {
        log::warn!("SIGN_REQUEST for unknown key");
        return Ok(vec![SSH_AGENT_FAILURE]);
    }

    let signature = identity.sign(&data)?;
    let mut signature_blob = Vec::new();
    append_ssh_string(&mut signature_blob, b"ssh-ed25519");
    append_ssh_string(&mut signature_blob, &signature);

    let mut response = Vec::with_capacity(signature_blob.len() + 5);
    response.push(SSH_AGENT_SIGN_RESPONSE);
    append_ssh_string(&mut response, &signature_blob);
    Ok(response)
}

fn read_ssh_string(cursor: &mut Cursor<&[u8]>) -> Result<Vec<u8>> {
    let mut len_buf = [0u8; 4];
    std::io::Read::read_exact(cursor, &mut len_buf)
        .map_err(|e| AppError::SshError(format!("Failed to read SSH string length: {}", e)))?;
    let len = u32::from_be_bytes(len_buf) as usize;
    let mut data = vec![0u8; len];
    std::io::Read::read_exact(cursor, &mut data)
        .map_err(|e| AppError::SshError(format!("Failed to read SSH string: {}", e)))?;
    Ok(data)
}

fn read_u32(cursor: &mut Cursor<&[u8]>) -> Result<u32> {
    let mut buf = [0u8; 4];
    std::io::Read::read_exact(cursor, &mut buf)
        .map_err(|e| AppError::SshError(format!("Failed to read u32: {}", e)))?;
    Ok(u32::from_be_bytes(buf))
}

fn append_ssh_string(buffer: &mut Vec<u8>, data: &[u8]) {
    buffer.extend_from_slice(&(data.len() as u32).to_be_bytes());
    buffer.extend_from_slice(data);
}

#[derive(Default)]
struct IdentityStore {
    current: RwLock<Option<Arc<ResidentKey>>>,
}

impl IdentityStore {
    fn load(&self, key: ResidentKey) {
        let mut guard = self.current.write().unwrap();
        *guard = Some(Arc::new(key));
    }

    fn current_identity(&self) -> Option<Arc<ResidentKey>> {
        self.current.read().unwrap().clone()
    }

    fn matches_fingerprint(&self, fingerprint: &str) -> bool {
        self.current
            .read()
            .unwrap()
            .as_ref()
            .map(|key| key.fingerprint == fingerprint)
            .unwrap_or(false)
    }
}

struct ResidentKey {
    secret_key: Mutex<Zeroizing<[u8; 32]>>,
    public_blob: Vec<u8>,
    comment: String,
    fingerprint: String,
}

impl ResidentKey {
    fn from_loaded_key(loaded_key: &LoadedKey) -> Result<Self> {
        if loaded_key.key_type != KeyType::Ed25519 {
            return Err(AppError::AuthenticationFailed(
                "Embedded SSH agent only supports Ed25519 keys".to_string(),
            ));
        }

        let private_key = ssh_key::PrivateKey::from_openssh(loaded_key.openssh_data.as_bytes())
            .map_err(|e| AppError::AuthenticationFailed(format!("Failed to parse key: {}", e)))?;

        let keypair = private_key.key_data().ed25519().ok_or_else(|| {
            AppError::AuthenticationFailed(
                "Provided key is not a valid Ed25519 keypair".to_string(),
            )
        })?;

        let public_blob = private_key
            .public_key()
            .to_bytes()
            .map_err(|e| AppError::SshError(format!("Failed to serialize public key: {}", e)))?;

        let fingerprint = private_key
            .public_key()
            .fingerprint(ssh_key::HashAlg::Sha256)
            .to_string();

        let comment = {
            let extracted = private_key.comment().trim();
            if !extracted.is_empty() {
                extracted.to_string()
            } else {
                loaded_key
                    .public_key_openssh
                    .split_whitespace()
                    .nth(2)
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| "devops-commander".to_string())
            }
        };

        Ok(Self {
            secret_key: Mutex::new(Zeroizing::new(keypair.private.to_bytes())),
            public_blob,
            comment,
            fingerprint,
        })
    }

    fn public_blob(&self) -> &[u8] {
        &self.public_blob
    }

    fn matches_blob(&self, other: &[u8]) -> bool {
        self.public_blob == other
    }

    fn sign(&self, data: &[u8]) -> Result<Vec<u8>> {
        let key = self.secret_key.lock().unwrap();
        let secret: &[u8; 32] = key
            .as_ref()
            .try_into()
            .map_err(|_| AppError::SshError("Invalid Ed25519 secret length".to_string()))?;
        let signing_key = SigningKey::from_bytes(secret);
        let signature = signing_key.sign(data);
        Ok(signature.to_bytes().to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ssh::KeyType;
    use ssh_key::LineEnding;

    fn sample_loaded_key() -> LoadedKey {
        let keypair = ssh_key::private::Ed25519Keypair::random(&mut rand::thread_rng());
        let private_key = ssh_key::PrivateKey::from(keypair);
        let openssh = private_key.to_openssh(LineEnding::LF).unwrap().to_string();
        let public = private_key.public_key().to_openssh().unwrap();

        LoadedKey {
            key_type: KeyType::Ed25519,
            openssh_data: openssh,
            public_key_openssh: public.to_string(),
        }
    }

    #[tokio::test]
    async fn test_process_request_identities() {
        let loaded = sample_loaded_key();
        let resident = ResidentKey::from_loaded_key(&loaded).unwrap();

        let store = IdentityStore::default();
        store.load(resident);

        let response = encode_identities_answer(&store);
        assert_eq!(response[0], SSH_AGENT_IDENTITIES_ANSWER);
        assert_eq!(u32::from_be_bytes(response[1..5].try_into().unwrap()), 1);
    }

    #[tokio::test]
    async fn test_sign_request_roundtrip() {
        let loaded = sample_loaded_key();
        let resident = ResidentKey::from_loaded_key(&loaded).unwrap();
        let blob = resident.public_blob().to_vec();

        let store = IdentityStore::default();
        store.load(resident);

        let mut request = Vec::new();
        request.push(SSH_AGENT_SIGN_REQUEST);
        append_ssh_string(&mut request, &blob);
        append_ssh_string(&mut request, b"hello-world");
        request.extend_from_slice(&0u32.to_be_bytes());

        let response = process_agent_request(&request, &store).unwrap();
        assert_eq!(response[0], SSH_AGENT_SIGN_RESPONSE);
    }
}
