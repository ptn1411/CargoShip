use crate::credentials::CredentialStore;
use crate::error::{AppError, Result};
use crate::scripts::models::{DeploymentScript, Variable, VariableType};
use crate::server::Server;
use chrono::{DateTime, Utc};
use regex::Regex;
use std::collections::HashMap;
use std::sync::Arc;

/// Context for variable resolution during script execution
#[derive(Debug, Clone)]
pub struct ExecutionContext {
    pub server: Option<Server>,
    pub user: String,
    pub timestamp: DateTime<Utc>,
}

impl ExecutionContext {
    pub fn new(server: Option<Server>, user: String) -> Self {
        Self {
            server,
            user,
            timestamp: Utc::now(),
        }
    }

    pub fn default_context() -> Self {
        Self {
            server: None,
            user: whoami::username(),
            timestamp: Utc::now(),
        }
    }
}

/// Variable Resolver handles variable interpolation in deployment scripts
/// 
/// Supports:
/// - User-defined variables: {{variable_name}}
/// - Dynamic variables: {{date}}, {{timestamp}}, {{user}}, {{server_name}}
/// - Secret variables: Retrieved from CredentialStore
/// - Default values: Used when variable not provided
/// - Nested variables: Variables within variable values
pub struct VariableResolver {
    credential_store: Arc<CredentialStore>,
}

impl VariableResolver {
    pub fn new(credential_store: Arc<CredentialStore>) -> Self {
        Self { credential_store }
    }

    /// Resolve all variables in a template string
    /// 
    /// # Arguments
    /// * `template` - String containing {{variable}} patterns
    /// * `variables` - Map of variable names to values
    /// * `context` - Execution context for dynamic variables
    /// 
    /// # Returns
    /// * `Ok(String)` - Template with all variables replaced
    /// * `Err(AppError)` - If a required variable is missing or resolution fails
    /// 
    /// # Requirements: 4.1
    pub fn resolve(
        &self,
        template: &str,
        variables: &HashMap<String, String>,
        context: &ExecutionContext,
    ) -> Result<String> {
        self.resolve_with_script(template, variables, context, &[])
    }

    /// Resolve all variables in a template string with script variable definitions
    /// 
    /// This method supports secret variable handling by checking variable types
    /// from the script definition and retrieving secrets from CredentialStore.
    /// 
    /// # Arguments
    /// * `template` - String containing {{variable}} patterns
    /// * `variables` - Map of variable names to values
    /// * `context` - Execution context for dynamic variables
    /// * `script_variables` - Variable definitions from the script (for type checking)
    /// 
    /// # Returns
    /// * `Ok(String)` - Template with all variables replaced
    /// * `Err(AppError)` - If a required variable is missing or resolution fails
    /// 
    /// # Requirements: 4.1, 4.4
    pub fn resolve_with_script(
        &self,
        template: &str,
        variables: &HashMap<String, String>,
        context: &ExecutionContext,
        script_variables: &[Variable],
    ) -> Result<String> {
        self.resolve_with_depth(template, variables, context, script_variables, 0)
    }

    /// Internal resolve function with depth tracking to prevent infinite recursion
    fn resolve_with_depth(
        &self,
        template: &str,
        variables: &HashMap<String, String>,
        context: &ExecutionContext,
        script_variables: &[Variable],
        depth: usize,
    ) -> Result<String> {
        const MAX_DEPTH: usize = 10;
        
        if depth > MAX_DEPTH {
            return Err(AppError::ValidationError(
                "Maximum variable nesting depth exceeded (possible circular reference)".to_string()
            ));
        }

        let mut result = template.to_string();
        let var_pattern = Regex::new(r"\{\{([^}]+)\}\}").unwrap();
        
        // Find all variables in the template
        let matches: Vec<(String, String)> = var_pattern
            .captures_iter(template)
            .map(|cap| (cap[0].to_string(), cap[1].trim().to_string()))
            .collect();

        for (full_match, var_name) in matches {
            let value = self.get_variable_value(&var_name, variables, context, script_variables)?;
            
            // Recursively resolve nested variables in the value
            let resolved_value = self.resolve_with_depth(&value, variables, context, script_variables, depth + 1)?;
            
            result = result.replace(&full_match, &resolved_value);
        }

        Ok(result)
    }

