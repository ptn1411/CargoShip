use crate::error::{AppError, Result};
use crate::scripts::models::*;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashSet;

/// Manager for deployment script CRUD operations
pub struct ScriptManager {
    db: SqlitePool,
}

impl ScriptManager {
    pub fn new(db: SqlitePool) -> Self {
        Self { db }
    }

    /// Create a new deployment script
    /// Requirements: 1.1
    pub async fn create_script(&self, input: CreateScriptInput) -> Result<DeploymentScript> {
        let now = Utc::now();
        let id = uuid::Uuid::new_v4().to_string();

        let script = DeploymentScript {
            id: id.clone(),
            name: input.name,
            description: input.description,
            variables: input.variables,
            steps: input.steps,
            rollback_steps: input.rollback_steps,
            tags: input.tags,
            is_template: input.is_template,
            created_at: now,
            updated_at: now,
        };

        // Validate before saving
        let validation = self.validate_script(&script);
        if !validation.valid {
            let error_msgs: Vec<String> = validation.errors.iter()
                .map(|e| format!("{}: {}", e.field, e.message))
                .collect();
            return Err(AppError::ValidationError(error_msgs.join("; ")));
        }

        let variables_json = serde_json::to_string(&script.variables)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize variables: {}", e)))?;
        let steps_json = serde_json::to_string(&script.steps)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize steps: {}", e)))?;
        let rollback_steps_json = serde_json::to_string(&script.rollback_steps)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize rollback_steps: {}", e)))?;
        let tags_json = serde_json::to_string(&script.tags)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize tags: {}", e)))?;

        sqlx::query(
            r#"
            INSERT INTO deployment_scripts (id, name, description, variables, steps, rollback_steps, tags, is_template, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&script.id)
        .bind(&script.name)
        .bind(&script.description)
        .bind(&variables_json)
        .bind(&steps_json)
        .bind(&rollback_steps_json)
        .bind(&tags_json)
        .bind(script.is_template as i32)
        .bind(script.created_at.to_rfc3339())
        .bind(script.updated_at.to_rfc3339())
        .execute(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create script: {}", e)))?;

        Ok(script)
    }

    /// Get a deployment script by ID
    /// Requirements: 1.2
    pub async fn get_script(&self, id: &str) -> Result<Option<DeploymentScript>> {
        let row = sqlx::query_as::<_, ScriptRow>(
            "SELECT id, name, description, variables, steps, rollback_steps, tags, is_template, created_at, updated_at FROM deployment_scripts WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get script: {}", e)))?;

        match row {
            Some(row) => Ok(Some(row.into_script()?)),
            None => Ok(None),
        }
    }

