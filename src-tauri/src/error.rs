use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Server not found: {0}")]
    ServerNotFound(String),

    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),

    #[error("Command execution failed: {0}")]
    CommandFailed(String),

    #[error("File operation failed: {0}")]
    FileOperationFailed(String),

    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("Credential store error: {0}")]
    CredentialError(String),

    #[error("Validation error: {0}")]
    ValidationError(String),

    #[error("Duplicate server warning: A server with host '{0}', port {1}, and username '{2}' already exists")]
    DuplicateServerWarning(String, u16, String),

    #[error("Session limit exceeded: maximum {0} sessions allowed")]
    SessionLimitExceeded(usize),

    #[error("Connection pool exhausted: maximum {0} connections allowed")]
    ConnectionPoolExhausted(usize),

    #[error("SUDO_PASSWORD_REQUIRED")]
    SudoPasswordRequired,
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        AppError::DatabaseError(err.to_string())
    }
}

impl From<ssh2::Error> for AppError {
    fn from(err: ssh2::Error) -> Self {
        AppError::ConnectionFailed(err.to_string())
    }
}

impl From<keyring::Error> for AppError {
    fn from(err: keyring::Error) -> Self {
        AppError::CredentialError(err.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::FileOperationFailed(err.to_string())
    }
}

// Convert AppError to String for Tauri commands
impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