    /// Get the value for a single variable
    /// 
    /// Resolution order:
    /// 1. Dynamic variables (date, timestamp, user, server_name, etc.)
    /// 2. Secret variables (retrieved from CredentialStore)
    /// 3. User-provided variables
    /// 4. Default values from script variable definitions
    /// 
    /// # Requirements: 4.3, 4.4
    fn get_variable_value(
        &self,
        var_name: &str,
        variables: &HashMap<String, String>,
        context: &ExecutionContext,
        script_variables: &[Variable],
    ) -> Result<String> {
        // Check if it's a dynamic variable first
        if let Some(value) = self.get_dynamic_variable(var_name, context) {
            return Ok(value);
        }

        // Find the variable definition if it exists
        let var_def = script_variables.iter().find(|v| v.name == var_name);

        // Check if this is a secret variable
        if let Some(def) = var_def {
            if def.var_type == VariableType::Secret {
                return self.get_secret_variable(var_name, variables, def);
            }
        }

        // Check user-provided variables
        if let Some(value) = variables.get(var_name) {
            return Ok(value.clone());
        }

        // Check for default value in script variable definitions (Requirements 4.3)
        if let Some(def) = var_def {
            if let Some(default_value) = &def.default_value {
                return Ok(default_value.clone());
            }
        }

        // Variable not found
        Err(AppError::ValidationError(format!(
            "Undefined variable: '{}'", var_name
        )))
    }

    /// Retrieve a secret variable from the CredentialStore
    /// 
    /// Secret variables can be provided in two ways:
    /// 1. As a credential key in the format "credential:<server_id>" - retrieves from CredentialStore
    /// 2. As a direct value in the variables map (for runtime-provided secrets)
    /// 3. As a default value from the variable definition (Requirements 4.3)
    /// 
    /// # Arguments
    /// * `var_name` - The name of the secret variable
    /// * `variables` - Map of variable names to values (may contain credential key or direct value)
    /// * `var_def` - The variable definition (for default value fallback)
    /// 
    /// # Returns
    /// * `Ok(String)` - The secret value
    /// * `Err(AppError)` - If the secret cannot be retrieved
    /// 
    /// # Requirements: 4.3, 4.4
    fn get_secret_variable(
        &self,
        var_name: &str,
        variables: &HashMap<String, String>,
        var_def: &Variable,
    ) -> Result<String> {
        // Check if a value was provided in the variables map
        if let Some(value) = variables.get(var_name) {
            // Check if it's a credential reference (format: "credential:<server_id>")
            if let Some(server_id) = value.strip_prefix("credential:") {
                return self.credential_store.retrieve_password(server_id);
            }
            // Direct value provided
            return Ok(value.clone());
        }

        // Check for default value (Requirements 4.3)
        if let Some(default_value) = &var_def.default_value {
            // Check if default is a credential reference
            if let Some(server_id) = default_value.strip_prefix("credential:") {
                return self.credential_store.retrieve_password(server_id);
            }
            return Ok(default_value.clone());
        }

        // No value provided for secret variable
        Err(AppError::ValidationError(format!(
            "Secret variable '{}' not provided. Provide a value or use 'credential:<server_id>' to reference stored credentials.",
            var_name
        )))
    }

    /// Get value for dynamic variables
    /// 
    /// # Requirements: 4.5
    pub fn get_dynamic_variable(&self, name: &str, context: &ExecutionContext) -> Option<String> {
        match name {
            "date" => Some(context.timestamp.format("%Y-%m-%d").to_string()),
            "timestamp" => Some(context.timestamp.format("%Y-%m-%d_%H-%M-%S").to_string()),
            "user" => Some(context.user.clone()),
            "server_name" => context.server.as_ref().map(|s| s.name.clone()),
            "server_host" => context.server.as_ref().map(|s| s.host.clone()),
            "server_user" => context.server.as_ref().map(|s| s.username.clone()),
            _ => None,
        }
    }

    /// Extract all variable names from a template string
    pub fn extract_variables(&self, template: &str) -> Vec<String> {
        let var_pattern = Regex::new(r"\{\{([^}]+)\}\}").unwrap();
        var_pattern
            .captures_iter(template)
            .map(|cap| cap[1].trim().to_string())
            .collect()
    }

    /// Check if a variable name is a dynamic variable
    pub fn is_dynamic_variable(&self, name: &str) -> bool {
        matches!(name, "date" | "timestamp" | "user" | "server_name" | "server_host" | "server_user")
    }

