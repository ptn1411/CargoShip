/// Pure Rust SSH client using russh for Ed25519 support on Windows
/// This module provides Ed25519 authentication when libssh2 doesn't support it
use crate::error::{AppError, Result};
use russh::client;
use russh::{ChannelMsg, Disconnect};
use std::sync::Arc;

/// Simple SSH client handler for russh
struct Client;

#[async_trait::async_trait]
impl client::Handler for Client {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::key::PublicKey,
    ) -> std::result::Result<bool, Self::Error> {
        // Accept all server keys (similar to StrictHostKeyChecking=no)
        // In production, you should verify the server key
        Ok(true)
    }
}

/// Test Ed25519 authentication using russh
/// Returns Ok(()) if authentication succeeds, Err otherwise
pub async fn test_ed25519_auth(
    host: &str,
    port: u16,
    username: &str,
    private_key_pem: &str,
) -> Result<()> {
    // Print to stdout for debugging (visible in terminal when running app)
    println!("🔧 [RUSSH] Starting Ed25519 authentication: {}@{}:{}", username, host, port);
    
    log::info!(
        "Testing Ed25519 authentication with russh: {}@{}:{}",
        username,
        host,
        port
    );

    // Parse the private key using russh_keys
    println!("🔧 [RUSSH] Parsing Ed25519 private key...");
    let keypair = russh_keys::decode_secret_key(private_key_pem, None).map_err(|e| {
        let err_msg = format!("Failed to parse Ed25519 key: {}", e);
        println!("❌ [RUSSH] {}", err_msg);
        AppError::AuthenticationFailed(err_msg)
    })?;
    println!("✅ [RUSSH] Key parsed successfully");

    // Create SSH client configuration
    let config = Arc::new(russh::client::Config::default());

    // Connect to the server with timeout
    println!("🔧 [RUSSH] Connecting to {}:{}... (timeout: 15s)", host, port);
    log::debug!("Connecting to {}:{}...", host, port);
    
    let session = tokio::time::timeout(
        std::time::Duration::from_secs(15),
        client::connect(config, (host, port), Client)
    )
    .await
    .map_err(|_| {
        let err_msg = format!(
            "⏱️ Connection to {}:{} timed out after 15 seconds.\n\
             Possible causes:\n\
             - Server is not reachable\n\
             - Firewall blocking connection\n\
             - Wrong host/port",
            host, port
        );
        println!("❌ [RUSSH] {}", err_msg);
        AppError::ConnectionFailed(err_msg)
    })?
    .map_err(|e| {
        let err_msg = format!("Failed to connect to {}:{}: {}", host, port, e);
        println!("❌ [RUSSH] {}", err_msg);
        AppError::ConnectionFailed(err_msg)
    })?;

    println!("✅ [RUSSH] Connected successfully");
    log::debug!("Connected, authenticating...");

    // Authenticate with the private key with timeout
    println!("🔧 [RUSSH] Authenticating with Ed25519 key... (timeout: 10s)");
    let mut session = session;
    let auth_result = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        session.authenticate_publickey(username, Arc::new(keypair))
    )
    .await
    .map_err(|_| {
        let err_msg = "⏱️ Authentication timed out after 10 seconds";
        println!("❌ [RUSSH] {}", err_msg);
        AppError::AuthenticationFailed(err_msg.to_string())
    })?
    .map_err(|e| {
        let err_msg = format!("Ed25519 authentication failed: {}", e);
        println!("❌ [RUSSH] {}", err_msg);
        AppError::AuthenticationFailed(err_msg)
    })?;

    if !auth_result {
        let err_msg = "❌ Ed25519 authentication rejected by server.\n\
             Please verify:\n\
             1. Public key is in ~/.ssh/authorized_keys on server\n\
             2. SSH permissions: chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys\n\
             3. Username is correct";
        println!("{}", err_msg);
        return Err(AppError::AuthenticationFailed(err_msg.to_string()));
    }

    println!("✅ [RUSSH] Authentication successful!");
    log::info!("✅ Ed25519 authentication successful with russh");

    // Skip test command to make it faster
    // Authentication success is enough to confirm the connection works
    
    // Disconnect cleanly
    println!("🔧 [RUSSH] Disconnecting...");
    session
        .disconnect(Disconnect::ByApplication, "", "")
        .await
        .ok();
    
    println!("✅ [RUSSH] Ed25519 authentication completed successfully!");

    Ok(())
}

/// Execute a command using russh (for Ed25519 sessions)
pub async fn execute_command(
    host: &str,
    port: u16,
    username: &str,
    private_key_pem: &str,
    command: &str,
) -> Result<(String, String, i32)> {
    log::debug!("Executing command with russh: {}", command);

    // Parse the private key using russh_keys
    let keypair = russh_keys::decode_secret_key(private_key_pem, None).map_err(|e| {
        AppError::AuthenticationFailed(format!("Failed to parse Ed25519 key: {}", e))
    })?;

    // Create SSH client configuration
    let config = Arc::new(russh::client::Config::default());

    // Connect to the server
    let mut session = client::connect(config, (host, port), Client)
        .await
        .map_err(|e| {
            AppError::ConnectionFailed(format!("Failed to connect to {}:{}: {}", host, port, e))
        })?;

    // Authenticate
    let auth_result = session
        .authenticate_publickey(username, Arc::new(keypair))
        .await
        .map_err(|e| {
            AppError::AuthenticationFailed(format!("Ed25519 authentication failed: {}", e))
        })?;

    if !auth_result {
        return Err(AppError::AuthenticationFailed(
            "Ed25519 authentication rejected by server".to_string(),
        ));
    }

    // Open channel and execute command
    let mut channel = session
        .channel_open_session()
        .await
        .map_err(|e| AppError::SshError(format!("Failed to open channel: {}", e)))?;

    channel
        .exec(true, command)
        .await
        .map_err(|e| AppError::SshError(format!("Failed to execute command: {}", e)))?;

    // Read stdout and stderr
    let mut stdout = String::new();
    let mut stderr = String::new();
    let mut exit_code = 0;

    loop {
        let msg = channel.wait().await;
        match msg {
            Some(ChannelMsg::Data { ref data }) => {
                stdout.push_str(&String::from_utf8_lossy(data));
            }
            Some(ChannelMsg::ExtendedData { ref data, ext: 1 }) => {
                stderr.push_str(&String::from_utf8_lossy(data));
            }
            Some(ChannelMsg::ExitStatus { exit_status }) => {
                exit_code = exit_status as i32;
            }
            Some(ChannelMsg::Eof) | None => {
                break;
            }
            _ => {}
        }
    }

    // Disconnect
    session
        .disconnect(Disconnect::ByApplication, "", "")
        .await
        .ok();

    Ok((stdout, stderr, exit_code))
}
