use crate::credentials::CredentialStore;
use crate::error::{AppError, Result};
use crate::server::Server;
use crate::ssh::{create_ssh_session, authenticate_session};
use ssh2::Channel;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Arc;
use std::time::{Duration, Instant};
use uuid::Uuid;

pub struct TerminalSession {
    pub session_id: String,
    pub server_id: String,
    #[allow(dead_code)]
    session: ssh2::Session,
    channel: Channel,
    #[allow(dead_code)]
    _tcp: TcpStream,
    pty_size: (u16, u16),
    /// OPTIMIZATION: Track last activity for cleanup
    last_activity: Instant,
    /// OPTIMIZATION: Buffer for batching small writes
    write_buffer: Vec<u8>,
    /// OPTIMIZATION: Read buffer with higher capacity
    read_buffer: Vec<u8>,
}

impl TerminalSession {
    /// OPTIMIZATION: Increased buffer sizes for better throughput
    const WRITE_BUFFER_SIZE: usize = 8192;
    const READ_BUFFER_SIZE: usize = 16384;
    const FLUSH_INTERVAL: Duration = Duration::from_millis(50);

    pub fn create(
        server: &Server,
        credential_store: &Arc<CredentialStore>,
        cols: u16,
        rows: u16,
    ) -> Result<Self> {
        // Use optimized connection with faster timeouts
        let (session, tcp) = create_ssh_session(&server.host, server.port)?;

        authenticate_session(&session, server, credential_store)?;

        let mut channel = session.channel_session()
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to open channel: {}", e)))?;

        // OPTIMIZATION: Set TCP_NODELAY on the underlying stream
        if let Err(e) = tcp.set_nodelay(true) {
            eprintln!("Warning: Failed to set TCP_NODELAY: {}", e);
        }

        // Request PTY with xterm-256color
        channel.request_pty("xterm-256color", None, Some((cols as u32, rows as u32, 0, 0)))
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to request PTY: {}", e)))?;

        // Start shell
        channel.shell()
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to start shell: {}", e)))?;

        // Set non-blocking mode for async I/O
        session.set_blocking(false);

        Ok(Self {
            session_id: Uuid::new_v4().to_string(),
            server_id: server.id.clone(),
            session,
            channel,
            _tcp: tcp,
            pty_size: (cols, rows),
            last_activity: Instant::now(),
            write_buffer: Vec::with_capacity(Self::WRITE_BUFFER_SIZE),
            read_buffer: vec![0u8; Self::READ_BUFFER_SIZE],
        })
    }

    /// Write data to terminal - always flush immediately for interactive use
    pub fn write(&mut self, data: &[u8]) -> Result<()> {
        self.last_activity = Instant::now();
        
        // For interactive terminal, always write and flush immediately
        // This ensures keystrokes are sent right away so the server can echo them back
        self.write_direct(data)
    }

    /// Direct write without buffering
    fn write_direct(&mut self, data: &[u8]) -> Result<()> {
        self.channel.write_all(data)
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to write to terminal: {}", e)))?;
        self.channel.flush()
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to flush terminal: {}", e)))?;
        Ok(())
    }

    /// Internal flush implementation
    fn flush_internal(&mut self) -> Result<()> {
        if self.write_buffer.is_empty() {
            return Ok(());
        }

        self.channel.write_all(&self.write_buffer)
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to write to terminal: {}", e)))?;
        self.channel.flush()
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to flush terminal: {}", e)))?;
        
        self.write_buffer.clear();
        Ok(())
    }

    /// Public flush method
    pub fn flush(&mut self) -> Result<()> {
        self.flush_internal()
    }

    /// OPTIMIZATION: Read with larger buffer and error handling
    pub fn read(&mut self) -> Result<Vec<u8>> {
        self.last_activity = Instant::now();

        let mut result = Vec::new();
        
        // Read in loop to get all available data
        loop {
            match self.channel.read(&mut self.read_buffer) {
                Ok(0) => break, // No more data
                Ok(n) => {
                    result.extend_from_slice(&self.read_buffer[..n]);
                    // If we got less than buffer size, likely no more data
                    if n < self.read_buffer.len() {
                        break;
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                Err(e) => {
                    return Err(AppError::ConnectionFailed(
                        format!("Failed to read from terminal: {}", e)
                    ));
                }
            }
        }

        Ok(result)
    }

    pub fn resize(&mut self, cols: u16, rows: u16) -> Result<()> {
        self.last_activity = Instant::now();
        self.channel.request_pty_size(cols as u32, rows as u32, None, None)
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to resize PTY: {}", e)))?;
        self.pty_size = (cols, rows);
        Ok(())
    }

    pub fn close(&mut self) -> Result<()> {
        // Flush any pending writes
        let _ = self.flush_internal();
        
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

    /// Get time since last activity
    pub fn idle_time(&self) -> Duration {
        self.last_activity.elapsed()
    }
}