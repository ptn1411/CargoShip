use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Server {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: AuthMethod,
    pub tags: Vec<String>,
    pub environment: Environment,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_connected: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethod {
    Password,
    SshKey,
}

impl std::fmt::Display for AuthMethod {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthMethod::Password => write!(f, "password"),
            AuthMethod::SshKey => write!(f, "ssh-key"),
        }
    }
}

impl std::str::FromStr for AuthMethod {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "password" => Ok(AuthMethod::Password),
            "ssh-key" => Ok(AuthMethod::SshKey),
            _ => Err(format!("Invalid auth method: {}", s)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Environment {
    Dev,
    Staging,
    Prod,
}

impl std::fmt::Display for Environment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Environment::Dev => write!(f, "dev"),
            Environment::Staging => write!(f, "staging"),
            Environment::Prod => write!(f, "prod"),
        }
    }
}

impl std::str::FromStr for Environment {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "dev" => Ok(Environment::Dev),
            "staging" => Ok(Environment::Staging),
            "prod" => Ok(Environment::Prod),
            _ => Err(format!("Invalid environment: {}", s)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateServerInput {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: AuthMethod,
    #[serde(default)]
    pub tags: Vec<String>,
    pub environment: Environment,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateServerInput {
    pub name: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub auth_method: Option<AuthMethod>,
    pub tags: Option<Vec<String>>,
    pub environment: Option<Environment>,
}
