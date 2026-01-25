use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Deployment script containing steps, variables, and rollback configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentScript {
    pub id: String,
    pub name: String,
    pub description: String,
    pub variables: Vec<Variable>,
    pub steps: Vec<Step>,
    pub rollback_steps: Vec<Step>,
    pub tags: Vec<String>,
    pub is_template: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl DeploymentScript {
    /// Create a new deployment script with generated ID and timestamps
    pub fn new(name: String, description: String) -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            description,
            variables: Vec::new(),
            steps: Vec::new(),
            rollback_steps: Vec::new(),
            tags: Vec::new(),
            is_template: false,
            created_at: now,
            updated_at: now,
        }
    }
}

/// Variable definition for script parameterization
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Variable {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub default_value: Option<String>,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub var_type: VariableType,
}

impl Variable {
    pub fn new(name: String) -> Self {
        Self {
            name,
            description: String::new(),
            default_value: None,
            required: false,
            var_type: VariableType::String,
        }
    }
}

/// Type of variable for validation and UI rendering
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum VariableType {
    #[default]
    String,
    Number,
    Boolean,
    Secret,
}

impl std::fmt::Display for VariableType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VariableType::String => write!(f, "string"),
            VariableType::Number => write!(f, "number"),
            VariableType::Boolean => write!(f, "boolean"),
            VariableType::Secret => write!(f, "secret"),
        }
    }
}

impl std::str::FromStr for VariableType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "string" => Ok(VariableType::String),
            "number" => Ok(VariableType::Number),
            "boolean" => Ok(VariableType::Boolean),
            "secret" => Ok(VariableType::Secret),
            _ => Err(format!("Invalid variable type: {}", s)),
        }
    }
}

/// A single step in a deployment script
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Step {
    pub id: String,
    pub name: String,
    pub commands: Vec<String>,
    #[serde(default)]
    pub working_dir: Option<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub condition: Option<String>,
    #[serde(default)]
    pub on_error: OnError,
    #[serde(default)]
    pub timeout: Option<u64>,
}

impl Step {
    pub fn new(name: String, commands: Vec<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            commands,
            working_dir: None,
            env: HashMap::new(),
            condition: None,
            on_error: OnError::Abort,
            timeout: None,
        }
    }
}

/// Error handling strategy for step execution
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum OnError {
    #[default]
    Abort,
    Continue,
    Rollback,
}

impl std::fmt::Display for OnError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OnError::Abort => write!(f, "abort"),
            OnError::Continue => write!(f, "continue"),
            OnError::Rollback => write!(f, "rollback"),
        }
    }
}

impl std::str::FromStr for OnError {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "abort" => Ok(OnError::Abort),
            "continue" => Ok(OnError::Continue),
            "rollback" => Ok(OnError::Rollback),
            _ => Err(format!("Invalid on_error value: {}", s)),
        }
    }
}

/// Input for creating a new deployment script
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateScriptInput {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub variables: Vec<Variable>,
    #[serde(default)]
    pub steps: Vec<Step>,
    #[serde(default)]
    pub rollback_steps: Vec<Step>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub is_template: bool,
}

/// Input for updating an existing deployment script
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateScriptInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub variables: Option<Vec<Variable>>,
    pub steps: Option<Vec<Step>>,
    pub rollback_steps: Option<Vec<Step>>,
    pub tags: Option<Vec<String>>,
    pub is_template: Option<bool>,
}

/// Result of script validation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<ValidationError>,
    pub warnings: Vec<String>,
}

impl ValidationResult {
    pub fn success() -> Self {
        Self {
            valid: true,
            errors: Vec::new(),
            warnings: Vec::new(),
        }
    }

    pub fn with_errors(errors: Vec<ValidationError>) -> Self {
        Self {
            valid: errors.is_empty(),
            errors,
            warnings: Vec::new(),
        }
    }
}

/// A single validation error
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationError {
    pub field: String,
    pub message: String,
}

impl ValidationError {
    pub fn new(field: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            field: field.into(),
            message: message.into(),
        }
    }
}
