use crate::credentials::CredentialStore;
use crate::error::{AppError, Result};
use crate::server::Server;
use super::session::TerminalSession;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

const MAX_SESSIONS: usize = 10;

pub struct TerminalManager {
    sessions: RwLock<HashMap<String, TerminalSession>>,
    credential_store: Arc<CredentialStore>,
    max_sessions: usize,
}

impl TerminalManager {
    pub fn new(credential_store: Arc<CredentialStore>) -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            credential_store,
            max_sessions: MAX_SESSIONS,
        }
    }

    /// Create a new TerminalManager with a custom session limit
    pub fn with_max_sessions(credential_store: Arc<CredentialStore>, max_sessions: usize) -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            credential_store,
            max_sessions,
        }
    }

    /// Get the maximum number of sessions allowed
    pub fn max_sessions(&self) -> usize {
        self.max_sessions
    }

    pub fn create_session(&self, server: &Server, cols: u16, rows: u16) -> Result<String> {
        let mut sessions = self.sessions.write().unwrap();

        // Clean up closed sessions
        sessions.retain(|_, session| session.is_active());

        if sessions.len() >= self.max_sessions {
            return Err(AppError::SessionLimitExceeded(self.max_sessions));
        }

        let session = TerminalSession::create(server, &self.credential_store, cols, rows)?;
        let session_id = session.session_id.clone();
        sessions.insert(session_id.clone(), session);

        Ok(session_id)
    }

    pub fn write_to_session(&self, session_id: &str, data: &[u8]) -> Result<()> {
        let mut sessions = self.sessions.write().unwrap();
        let session = sessions.get_mut(session_id)
            .ok_or_else(|| AppError::ServerNotFound(format!("Session not found: {}", session_id)))?;
        session.write(data)
    }

    pub fn read_from_session(&self, session_id: &str) -> Result<Vec<u8>> {
        let mut sessions = self.sessions.write().unwrap();
        let session = sessions.get_mut(session_id)
            .ok_or_else(|| AppError::ServerNotFound(format!("Session not found: {}", session_id)))?;
        session.read()
    }

    pub fn resize_session(&self, session_id: &str, cols: u16, rows: u16) -> Result<()> {
        let mut sessions = self.sessions.write().unwrap();
        let session = sessions.get_mut(session_id)
            .ok_or_else(|| AppError::ServerNotFound(format!("Session not found: {}", session_id)))?;
        session.resize(cols, rows)
    }

    pub fn close_session(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.write().unwrap();
        if let Some(mut session) = sessions.remove(session_id) {
            session.close()?;
        }
        Ok(())
    }

    /// Check if a session exists
    pub fn has_session(&self, session_id: &str) -> bool {
        self.sessions.read().unwrap().contains_key(session_id)
    }

    pub fn session_count(&self) -> usize {
        self.sessions.read().unwrap().len()
    }

    pub fn active_session_ids(&self) -> Vec<String> {
        self.sessions.read().unwrap().keys().cloned().collect()
    }

    /// Clean up inactive sessions
    pub fn cleanup_inactive(&self) -> usize {
        let mut sessions = self.sessions.write().unwrap();
        let before = sessions.len();
        sessions.retain(|_, session| session.is_active());
        before - sessions.len()
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
    fn test_active_session_ids_empty() {
        let credential_store = Arc::new(CredentialStore::new());
        let manager = TerminalManager::new(credential_store);
        assert!(manager.active_session_ids().is_empty());
    }

    #[test]
    fn test_has_session_nonexistent() {
        let credential_store = Arc::new(CredentialStore::new());
        let manager = TerminalManager::new(credential_store);
        assert!(!manager.has_session("nonexistent"));
    }

    #[test]
    fn test_close_session_nonexistent() {
        let credential_store = Arc::new(CredentialStore::new());
        let manager = TerminalManager::new(credential_store);
        // Should not panic or error
        assert!(manager.close_session("nonexistent").is_ok());
    }

    #[test]
    fn test_close_all_empty() {
        let credential_store = Arc::new(CredentialStore::new());
        let manager = TerminalManager::new(credential_store);
        manager.close_all();
        assert_eq!(manager.session_count(), 0);
    }

    #[test]
    fn test_cleanup_inactive_empty() {
        let credential_store = Arc::new(CredentialStore::new());
        let manager = TerminalManager::new(credential_store);
        let cleaned = manager.cleanup_inactive();
        assert_eq!(cleaned, 0);
    }
}