    /// List all deployment scripts
    /// Requirements: 1.2
    pub async fn list_scripts(&self) -> Result<Vec<DeploymentScript>> {
        let rows = sqlx::query_as::<_, ScriptRow>(
            "SELECT id, name, description, variables, steps, rollback_steps, tags, is_template, created_at, updated_at FROM deployment_scripts WHERE is_template = 0 ORDER BY updated_at DESC"
        )
        .fetch_all(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to list scripts: {}", e)))?;

        let mut scripts = Vec::new();
        for row in rows {
            scripts.push(row.into_script()?);
        }
        Ok(scripts)
    }

    /// Update an existing deployment script
    /// Requirements: 1.3
    pub async fn update_script(&self, id: &str, input: UpdateScriptInput) -> Result<DeploymentScript> {
        let existing = self.get_script(id).await?
            .ok_or_else(|| AppError::ValidationError(format!("Script not found: {}", id)))?;

        let updated = DeploymentScript {
            id: existing.id,
            name: input.name.unwrap_or(existing.name),
            description: input.description.unwrap_or(existing.description),
            variables: input.variables.unwrap_or(existing.variables),
            steps: input.steps.unwrap_or(existing.steps),
            rollback_steps: input.rollback_steps.unwrap_or(existing.rollback_steps),
            tags: input.tags.unwrap_or(existing.tags),
            is_template: input.is_template.unwrap_or(existing.is_template),
            created_at: existing.created_at,
            updated_at: Utc::now(),
        };

        // Validate before saving
        let validation = self.validate_script(&updated);
        if !validation.valid {
            let error_msgs: Vec<String> = validation.errors.iter()
                .map(|e| format!("{}: {}", e.field, e.message))
                .collect();
            return Err(AppError::ValidationError(error_msgs.join("; ")));
        }

        let variables_json = serde_json::to_string(&updated.variables)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize variables: {}", e)))?;
        let steps_json = serde_json::to_string(&updated.steps)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize steps: {}", e)))?;
        let rollback_steps_json = serde_json::to_string(&updated.rollback_steps)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize rollback_steps: {}", e)))?;
        let tags_json = serde_json::to_string(&updated.tags)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize tags: {}", e)))?;

        sqlx::query(
            r#"
            UPDATE deployment_scripts 
            SET name = ?, description = ?, variables = ?, steps = ?, rollback_steps = ?, tags = ?, is_template = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(&updated.name)
        .bind(&updated.description)
        .bind(&variables_json)
        .bind(&steps_json)
        .bind(&rollback_steps_json)
        .bind(&tags_json)
        .bind(updated.is_template as i32)
        .bind(updated.updated_at.to_rfc3339())
        .bind(id)
        .execute(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to update script: {}", e)))?;

        Ok(updated)
    }

    /// Delete a deployment script
    /// Requirements: 1.4
    pub async fn delete_script(&self, id: &str) -> Result<()> {
        // First, delete related deployment logs
        sqlx::query("DELETE FROM deployment_logs WHERE deployment_id IN (SELECT id FROM deployments WHERE script_id = ?)")
            .bind(id)
            .execute(&self.db)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to delete deployment logs: {}", e)))?;

        // Then, delete related deployments
        sqlx::query("DELETE FROM deployments WHERE script_id = ?")
            .bind(id)
            .execute(&self.db)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to delete deployments: {}", e)))?;

        // Finally, delete the script
        let result = sqlx::query("DELETE FROM deployment_scripts WHERE id = ?")
            .bind(id)
            .execute(&self.db)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to delete script: {}", e)))?;

        if result.rows_affected() == 0 {
            return Err(AppError::ValidationError(format!("Script not found: {}", id)));
        }

        Ok(())
    }

    /// Duplicate a deployment script
    /// Requirements: 1.5
    pub async fn duplicate_script(&self, id: &str) -> Result<DeploymentScript> {
        let existing = self.get_script(id).await?
            .ok_or_else(|| AppError::ValidationError(format!("Script not found: {}", id)))?;

        let input = CreateScriptInput {
            name: format!("{} (Copy)", existing.name),
            description: existing.description,
            variables: existing.variables,
            steps: existing.steps,
            rollback_steps: existing.rollback_steps,
            tags: existing.tags,
            is_template: false, // Duplicates are never templates
        };

        self.create_script(input).await
    }

    /// Export a script to YAML format
    /// Requirements: 1.6
    pub fn export_script(&self, script: &DeploymentScript) -> Result<String> {
        // Create exportable structure (without auto-generated fields)
        let exportable = ExportableScript {
            name: script.name.clone(),
            description: script.description.clone(),
            variables: script.variables.clone(),
            steps: script.steps.clone(),
            rollback_steps: script.rollback_steps.clone(),
            tags: script.tags.clone(),
        };

        serde_yaml::to_string(&exportable)
            .map_err(|e| AppError::ValidationError(format!("Failed to export script to YAML: {}", e)))
    }

    /// Import a script from YAML format
    /// Requirements: 1.7
    pub async fn import_script(&self, yaml: &str) -> Result<DeploymentScript> {
        let exportable: ExportableScript = serde_yaml::from_str(yaml)
            .map_err(|e| AppError::ValidationError(format!("Failed to parse YAML: {}", e)))?;

        let input = CreateScriptInput {
            name: exportable.name,
            description: exportable.description,
            variables: exportable.variables,
            steps: exportable.steps,
            rollback_steps: exportable.rollback_steps,
            tags: exportable.tags,
            is_template: false,
        };

        self.create_script(input).await
    }

    /// Validate a deployment script
    /// Requirements: 2.5
    pub fn validate_script(&self, script: &DeploymentScript) -> ValidationResult {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        // Validate name
        if script.name.trim().is_empty() {
            errors.push(ValidationError::new("name", "Script name cannot be empty"));
        }

        // Validate variables
        let mut var_names = HashSet::new();
        for (i, var) in script.variables.iter().enumerate() {
            if var.name.trim().is_empty() {
                errors.push(ValidationError::new(
                    format!("variables[{}].name", i),
                    "Variable name cannot be empty",
                ));
            } else if !is_valid_variable_name(&var.name) {
                errors.push(ValidationError::new(
                    format!("variables[{}].name", i),
                    "Variable name must contain only alphanumeric characters and underscores",
                ));
            } else if !var_names.insert(var.name.clone()) {
                errors.push(ValidationError::new(
                    format!("variables[{}].name", i),
                    format!("Duplicate variable name: {}", var.name),
                ));
            }

            // Validate default value for number type
            if var.var_type == VariableType::Number {
                if let Some(ref default) = var.default_value {
                    if default.parse::<f64>().is_err() {
                        errors.push(ValidationError::new(
                            format!("variables[{}].default_value", i),
                            "Default value must be a valid number",
                        ));
                    }
                }
            }

            // Validate default value for boolean type
            if var.var_type == VariableType::Boolean {
                if let Some(ref default) = var.default_value {
                    let lower = default.to_lowercase();
                    if lower != "true" && lower != "false" {
                        errors.push(ValidationError::new(
                            format!("variables[{}].default_value", i),
                            "Default value must be 'true' or 'false'",
                        ));
                    }
                }
            }
        }

        // Validate steps
        if script.steps.is_empty() {
            errors.push(ValidationError::new("steps", "Script must have at least one step"));
        }

        let mut step_ids = HashSet::new();
        for (i, step) in script.steps.iter().enumerate() {
            self.validate_step(step, i, "steps", &mut step_ids, &var_names, &mut errors, &mut warnings);
        }

        // Validate rollback steps
        let mut rollback_step_ids = HashSet::new();
        for (i, step) in script.rollback_steps.iter().enumerate() {
            self.validate_step(step, i, "rollback_steps", &mut rollback_step_ids, &var_names, &mut errors, &mut warnings);
        }

        ValidationResult {
            valid: errors.is_empty(),
            errors,
            warnings,
        }
    }

    fn validate_step(
        &self,
        step: &Step,
        index: usize,
        prefix: &str,
        step_ids: &mut HashSet<String>,
        var_names: &HashSet<String>,
        errors: &mut Vec<ValidationError>,
        warnings: &mut Vec<String>,
    ) {
        if step.name.trim().is_empty() {
            errors.push(ValidationError::new(
                format!("{}[{}].name", prefix, index),
                "Step name cannot be empty",
            ));
        }

        if !step_ids.insert(step.id.clone()) {
            errors.push(ValidationError::new(
                format!("{}[{}].id", prefix, index),
                format!("Duplicate step ID: {}", step.id),
            ));
        }

        if step.commands.is_empty() {
            errors.push(ValidationError::new(
                format!("{}[{}].commands", prefix, index),
                "Step must have at least one command",
            ));
        }

        for (j, cmd) in step.commands.iter().enumerate() {
            if cmd.trim().is_empty() {
                errors.push(ValidationError::new(
                    format!("{}[{}].commands[{}]", prefix, index, j),
                    "Command cannot be empty",
                ));
            }

            // Check for undefined variables in commands
            let used_vars = extract_variables(cmd);
            for var in used_vars {
                // Skip dynamic variables
                if is_dynamic_variable(&var) {
                    continue;
                }
                if !var_names.contains(&var) {
                    warnings.push(format!(
                        "{}[{}].commands[{}]: Variable '{}' is not defined",
                        prefix, index, j, var
                    ));
                }
            }
        }

        // Validate timeout
        if let Some(timeout) = step.timeout {
            if timeout == 0 {
                errors.push(ValidationError::new(
                    format!("{}[{}].timeout", prefix, index),
                    "Timeout must be greater than 0",
                ));
            }
        }
    }
}

/// Helper function to check if a variable name is valid
fn is_valid_variable_name(name: &str) -> bool {
    !name.is_empty() 
        && name.chars().all(|c| c.is_alphanumeric() || c == '_')
        && !name.chars().next().map(|c| c.is_numeric()).unwrap_or(true)
}

/// Helper function to check if a variable is a dynamic variable
fn is_dynamic_variable(name: &str) -> bool {
    matches!(name, "date" | "timestamp" | "user" | "server_name")
}

/// Extract variable names from a template string
fn extract_variables(template: &str) -> Vec<String> {
    let mut vars = Vec::new();
    let mut chars = template.chars().peekable();
    
    while let Some(c) = chars.next() {
        if c == '{' && chars.peek() == Some(&'{') {
            chars.next(); // consume second '{'
            let mut var_name = String::new();
            while let Some(&next) = chars.peek() {
                if next == '}' {
                    chars.next();
                    if chars.peek() == Some(&'}') {
                        chars.next();
                        if !var_name.is_empty() {
                            vars.push(var_name.trim().to_string());
                        }
                        break;
                    }
                } else {
                    var_name.push(chars.next().unwrap());
                }
            }
        }
    }
    
    vars
}

/// Structure for YAML export/import (excludes auto-generated fields)
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ExportableScript {
    name: String,
    description: String,
    variables: Vec<Variable>,
    steps: Vec<Step>,
    rollback_steps: Vec<Step>,
    tags: Vec<String>,
}

/// Database row structure for scripts
#[derive(sqlx::FromRow)]
struct ScriptRow {
    id: String,
    name: String,
    description: Option<String>,
    variables: String,
    steps: String,
    rollback_steps: Option<String>,
    tags: Option<String>,
    is_template: i32,
    created_at: String,
    updated_at: String,
}

impl ScriptRow {
    fn into_script(self) -> Result<DeploymentScript> {
        let variables: Vec<Variable> = serde_json::from_str(&self.variables)
            .map_err(|e| AppError::DatabaseError(format!("Failed to parse variables: {}", e)))?;
        
        let steps: Vec<Step> = serde_json::from_str(&self.steps)
            .map_err(|e| AppError::DatabaseError(format!("Failed to parse steps: {}", e)))?;
        
        let rollback_steps: Vec<Step> = self.rollback_steps
            .map(|s| serde_json::from_str(&s))
            .transpose()
            .map_err(|e| AppError::DatabaseError(format!("Failed to parse rollback_steps: {}", e)))?
            .unwrap_or_default();
        
        let tags: Vec<String> = self.tags
            .map(|s| serde_json::from_str(&s))
            .transpose()
            .map_err(|e| AppError::DatabaseError(format!("Failed to parse tags: {}", e)))?
            .unwrap_or_default();

        let created_at = chrono::DateTime::parse_from_rfc3339(&self.created_at)
            .map_err(|e| AppError::DatabaseError(format!("Failed to parse created_at: {}", e)))?
            .with_timezone(&Utc);
        
        let updated_at = chrono::DateTime::parse_from_rfc3339(&self.updated_at)
            .map_err(|e| AppError::DatabaseError(format!("Failed to parse updated_at: {}", e)))?
            .with_timezone(&Utc);

        Ok(DeploymentScript {
            id: self.id,
            name: self.name,
            description: self.description.unwrap_or_default(),
            variables,
            steps,
            rollback_steps,
            tags,
            is_template: self.is_template != 0,
            created_at,
            updated_at,
        })
    }
}
