use crate::credentials::CredentialStore;
use crate::error::{AppError, Result};
use crate::server::Server;
use crate::ssh::SshKeyManager;
use crate::terminal::TerminalSession;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::Duration;

const MAX_SESSIONS: usize = 10;
/// OPTIMIZATION: Auto-cleanup idle sessions after 30 minutes
const IDLE_TIMEOUT: Duration = Duration::from_secs(30 * 60);

pub struct TerminalManager {
    sessions: RwLock<HashMap<String, TerminalSession>>,
    credential_store: Arc<CredentialStore>,
    max_sessions: usize,
    ssh_key_manager: Option<Arc<SshKeyManager>>,
}

impl TerminalManager {
    pub fn new(credential_store: Arc<CredentialStore>) -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            credential_store,
            max_sessions: MAX_SESSIONS,
            ssh_key_manager: None,
        }
    }

    pub fn with_key_manager(
        credential_store: Arc<CredentialStore>,
        ssh_key_manager: Arc<SshKeyManager>,
    ) -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            credential_store,
            max_sessions: MAX_SESSIONS,
            ssh_key_manager: Some(ssh_key_manager),
        }
    }

    pub fn with_max_sessions(credential_store: Arc<CredentialStore>, max_sessions: usize) -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            credential_store,
            max_sessions,
            ssh_key_manager: None,
        }
    }

    pub fn max_sessions(&self) -> usize {
        self.max_sessions
    }

    pub fn create_session(&self, server: &Server, cols: u16, rows: u16) -> Result<String> {
        let mut sessions = self.sessions.write().unwrap();

        // OPTIMIZATION: Clean up both closed and idle sessions
        self.cleanup_sessions_internal(&mut sessions);

        if sessions.len() >= self.max_sessions {
            return Err(AppError::SessionLimitExceeded(self.max_sessions));
        }

        let session = TerminalSession::create(
            server,
            &self.credential_store,
            self.ssh_key_manager.as_ref(),
            cols,
            rows,
        )?;
        let session_id = session.session_id.clone();
        sessions.insert(session_id.clone(), session);

        Ok(session_id)
    }

    /// OPTIMIZATION: Batch write with automatic flush
    pub fn write_to_session(&self, session_id: &str, data: &[u8]) -> Result<()> {
        let mut sessions = self.sessions.write().unwrap();
        let session = sessions.get_mut(session_id).ok_or_else(|| {
            AppError::ServerNotFound(format!("Session not found: {}", session_id))
        })?;
        session.write(data)
    }

    /// OPTIMIZATION: Explicit flush for buffered writes
    pub fn flush_session(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.write().unwrap();
        let session = sessions.get_mut(session_id).ok_or_else(|| {
            AppError::ServerNotFound(format!("Session not found: {}", session_id))
        })?;
        session.flush()
    }

    pub fn read_from_session(&self, session_id: &str) -> Result<Vec<u8>> {
        let mut sessions = self.sessions.write().unwrap();
        let session = sessions.get_mut(session_id).ok_or_else(|| {
            AppError::ServerNotFound(format!("Session not found: {}", session_id))
        })?;
        session.read()
    }

    pub fn resize_session(&self, session_id: &str, cols: u16, rows: u16) -> Result<()> {
        let mut sessions = self.sessions.write().unwrap();
        let session = sessions.get_mut(session_id).ok_or_else(|| {
            AppError::ServerNotFound(format!("Session not found: {}", session_id))
        })?;
        session.resize(cols, rows)
    }

    pub fn close_session(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.write().unwrap();
        if let Some(mut session) = sessions.remove(session_id) {
            session.close()?;
        }
        Ok(())
    }

    pub fn has_session(&self, session_id: &str) -> bool {
        self.sessions.read().unwrap().contains_key(session_id)
    }

    pub fn session_count(&self) -> usize {
        self.sessions.read().unwrap().len()
    }

    pub fn active_session_ids(&self) -> Vec<String> {
        self.sessions.read().unwrap().keys().cloned().collect()
    }

    /// OPTIMIZATION: Clean up both inactive and idle sessions
    pub fn cleanup_inactive(&self) -> usize {
        let mut sessions = self.sessions.write().unwrap();
        self.cleanup_sessions_internal(&mut sessions)
    }

    /// Internal cleanup logic (must be called with write lock)
    fn cleanup_sessions_internal(&self, sessions: &mut HashMap<String, TerminalSession>) -> usize {
        let before = sessions.len();
        sessions.retain(|_, session| session.is_active() && session.idle_time() < IDLE_TIMEOUT);
        before - sessions.len()
    }

    /// OPTIMIZATION: Get session info for monitoring
    pub fn get_session_info(&self) -> Vec<SessionInfo> {
        let sessions = self.sessions.read().unwrap();
        sessions
            .iter()
            .map(|(id, session)| SessionInfo {
                session_id: id.clone(),
                server_id: session.server_id.clone(),
                pty_size: session.get_pty_size(),
                is_active: session.is_active(),
                idle_seconds: session.idle_time().as_secs(),
            })
            .collect()
    }

    pub fn close_all(&self) {
        let mut sessions = self.sessions.write().unwrap();
        for (_, mut session) in sessions.drain() {
            let _ = session.close();
        }
    }
}

impl Drop for TerminalManager {
    fn drop(&mut self) {
        self.close_all();
    }
}

/// Session information for monitoring
#[derive(Debug, Clone)]
pub struct SessionInfo {
    pub session_id: String,
    pub server_id: String,
    pub pty_size: (u16, u16),
    pub is_active: bool,
    pub idle_seconds: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_terminal_manager_new() {
        let credential_store = Arc::new(CredentialStore::new());
        let manager = TerminalManager::new(credential_store);
        assert_eq!(manager.max_sessions(), MAX_SESSIONS);
        assert_eq!(manager.session_count(), 0);
    }

    #[test]
    fn test_terminal_manager_with_max_sessions() {
        let credential_store = Arc::new(CredentialStore::new());
        let manager = TerminalManager::with_max_sessions(credential_store, 5);
        assert_eq!(manager.max_sessions(), 5);
    }

    #[test]
    fn test_session_count_empty() {
        let credential_store = Arc::new(CredentialStore::new());
        let manager = TerminalManager::new(credential_store);
        assert_eq!(manager.session_count(), 0);
    }

    #[test]
    fn test_get_session_info_empty() {
        let credential_store = Arc::new(CredentialStore::new());
        let manager = TerminalManager::new(credential_store);
        assert!(manager.get_session_info().is_empty());
    }
}
