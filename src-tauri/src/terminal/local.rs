use crate::error::{AppError, Result};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use uuid::Uuid;

struct LocalTerminalSession {
    #[allow(dead_code)]
    name: String,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    #[allow(dead_code)]
    last_activity: Instant,
}

// Wrapper for reader with its own mutex to avoid contention
pub struct SessionReader {
    reader: Mutex<Box<dyn Read + Send>>,
    closed: Mutex<bool>,
}

impl SessionReader {
    pub fn new(reader: Box<dyn Read + Send>) -> Self {
        Self {
            reader: Mutex::new(reader),
            closed: Mutex::new(false),
        }
    }

    pub fn read(&self) -> Result<Vec<u8>> {
        // Check if closed first
        if *self.closed.lock().unwrap() {
            return Err(AppError::ConnectionFailed("Session closed".to_string()));
        }

        // Try to get lock, return empty if can't (non-blocking)
        let mut reader = match self.reader.try_lock() {
            Ok(r) => r,
            Err(_) => return Ok(Vec::new()),
        };

        let mut buf = vec![0u8; 4096];

        match reader.read(&mut buf) {
            Ok(0) => Ok(Vec::new()),
            Ok(n) => Ok(buf[..n].to_vec()),
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => Ok(Vec::new()),
            Err(e) => Err(AppError::ConnectionFailed(format!(
                "Failed to read from terminal: {}",
                e
            ))),
        }
    }

    pub fn mark_closed(&self) {
        *self.closed.lock().unwrap() = true;
    }
}

// Wrapper to make the manager Send + Sync
pub struct LocalTerminalManager {
    sessions: Mutex<HashMap<String, LocalTerminalSession>>,
    readers: Mutex<HashMap<String, Arc<SessionReader>>>,
    max_sessions: usize,
}

// Safety: We use Mutex to ensure exclusive access
unsafe impl Send for LocalTerminalManager {}
unsafe impl Sync for LocalTerminalManager {}

impl LocalTerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            readers: Mutex::new(HashMap::new()),
            max_sessions: 5,
        }
    }

    pub fn create_session(&self, cols: u16, rows: u16) -> Result<String> {
        let mut sessions = self.sessions.lock().unwrap();

        if sessions.len() >= self.max_sessions {
            return Err(AppError::SessionLimitExceeded(self.max_sessions));
        }

        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to open PTY: {}", e)))?;

        // Get the default shell
        #[cfg(windows)]
        let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());

        #[cfg(not(windows))]
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

        let mut cmd = CommandBuilder::new(&shell);

        // Set working directory to user's home
        if let Some(home) = dirs::home_dir() {
            cmd.cwd(home);
        }

        // Spawn the shell
        let _child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to spawn shell: {}", e)))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to get PTY writer: {}", e)))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to get PTY reader: {}", e)))?;

        let session_id = Uuid::new_v4().to_string();

        let session = LocalTerminalSession {
            name: "Local".to_string(),
            master: pair.master,
            writer,
            last_activity: Instant::now(),
        };

        sessions.insert(session_id.clone(), session);

        // Store reader separately with its own Arc
        let mut readers = self.readers.lock().unwrap();
        readers.insert(session_id.clone(), Arc::new(SessionReader::new(reader)));

        Ok(session_id)
    }

    pub fn write_to_session(&self, session_id: &str, data: &[u8]) -> Result<()> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.get_mut(session_id).ok_or_else(|| {
            AppError::ServerNotFound(format!("Local session not found: {}", session_id))
        })?;

        session.writer.write_all(data).map_err(|e| {
            AppError::ConnectionFailed(format!("Failed to write to terminal: {}", e))
        })?;
        session
            .writer
            .flush()
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to flush terminal: {}", e)))?;
        session.last_activity = Instant::now();
        Ok(())
    }

    pub fn get_reader(&self, session_id: &str) -> Option<Arc<SessionReader>> {
        let readers = self.readers.lock().unwrap();
        readers.get(session_id).cloned()
    }

    pub fn read_from_session(&self, session_id: &str) -> Result<Vec<u8>> {
        let reader = self.get_reader(session_id).ok_or_else(|| {
            AppError::ServerNotFound(format!("Local session not found: {}", session_id))
        })?;

        reader.read()
    }

    pub fn resize_session(&self, session_id: &str, cols: u16, rows: u16) -> Result<()> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions.get(session_id).ok_or_else(|| {
            AppError::ServerNotFound(format!("Local session not found: {}", session_id))
        })?;

        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::ConnectionFailed(format!("Failed to resize PTY: {}", e)))?;
        Ok(())
    }

    pub fn close_session(&self, session_id: &str) -> Result<()> {
        // Mark reader as closed first (this will cause read loop to exit)
        {
            let readers = self.readers.lock().unwrap();
            if let Some(reader) = readers.get(session_id) {
                reader.mark_closed();
            }
        }

        // Remove reader from map
        {
            let mut readers = self.readers.lock().unwrap();
            readers.remove(session_id);
        }

        // Then remove session (this drops the PTY which closes the shell)
        let mut sessions = self.sessions.lock().unwrap();
        sessions.remove(session_id);
        Ok(())
    }

    pub fn has_session(&self, session_id: &str) -> bool {
        self.sessions.lock().unwrap().contains_key(session_id)
    }

    #[allow(dead_code)]
    pub fn session_count(&self) -> usize {
        self.sessions.lock().unwrap().len()
    }

    #[allow(dead_code)]
    pub fn close_all(&self) {
        // Mark all readers as closed
        {
            let readers = self.readers.lock().unwrap();
            for reader in readers.values() {
                reader.mark_closed();
            }
        }

        let mut readers = self.readers.lock().unwrap();
        readers.clear();
        let mut sessions = self.sessions.lock().unwrap();
        sessions.clear();
    }
}

impl Default for LocalTerminalManager {
    fn default() -> Self {
        Self::new()
    }
}
