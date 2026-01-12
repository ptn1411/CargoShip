use crate::credentials::CredentialStore;
use crate::error::{AppError, Result};
use crate::server::Server;
use crate::ssh::{create_ssh_session, authenticate_session};
use ssh2::Channel;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Arc;
use uuid::Uuid;

pub struct TerminalSession {
    pub session_id: String,
    pub server_id: String,
    #[allow(dead_code)]
    session: ssh2::Session,
    channel: Channel,
    #[allow(dead_code)]
    _tcp: TcpStream, // Keep TCP stream alive
    pty_size: (u16, u16),
}

impl TerminalSession {
    pub fn create(
        server: &Server,
        credential_store: &Arc<CredentialStore>,
        cols: u16,
        rows: u16,
    ) -> Result<Self> {
        let (session, tcp) = create_ssh_session(&server.host, server.port)?;

        // Authenticate using shared logic that supports Ed25519 via ssh-agent
        authenticate_session(&session, server, credential_store)?;

        let mut channel = session.channel_session()
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to open channel: {}", e)))?;

        // Request PTY
        channel.request_pty("xterm-256color", None, Some((cols as u32, rows as u32, 0, 0)))
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to request PTY: {}", e)))?;

        // Start shell
        channel.shell()
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to start shell: {}", e)))?;

        // Set non-blocking mode
        session.set_blocking(false);

        Ok(Self {
            session_id: Uuid::new_v4().to_string(),
            server_id: server.id.clone(),
            session,
            channel,
            _tcp: tcp,
            pty_size: (cols, rows),
        })
    }

    pub fn write(&mut self, data: &[u8]) -> Result<()> {
        self.channel.write_all(data)
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to write to terminal: {}", e)))?;
        self.channel.flush()
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to flush terminal: {}", e)))?;
        Ok(())
    }

    pub fn read(&mut self) -> Result<Vec<u8>> {
        let mut buffer = vec![0u8; 4096];
        match self.channel.read(&mut buffer) {
            Ok(n) if n > 0 => {
                buffer.truncate(n);
                Ok(buffer)
            }
            Ok(_) => Ok(Vec::new()),
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => Ok(Vec::new()),
            Err(e) => Err(AppError::ConnectionFailed(format!("Failed to read from terminal: {}", e))),
        }
    }

    pub fn resize(&mut self, cols: u16, rows: u16) -> Result<()> {
        self.channel.request_pty_size(cols as u32, rows as u32, None, None)
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to resize PTY: {}", e)))?;
        self.pty_size = (cols, rows);
        Ok(())
    }

    pub fn close(&mut self) -> Result<()> {
        let _ = self.channel.send_eof();
        let _ = self.channel.wait_eof();
        let _ = self.channel.close();
        let _ = self.channel.wait_close();
        Ok(())
    }

    pub fn is_active(&self) -> bool {
        !self.channel.eof()
    }

    pub fn get_pty_size(&self) -> (u16, u16) {
        self.pty_size
    }
}