    /// Validate that all required variables are provided
    /// 
    /// # Arguments
    /// * `script` - The deployment script containing variable definitions
    /// * `provided` - Map of variable names to values that were provided
    /// 
    /// # Returns
    /// * `Ok(())` - If all required variables are provided
    /// * `Err(AppError)` - If any required variables are missing, with their names listed
    /// 
    /// # Requirements: 4.2
    pub fn validate_required(
        &self,
        script: &DeploymentScript,
        provided: &HashMap<String, String>,
    ) -> Result<()> {
        let missing: Vec<String> = script
            .variables
            .iter()
            .filter(|var| var.required)
            .filter(|var| !provided.contains_key(&var.name))
            .filter(|var| !self.is_dynamic_variable(&var.name))
            .map(|var| var.name.clone())
            .collect();

        if missing.is_empty() {
            Ok(())
        } else {
            Err(AppError::ValidationError(format!(
                "Missing required variables: {}",
                missing.join(", ")
            )))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scripts::models::{Variable, VariableType, Step};

    fn test_resolver() -> VariableResolver {
        VariableResolver::new(Arc::new(CredentialStore::new()))
    }

    fn test_context() -> ExecutionContext {
        ExecutionContext {
            server: Some(Server {
                id: "test-server".to_string(),
                name: "Production Server".to_string(),
                host: "192.168.1.100".to_string(),
                port: 22,
                username: "deploy".to_string(),
                auth_method: crate::server::AuthMethod::Password,
                tags: vec![],
                environment: crate::server::Environment::Prod,
                use_sudo: false,
                created_at: Utc::now(),
                updated_at: Utc::now(),
                last_connected: None,
            }),
            user: "testuser".to_string(),
            timestamp: chrono::DateTime::parse_from_rfc3339("2024-01-15T10:30:00Z")
                .unwrap()
                .with_timezone(&Utc),
        }
    }

    fn test_script_with_variables(variables: Vec<Variable>) -> DeploymentScript {
        DeploymentScript {
            id: "test-script".to_string(),
            name: "Test Script".to_string(),
            description: "A test script".to_string(),
            variables,
            steps: vec![Step::new("test".to_string(), vec!["echo test".to_string()])],
            rollback_steps: vec![],
            tags: vec![],
            is_template: false,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn test_simple_variable_interpolation() {
        let resolver = test_resolver();
        let context = test_context();
        let mut vars = HashMap::new();
        vars.insert("app_name".to_string(), "myapp".to_string());
        vars.insert("version".to_string(), "1.0.0".to_string());

        let template = "Deploying {{app_name}} version {{version}}";
        let result = resolver.resolve(template, &vars, &context).unwrap();
        
        assert_eq!(result, "Deploying myapp version 1.0.0");
    }

    #[test]
    fn test_variable_with_spaces() {
        let resolver = test_resolver();
        let context = test_context();
        let mut vars = HashMap::new();
        vars.insert("app_name".to_string(), "myapp".to_string());

        let template = "Deploying {{ app_name }}";
        let result = resolver.resolve(template, &vars, &context).unwrap();
        
        assert_eq!(result, "Deploying myapp");
    }

    #[test]
    fn test_nested_variables() {
        let resolver = test_resolver();
        let context = test_context();
        let mut vars = HashMap::new();
        vars.insert("base_path".to_string(), "/var/www/{{app_name}}".to_string());
        vars.insert("app_name".to_string(), "myapp".to_string());

        let template = "Deploy to {{base_path}}";
        let result = resolver.resolve(template, &vars, &context).unwrap();
        
        assert_eq!(result, "Deploy to /var/www/myapp");
    }

    #[test]
    fn test_undefined_variable_error() {
        let resolver = test_resolver();
        let context = test_context();
        let vars = HashMap::new();

        let template = "Deploying {{undefined_var}}";
        let result = resolver.resolve(template, &vars, &context);
        
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("undefined_var"));
    }

    #[test]
    fn test_dynamic_variable_date() {
        let resolver = test_resolver();
        let context = test_context();
        let vars = HashMap::new();

        let template = "Backup created on {{date}}";
        let result = resolver.resolve(template, &vars, &context).unwrap();
        
        assert_eq!(result, "Backup created on 2024-01-15");
    }

    #[test]
    fn test_dynamic_variable_timestamp() {
        let resolver = test_resolver();
        let context = test_context();
        let vars = HashMap::new();

        let template = "Log file: app_{{timestamp}}.log";
        let result = resolver.resolve(template, &vars, &context).unwrap();
        
        assert_eq!(result, "Log file: app_2024-01-15_10-30-00.log");
    }

    #[test]
    fn test_dynamic_variable_user() {
        let resolver = test_resolver();
        let context = test_context();
        let vars = HashMap::new();

        let template = "Deployed by {{user}}";
        let result = resolver.resolve(template, &vars, &context).unwrap();
        
        assert_eq!(result, "Deployed by testuser");
    }

    #[test]
    fn test_dynamic_variable_server_name() {
        let resolver = test_resolver();
        let context = test_context();
        let vars = HashMap::new();

        let template = "Deploying to {{server_name}}";
        let result = resolver.resolve(template, &vars, &context).unwrap();
        
        assert_eq!(result, "Deploying to Production Server");
    }

    #[test]
    fn test_extract_variables() {
        let resolver = test_resolver();
        let template = "Deploy {{app_name}} to {{server}} with {{config}}";
        
        let vars = resolver.extract_variables(template);
        
        assert_eq!(vars.len(), 3);
        assert!(vars.contains(&"app_name".to_string()));
        assert!(vars.contains(&"server".to_string()));
        assert!(vars.contains(&"config".to_string()));
    }

    #[test]
    fn test_no_variables() {
        let resolver = test_resolver();
        let context = test_context();
        let vars = HashMap::new();

        let template = "No variables here";
        let result = resolver.resolve(template, &vars, &context).unwrap();
        
        assert_eq!(result, "No variables here");
    }

    #[test]
    fn test_multiple_same_variable() {
        let resolver = test_resolver();
        let context = test_context();
        let mut vars = HashMap::new();
        vars.insert("name".to_string(), "test".to_string());

        let template = "{{name}} and {{name}} again";
        let result = resolver.resolve(template, &vars, &context).unwrap();
        
        assert_eq!(result, "test and test again");
    }

    // Tests for validate_required (Requirements 4.2)

    #[test]
    fn test_validate_required_all_provided() {
        let resolver = test_resolver();
        let script = test_script_with_variables(vec![
            Variable {
                name: "app_name".to_string(),
                description: "Application name".to_string(),
                default_value: None,
                required: true,
                var_type: VariableType::String,
            },
            Variable {
                name: "version".to_string(),
                description: "Version".to_string(),
                default_value: None,
                required: true,
                var_type: VariableType::String,
            },
        ]);

        let mut provided = HashMap::new();
        provided.insert("app_name".to_string(), "myapp".to_string());
        provided.insert("version".to_string(), "1.0.0".to_string());

        let result = resolver.validate_required(&script, &provided);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_required_missing_one() {
        let resolver = test_resolver();
        let script = test_script_with_variables(vec![
            Variable {
                name: "app_name".to_string(),
                description: "Application name".to_string(),
                default_value: None,
                required: true,
                var_type: VariableType::String,
            },
            Variable {
                name: "version".to_string(),
                description: "Version".to_string(),
                default_value: None,
                required: true,
                var_type: VariableType::String,
            },
        ]);

        let mut provided = HashMap::new();
        provided.insert("app_name".to_string(), "myapp".to_string());
        // version is missing

        let result = resolver.validate_required(&script, &provided);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("version"));
        assert!(err.contains("Missing required variables"));
    }

    #[test]
    fn test_validate_required_missing_multiple() {
        let resolver = test_resolver();
        let script = test_script_with_variables(vec![
            Variable {
                name: "app_name".to_string(),
                description: "Application name".to_string(),
                default_value: None,
                required: true,
                var_type: VariableType::String,
            },
            Variable {
                name: "version".to_string(),
                description: "Version".to_string(),
                default_value: None,
                required: true,
                var_type: VariableType::String,
            },
            Variable {
                name: "env".to_string(),
                description: "Environment".to_string(),
                default_value: None,
                required: true,
                var_type: VariableType::String,
            },
        ]);

        let provided = HashMap::new(); // All missing

        let result = resolver.validate_required(&script, &provided);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("app_name"));
        assert!(err.contains("version"));
        assert!(err.contains("env"));
    }

    #[test]
    fn test_validate_required_optional_not_required() {
        let resolver = test_resolver();
        let script = test_script_with_variables(vec![
            Variable {
                name: "app_name".to_string(),
                description: "Application name".to_string(),
                default_value: None,
                required: true,
                var_type: VariableType::String,
            },
            Variable {
                name: "optional_var".to_string(),
                description: "Optional variable".to_string(),
                default_value: Some("default".to_string()),
                required: false,
                var_type: VariableType::String,
            },
        ]);

        let mut provided = HashMap::new();
        provided.insert("app_name".to_string(), "myapp".to_string());
        // optional_var is not provided but it's not required

        let result = resolver.validate_required(&script, &provided);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_required_no_required_variables() {
        let resolver = test_resolver();
        let script = test_script_with_variables(vec![
            Variable {
                name: "optional1".to_string(),
                description: "Optional 1".to_string(),
                default_value: Some("default1".to_string()),
                required: false,
                var_type: VariableType::String,
            },
            Variable {
                name: "optional2".to_string(),
                description: "Optional 2".to_string(),
                default_value: Some("default2".to_string()),
                required: false,
                var_type: VariableType::String,
            },
        ]);

        let provided = HashMap::new(); // Nothing provided

        let result = resolver.validate_required(&script, &provided);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_required_empty_script() {
        let resolver = test_resolver();
        let script = test_script_with_variables(vec![]);

        let provided = HashMap::new();

        let result = resolver.validate_required(&script, &provided);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_required_dynamic_variables_ignored() {
        let resolver = test_resolver();
        // Even if a dynamic variable is marked as required, it should be ignored
        // because dynamic variables are resolved automatically
        let script = test_script_with_variables(vec![
            Variable {
                name: "date".to_string(),
                description: "Date".to_string(),
                default_value: None,
                required: true,
                var_type: VariableType::String,
            },
            Variable {
                name: "app_name".to_string(),
                description: "Application name".to_string(),
                default_value: None,
                required: true,
                var_type: VariableType::String,
            },
        ]);

        let mut provided = HashMap::new();
        provided.insert("app_name".to_string(), "myapp".to_string());
        // date is not provided but it's a dynamic variable

        let result = resolver.validate_required(&script, &provided);
        assert!(result.is_ok());
    }

    // Tests for secret variable handling (Requirements 4.4)

    #[test]
    fn test_secret_variable_with_direct_value() {
        let resolver = test_resolver();
        let context = test_context();
        
        let script_variables = vec![
            Variable {
                name: "db_password".to_string(),
                description: "Database password".to_string(),
                default_value: None,
                required: true,
                var_type: VariableType::Secret,
            },
        ];

        let mut vars = HashMap::new();
        vars.insert("db_password".to_string(), "secret123".to_string());

        let template = "mysql -p{{db_password}}";
        let result = resolver.resolve_with_script(template, &vars, &context, &script_variables).unwrap();
        
        assert_eq!(result, "mysql -psecret123");
    }

    #[test]
    fn test_secret_variable_missing_error() {
        let resolver = test_resolver();
        let context = test_context();
        
        let script_variables = vec![
            Variable {
                name: "db_password".to_string(),
                description: "Database password".to_string(),
                default_value: None,
                required: true,
                var_type: VariableType::Secret,
            },
        ];

        let vars = HashMap::new(); // No password provided

        let template = "mysql -p{{db_password}}";
        let result = resolver.resolve_with_script(template, &vars, &context, &script_variables);
        
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("db_password"));
        assert!(err.contains("Secret variable"));
    }

    #[test]
    fn test_secret_variable_with_credential_reference() {
        // This test requires a working credential store
        // We'll use a test service name to avoid conflicts
        let credential_store = Arc::new(CredentialStore::with_service_name("devops-commander-test-resolver"));
        let resolver = VariableResolver::new(credential_store.clone());
        let context = test_context();
        
        let server_id = "test-server-secret-var";
        
        // Store a test credential
        let _ = credential_store.delete_credential(server_id); // Cleanup first
        credential_store.store_password(server_id, "stored-secret-password").unwrap();

        let script_variables = vec![
            Variable {
                name: "db_password".to_string(),
                description: "Database password".to_string(),
                default_value: None,
                required: true,
                var_type: VariableType::Secret,
            },
        ];

        let mut vars = HashMap::new();
        // Use credential reference format
        vars.insert("db_password".to_string(), format!("credential:{}", server_id));

        let template = "mysql -p{{db_password}}";
        let result = resolver.resolve_with_script(template, &vars, &context, &script_variables).unwrap();
        
        assert_eq!(result, "mysql -pstored-secret-password");

        // Cleanup
        let _ = credential_store.delete_credential(server_id);
    }

    #[test]
    fn test_secret_variable_with_invalid_credential_reference() {
        let credential_store = Arc::new(CredentialStore::with_service_name("devops-commander-test-resolver"));
        let resolver = VariableResolver::new(credential_store.clone());
        let context = test_context();
        
        let script_variables = vec![
            Variable {
                name: "db_password".to_string(),
                description: "Database password".to_string(),
                default_value: None,
                required: true,
                var_type: VariableType::Secret,
            },
        ];

        let mut vars = HashMap::new();
        // Reference a non-existent credential
        vars.insert("db_password".to_string(), "credential:nonexistent-server-12345".to_string());

        let template = "mysql -p{{db_password}}";
        let result = resolver.resolve_with_script(template, &vars, &context, &script_variables);
        
        assert!(result.is_err());
    }

    #[test]
    fn test_mixed_secret_and_regular_variables() {
        let resolver = test_resolver();
        let context = test_context();
        
        let script_variables = vec![
            Variable {
                name: "db_user".to_string(),
                description: "Database user".to_string(),
                default_value: None,
                required: true,
                var_type: VariableType::String,
            },
            Variable {
                name: "db_password".to_string(),
                description: "Database password".to_string(),
                default_value: None,
                required: true,
                var_type: VariableType::Secret,
            },
            Variable {
                name: "db_host".to_string(),
                description: "Database host".to_string(),
                default_value: None,
                required: true,
                var_type: VariableType::String,
            },
        ];

        let mut vars = HashMap::new();
        vars.insert("db_user".to_string(), "admin".to_string());
        vars.insert("db_password".to_string(), "secret123".to_string());
        vars.insert("db_host".to_string(), "localhost".to_string());

        let template = "mysql -u{{db_user}} -p{{db_password}} -h{{db_host}}";
        let result = resolver.resolve_with_script(template, &vars, &context, &script_variables).unwrap();
        
        assert_eq!(result, "mysql -uadmin -psecret123 -hlocalhost");
    }

    #[test]
    fn test_secret_variable_not_in_script_definitions() {
        // When script_variables is empty, secret handling is bypassed
        // and the variable is treated as a regular variable
        let resolver = test_resolver();
        let context = test_context();
        
        let script_variables: Vec<Variable> = vec![];

        let mut vars = HashMap::new();
        vars.insert("password".to_string(), "mypassword".to_string());

        let template = "echo {{password}}";
        let result = resolver.resolve_with_script(template, &vars, &context, &script_variables).unwrap();
        
        assert_eq!(result, "echo mypassword");
    }

    // Tests for default value handling (Requirements 4.3)

    #[test]
    fn test_default_value_used_when_not_provided() {
        let resolver = test_resolver();
        let context = test_context();
        
        let script_variables = vec![
            Variable {
                name: "env".to_string(),
                description: "Environment".to_string(),
                default_value: Some("production".to_string()),
                required: false,
                var_type: VariableType::String,
            },
        ];

        let vars = HashMap::new(); // No value provided

        let template = "Deploying to {{env}}";
        let result = resolver.resolve_with_script(template, &vars, &context, &script_variables).unwrap();
        
        assert_eq!(result, "Deploying to production");
    }

    #[test]
    fn test_provided_value_overrides_default() {
        let resolver = test_resolver();
        let context = test_context();
        
        let script_variables = vec![
            Variable {
                name: "env".to_string(),
                description: "Environment".to_string(),
                default_value: Some("production".to_string()),
                required: false,
                var_type: VariableType::String,
            },
        ];

        let mut vars = HashMap::new();
        vars.insert("env".to_string(), "staging".to_string());

        let template = "Deploying to {{env}}";
        let result = resolver.resolve_with_script(template, &vars, &context, &script_variables).unwrap();
        
        assert_eq!(result, "Deploying to staging");
    }

    #[test]
    fn test_multiple_variables_with_defaults() {
        let resolver = test_resolver();
        let context = test_context();
        
        let script_variables = vec![
            Variable {
                name: "app_name".to_string(),
                description: "Application name".to_string(),
                default_value: None,
                required: true,
                var_type: VariableType::String,
            },
            Variable {
                name: "port".to_string(),
                description: "Port number".to_string(),
                default_value: Some("8080".to_string()),
                required: false,
                var_type: VariableType::String,
            },
            Variable {
                name: "env".to_string(),
                description: "Environment".to_string(),
                default_value: Some("development".to_string()),
                required: false,
                var_type: VariableType::String,
            },
        ];

        let mut vars = HashMap::new();
        vars.insert("app_name".to_string(), "myapp".to_string());
        // port and env use defaults

        let template = "Starting {{app_name}} on port {{port}} in {{env}}";
        let result = resolver.resolve_with_script(template, &vars, &context, &script_variables).unwrap();
        
        assert_eq!(result, "Starting myapp on port 8080 in development");
    }

    #[test]
    fn test_default_value_with_nested_variable() {
        let resolver = test_resolver();
        let context = test_context();
        
        let script_variables = vec![
            Variable {
                name: "app_name".to_string(),
                description: "Application name".to_string(),
                default_value: None,
                required: true,
                var_type: VariableType::String,
            },
            Variable {
                name: "deploy_path".to_string(),
                description: "Deployment path".to_string(),
                default_value: Some("/var/www/{{app_name}}".to_string()),
                required: false,
                var_type: VariableType::String,
            },
        ];

        let mut vars = HashMap::new();
        vars.insert("app_name".to_string(), "myapp".to_string());
        // deploy_path uses default with nested variable

        let template = "Deploying to {{deploy_path}}";
        let result = resolver.resolve_with_script(template, &vars, &context, &script_variables).unwrap();
        
        assert_eq!(result, "Deploying to /var/www/myapp");
    }

    #[test]
    fn test_secret_variable_with_default_value() {
        let resolver = test_resolver();
        let context = test_context();
        
        let script_variables = vec![
            Variable {
                name: "api_key".to_string(),
                description: "API Key".to_string(),
                default_value: Some("default-api-key-123".to_string()),
                required: false,
                var_type: VariableType::Secret,
            },
        ];

        let vars = HashMap::new(); // No value provided, should use default

        let template = "curl -H 'Authorization: {{api_key}}'";
        let result = resolver.resolve_with_script(template, &vars, &context, &script_variables).unwrap();
        
        assert_eq!(result, "curl -H 'Authorization: default-api-key-123'");
    }

    #[test]
    fn test_empty_default_value() {
        let resolver = test_resolver();
        let context = test_context();
        
        let script_variables = vec![
            Variable {
                name: "extra_args".to_string(),
                description: "Extra arguments".to_string(),
                default_value: Some("".to_string()),
                required: false,
                var_type: VariableType::String,
            },
        ];

        let vars = HashMap::new();

        let template = "command {{extra_args}}";
        let result = resolver.resolve_with_script(template, &vars, &context, &script_variables).unwrap();
        
        assert_eq!(result, "command ");
    }

    #[test]
    fn test_no_default_value_causes_error() {
        let resolver = test_resolver();
        let context = test_context();
        
        let script_variables = vec![
            Variable {
                name: "required_var".to_string(),
                description: "Required variable".to_string(),
                default_value: None, // No default
                required: true,
                var_type: VariableType::String,
            },
        ];

        let vars = HashMap::new(); // No value provided

        let template = "Using {{required_var}}";
        let result = resolver.resolve_with_script(template, &vars, &context, &script_variables);
        
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("required_var"));
    }

    #[test]
    fn test_dynamic_variable_takes_precedence_over_default() {
        let resolver = test_resolver();
        let context = test_context();
        
        // Even if a variable named "date" has a default, the dynamic variable should be used
        let script_variables = vec![
            Variable {
                name: "date".to_string(),
                description: "Date".to_string(),
                default_value: Some("2000-01-01".to_string()),
                required: false,
                var_type: VariableType::String,
            },
        ];

        let vars = HashMap::new();

        let template = "Backup on {{date}}";
        let result = resolver.resolve_with_script(template, &vars, &context, &script_variables).unwrap();
        
        // Should use dynamic date, not the default
        assert_eq!(result, "Backup on 2024-01-15");
    }
}
