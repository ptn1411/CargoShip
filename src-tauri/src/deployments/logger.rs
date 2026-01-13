use crate::error::{AppError, Result};
use crate::deployments::models::*;
use chrono::Utc;
use serde::Serialize;
use sqlx::SqlitePool;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

/// Event payloads for deployment progress
#[derive(Clone, Serialize)]
pub struct DeploymentStartedPayload {
    pub deployment_id: String,
    pub script_name: String,
    pub server_count: usize,
}

#[derive(Clone, Serialize)]
pub struct StepStartedPayload {
    pub deployment_id: String,
    pub step_id: String,
    pub step_name: String,
    pub server_id: String,
}

#[derive(Clone, Serialize)]
pub struct StepOutputPayload {
    pub deployment_id: String,
    pub step_id: String,
    pub server_id: String,
    pub output: String,
}

#[derive(Clone, Serialize)]
pub struct StepCompletedPayload {
    pub deployment_id: String,
    pub step_id: String,
    pub server_id: String,
    pub status: String,
    pub exit_code: Option<i32>,
}

#[derive(Clone, Serialize)]
pub struct DeploymentCompletedPayload {
    pub deployment_id: String,
    pub status: String,
    pub duration_ms: u64,
}

/// Logger for deployment operations
/// Requirements: 6.1, 6.2, 6.3, 6.4
pub struct DeploymentLogger {
    db: SqlitePool,
    app_handle: Option<AppHandle>,
}

impl DeploymentLogger {
    pub fn new(db: SqlitePool) -> Self {
        Self { db, app_handle: None }
    }

    pub fn with_app_handle(db: SqlitePool, app_handle: AppHandle) -> Self {
        Self { db, app_handle: Some(app_handle) }
    }

    /// Create a new deployment record with initial status 'Running'
    /// Requirements: 6.1
    pub async fn create_deployment(
        &self,
        script_id: &str,
        script_name: &str,
        server_ids: &[String],
        variables: &HashMap<String, String>,
        triggered_by: &str,
    ) -> Result<Deployment> {
        let deployment = Deployment::new(
            script_id.to_string(),
            script_name.to_string(),
            server_ids.to_vec(),
            variables.clone(),
            triggered_by.to_string(),
        );

        let server_ids_json = serde_json::to_string(&deployment.server_ids)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize server_ids: {}", e)))?;
        let variables_json = serde_json::to_string(&deployment.variables)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize variables: {}", e)))?;

        sqlx::query(
            r#"
            INSERT INTO deployments (id, script_id, script_name, server_ids, variables, status, started_at, triggered_by, rollback_of)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&deployment.id)
        .bind(&deployment.script_id)
        .bind(&deployment.script_name)
        .bind(&server_ids_json)
        .bind(&variables_json)
        .bind(deployment.status.to_string())
        .bind(deployment.started_at.to_rfc3339())
        .bind(&deployment.triggered_by)
        .bind(&deployment.rollback_of)
        .execute(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create deployment: {}", e)))?;

        // Emit deployment-started event
        if let Some(ref app_handle) = self.app_handle {
            let payload = DeploymentStartedPayload {
                deployment_id: deployment.id.clone(),
                script_name: deployment.script_name.clone(),
                server_count: deployment.server_ids.len(),
            };
            let _ = app_handle.emit("deployment-started", payload);
        }

        Ok(deployment)
    }

    /// Create a rollback deployment linked to the original
    /// Requirements: 8.3
    pub async fn create_rollback_deployment(
        &self,
        original_deployment_id: &str,
        script_id: &str,
        script_name: &str,
        server_ids: &[String],
        variables: &HashMap<String, String>,
        triggered_by: &str,
    ) -> Result<Deployment> {
        let mut deployment = Deployment::new(
            script_id.to_string(),
            format!("{} (Rollback)", script_name),
            server_ids.to_vec(),
            variables.clone(),
            triggered_by.to_string(),
        );
        deployment.rollback_of = Some(original_deployment_id.to_string());

        let server_ids_json = serde_json::to_string(&deployment.server_ids)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize server_ids: {}", e)))?;
        let variables_json = serde_json::to_string(&deployment.variables)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize variables: {}", e)))?;

        sqlx::query(
            r#"
            INSERT INTO deployments (id, script_id, script_name, server_ids, variables, status, started_at, triggered_by, rollback_of)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&deployment.id)
        .bind(&deployment.script_id)
        .bind(&deployment.script_name)
        .bind(&server_ids_json)
        .bind(&variables_json)
        .bind(deployment.status.to_string())
        .bind(deployment.started_at.to_rfc3339())
        .bind(&deployment.triggered_by)
        .bind(&deployment.rollback_of)
        .execute(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create rollback deployment: {}", e)))?;

        Ok(deployment)
    }

    /// Log the start of a step execution
    /// Requirements: 6.2
    pub async fn log_step_start(
        &self,
        deployment_id: &str,
        step_id: &str,
        step_name: &str,
        server_id: &str,
        server_name: &str,
    ) -> Result<DeploymentLog> {
        let log = DeploymentLog::new(
            deployment_id.to_string(),
            step_id.to_string(),
            step_name.to_string(),
            server_id.to_string(),
            server_name.to_string(),
        );

        sqlx::query(
            r#"
            INSERT INTO deployment_logs (id, deployment_id, step_id, step_name, server_id, server_name, output, stderr, started_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&log.id)
        .bind(&log.deployment_id)
        .bind(&log.step_id)
        .bind(&log.step_name)
        .bind(&log.server_id)
        .bind(&log.server_name)
        .bind(&log.output)
        .bind(&log.stderr)
        .bind(log.started_at.to_rfc3339())
        .bind(log.status.to_string())
        .execute(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to log step start: {}", e)))?;

        // Emit step-started event
        if let Some(ref app_handle) = self.app_handle {
            let payload = StepStartedPayload {
                deployment_id: deployment_id.to_string(),
                step_id: step_id.to_string(),
                step_name: step_name.to_string(),
                server_id: server_id.to_string(),
            };
            let _ = app_handle.emit("step-started", payload);
        }

        Ok(log)
    }

    /// Log output from a step execution (streaming)
    /// Requirements: 6.2
    pub async fn log_step_output(
        &self,
        deployment_id: &str,
        step_id: &str,
        server_id: &str,
        output: &str,
    ) -> Result<()> {
        // Append output to existing log entry
        sqlx::query(
            r#"
            UPDATE deployment_logs 
            SET output = output || ?
            WHERE deployment_id = ? AND step_id = ? AND server_id = ?
            "#,
        )
        .bind(output)
        .bind(deployment_id)
        .bind(step_id)
        .bind(server_id)
        .execute(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to log step output: {}", e)))?;

        // Emit step-output event for real-time streaming
        if let Some(ref app_handle) = self.app_handle {
            let payload = StepOutputPayload {
                deployment_id: deployment_id.to_string(),
                step_id: step_id.to_string(),
                server_id: server_id.to_string(),
                output: output.to_string(),
            };
            let _ = app_handle.emit("step-output", payload);
        }

        Ok(())
    }

    /// Log the completion of a step execution
    /// Requirements: 6.3
    pub async fn log_step_complete(
        &self,
        deployment_id: &str,
        step_id: &str,
        server_id: &str,
        result: &StepResult,
    ) -> Result<()> {
        let completed_at = Utc::now();
        let status = if result.exit_code == 0 {
            StepStatus::Success
        } else {
            StepStatus::Failed
        };

        sqlx::query(
            r#"
            UPDATE deployment_logs 
            SET exit_code = ?, completed_at = ?, duration_ms = ?, status = ?, output = output || ?, stderr = stderr || ?
            WHERE deployment_id = ? AND step_id = ? AND server_id = ?
            "#,
        )
        .bind(result.exit_code)
        .bind(completed_at.to_rfc3339())
        .bind(result.duration_ms as i64)
        .bind(status.to_string())
        .bind(&result.stdout)
        .bind(&result.stderr)
        .bind(deployment_id)
        .bind(step_id)
        .bind(server_id)
        .execute(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to log step complete: {}", e)))?;

        // Emit step-completed event
        if let Some(ref app_handle) = self.app_handle {
            let payload = StepCompletedPayload {
                deployment_id: deployment_id.to_string(),
                step_id: step_id.to_string(),
                server_id: server_id.to_string(),
                status: status.to_string(),
                exit_code: Some(result.exit_code),
            };
            let _ = app_handle.emit("step-completed", payload);
        }

        Ok(())
    }

    /// Mark a step as skipped
    pub async fn log_step_skipped(
        &self,
        deployment_id: &str,
        step_id: &str,
        server_id: &str,
    ) -> Result<()> {
        let completed_at = Utc::now();

        sqlx::query(
            r#"
            UPDATE deployment_logs 
            SET completed_at = ?, status = ?
            WHERE deployment_id = ? AND step_id = ? AND server_id = ?
            "#,
        )
        .bind(completed_at.to_rfc3339())
        .bind(StepStatus::Skipped.to_string())
        .bind(deployment_id)
        .bind(step_id)
        .bind(server_id)
        .execute(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to log step skipped: {}", e)))?;

        // Emit step-completed event with skipped status
        if let Some(ref app_handle) = self.app_handle {
            let payload = StepCompletedPayload {
                deployment_id: deployment_id.to_string(),
                step_id: step_id.to_string(),
                server_id: server_id.to_string(),
                status: StepStatus::Skipped.to_string(),
                exit_code: None,
            };
            let _ = app_handle.emit("step-completed", payload);
        }

        Ok(())
    }

    /// Complete a deployment with final status
    /// Requirements: 6.4
    pub async fn complete_deployment(
        &self,
        deployment_id: &str,
        status: DeploymentStatus,
    ) -> Result<()> {
        let completed_at = Utc::now();

        // Get started_at to calculate duration
        let row = sqlx::query_scalar::<_, String>(
            "SELECT started_at FROM deployments WHERE id = ?"
        )
        .bind(deployment_id)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get deployment: {}", e)))?;

        let duration_ms = if let Some(started_at_str) = row {
            let started_at = chrono::DateTime::parse_from_rfc3339(&started_at_str)
                .map_err(|e| AppError::DatabaseError(format!("Failed to parse started_at: {}", e)))?
                .with_timezone(&Utc);
            (completed_at - started_at).num_milliseconds() as u64
        } else {
            return Err(AppError::ValidationError(format!("Deployment not found: {}", deployment_id)));
        };

        sqlx::query(
            r#"
            UPDATE deployments 
            SET status = ?, completed_at = ?, duration_ms = ?
            WHERE id = ?
            "#,
        )
        .bind(status.to_string())
        .bind(completed_at.to_rfc3339())
        .bind(duration_ms as i64)
        .bind(deployment_id)
        .execute(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to complete deployment: {}", e)))?;

        // Emit deployment-completed event
        if let Some(ref app_handle) = self.app_handle {
            let payload = DeploymentCompletedPayload {
                deployment_id: deployment_id.to_string(),
                status: status.to_string(),
                duration_ms,
            };
            let _ = app_handle.emit("deployment-completed", payload);
        }

        Ok(())
    }

    /// Update the status of the original deployment after rollback
    /// Requirements: 8.4
    pub async fn update_deployment_status(
        &self,
        deployment_id: &str,
        status: DeploymentStatus,
    ) -> Result<()> {
        sqlx::query(
            "UPDATE deployments SET status = ? WHERE id = ?"
        )
        .bind(status.to_string())
        .bind(deployment_id)
        .execute(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to update deployment status: {}", e)))?;

        Ok(())
    }

    /// Get a deployment by ID with its logs
    /// Requirements: 7.1, 7.3
    pub async fn get_deployment(&self, id: &str) -> Result<Option<Deployment>> {
        let row = sqlx::query_as::<_, DeploymentRow>(
            "SELECT id, script_id, script_name, server_ids, variables, status, started_at, completed_at, duration_ms, triggered_by, rollback_of FROM deployments WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get deployment: {}", e)))?;

        match row {
            Some(row) => {
                let mut deployment = row.into_deployment()?;
                deployment.logs = self.get_deployment_logs(id).await?;
                Ok(Some(deployment))
            }
            None => Ok(None),
        }
    }

    /// Get logs for a deployment
    pub async fn get_deployment_logs(&self, deployment_id: &str) -> Result<Vec<DeploymentLog>> {
        let rows = sqlx::query_as::<_, DeploymentLogRow>(
            "SELECT id, deployment_id, step_id, step_name, server_id, server_name, output, stderr, exit_code, started_at, completed_at, duration_ms, status FROM deployment_logs WHERE deployment_id = ? ORDER BY started_at ASC"
        )
        .bind(deployment_id)
        .fetch_all(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get deployment logs: {}", e)))?;

        let mut logs = Vec::new();
        for row in rows {
            logs.push(row.into_log()?);
        }
        Ok(logs)
    }

    /// List deployments with optional filters
    /// Requirements: 7.1, 7.2
    pub async fn list_deployments(&self, filters: DeploymentFilters) -> Result<Vec<Deployment>> {
        let mut query = String::from(
            "SELECT id, script_id, script_name, server_ids, variables, status, started_at, completed_at, duration_ms, triggered_by, rollback_of FROM deployments WHERE 1=1"
        );
        let mut params: Vec<String> = Vec::new();

        if let Some(ref server_id) = filters.server_id {
            query.push_str(" AND server_ids LIKE ?");
            params.push(format!("%{}%", server_id));
        }

        if let Some(ref script_id) = filters.script_id {
            query.push_str(" AND script_id = ?");
            params.push(script_id.clone());
        }

        if let Some(ref status) = filters.status {
            query.push_str(" AND status = ?");
            params.push(status.to_string());
        }

        if let Some(ref from_date) = filters.from_date {
            query.push_str(" AND started_at >= ?");
            params.push(from_date.to_rfc3339());
        }

        if let Some(ref to_date) = filters.to_date {
            query.push_str(" AND started_at <= ?");
            params.push(to_date.to_rfc3339());
        }

        query.push_str(" ORDER BY started_at DESC");

        if let Some(limit) = filters.limit {
            query.push_str(&format!(" LIMIT {}", limit));
        }

        if let Some(offset) = filters.offset {
            query.push_str(&format!(" OFFSET {}", offset));
        }

        // Build and execute query dynamically
        let rows = self.execute_list_query(&query, &params).await?;

        let mut deployments = Vec::new();
        for row in rows {
            deployments.push(row.into_deployment()?);
        }
        Ok(deployments)
    }

    /// Helper to execute list query with dynamic parameters
    async fn execute_list_query(&self, query: &str, params: &[String]) -> Result<Vec<DeploymentRow>> {
        // SQLx doesn't support dynamic parameter binding easily, so we use a workaround
        // For simplicity, we'll build the query with bound parameters
        let mut sqlx_query = sqlx::query_as::<_, DeploymentRow>(query);
        
        for param in params {
            sqlx_query = sqlx_query.bind(param);
        }

        sqlx_query
            .fetch_all(&self.db)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to list deployments: {}", e)))
    }

    /// Export deployment logs to specified format
    /// Requirements: 7.4
    pub async fn export_deployment_logs(&self, deployment_id: &str, format: ExportFormat) -> Result<String> {
        let deployment = self.get_deployment(deployment_id).await?
            .ok_or_else(|| AppError::ValidationError(format!("Deployment not found: {}", deployment_id)))?;

        match format {
            ExportFormat::Json => {
                serde_json::to_string_pretty(&deployment)
                    .map_err(|e| AppError::ValidationError(format!("Failed to export to JSON: {}", e)))
            }
            ExportFormat::Txt => {
                Ok(self.format_deployment_as_text(&deployment))
            }
        }
    }

    /// Format deployment as human-readable text
    fn format_deployment_as_text(&self, deployment: &Deployment) -> String {
        let mut output = String::new();
        
        output.push_str(&format!("Deployment: {}\n", deployment.id));
        output.push_str(&format!("Script: {} ({})\n", deployment.script_name, deployment.script_id));
        output.push_str(&format!("Status: {}\n", deployment.status));
        output.push_str(&format!("Started: {}\n", deployment.started_at));
        if let Some(ref completed_at) = deployment.completed_at {
            output.push_str(&format!("Completed: {}\n", completed_at));
        }
        if let Some(duration_ms) = deployment.duration_ms {
            output.push_str(&format!("Duration: {}ms\n", duration_ms));
        }
        output.push_str(&format!("Triggered by: {}\n", deployment.triggered_by));
        output.push_str(&format!("Servers: {}\n", deployment.server_ids.join(", ")));
        
        if !deployment.variables.is_empty() {
            output.push_str("\nVariables:\n");
            for (key, value) in &deployment.variables {
                output.push_str(&format!("  {}: {}\n", key, value));
            }
        }

        if !deployment.logs.is_empty() {
            output.push_str("\n--- Logs ---\n");
            for log in &deployment.logs {
                output.push_str(&format!("\n[{}] {} on {}\n", log.status, log.step_name, log.server_name));
                output.push_str(&format!("Started: {}\n", log.started_at));
                if let Some(ref completed_at) = log.completed_at {
                    output.push_str(&format!("Completed: {}\n", completed_at));
                }
                if let Some(exit_code) = log.exit_code {
                    output.push_str(&format!("Exit code: {}\n", exit_code));
                }
                if !log.output.is_empty() {
                    output.push_str("Output:\n");
                    output.push_str(&log.output);
                    output.push('\n');
                }
            }
        }

        output
    }

    /// Search within deployment logs
    /// Requirements: 7.5
    pub async fn search_logs(&self, deployment_id: &str, search_term: &str) -> Result<Vec<DeploymentLog>> {
        let rows = sqlx::query_as::<_, DeploymentLogRow>(
            "SELECT id, deployment_id, step_id, step_name, server_id, server_name, output, stderr, exit_code, started_at, completed_at, duration_ms, status FROM deployment_logs WHERE deployment_id = ? AND (output LIKE ? OR stderr LIKE ?) ORDER BY started_at ASC"
        )
        .bind(deployment_id)
        .bind(format!("%{}%", search_term))
        .bind(format!("%{}%", search_term))
        .fetch_all(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to search logs: {}", e)))?;

        let mut logs = Vec::new();
        for row in rows {
            logs.push(row.into_log()?);
        }
        Ok(logs)
    }
}

/// Database row structure for deployments
#[derive(sqlx::FromRow)]
struct DeploymentRow {
    id: String,
    script_id: String,
    script_name: String,
    server_ids: String,
    variables: String,
    status: String,
    started_at: String,
    completed_at: Option<String>,
    duration_ms: Option<i64>,
    triggered_by: String,
    rollback_of: Option<String>,
}

impl DeploymentRow {
    fn into_deployment(self) -> Result<Deployment> {
        let server_ids: Vec<String> = serde_json::from_str(&self.server_ids)
            .map_err(|e| AppError::DatabaseError(format!("Failed to parse server_ids: {}", e)))?;
        
        let variables: HashMap<String, String> = serde_json::from_str(&self.variables)
            .map_err(|e| AppError::DatabaseError(format!("Failed to parse variables: {}", e)))?;
        
        let status: DeploymentStatus = self.status.parse()
            .map_err(|e: String| AppError::DatabaseError(e))?;

        let started_at = chrono::DateTime::parse_from_rfc3339(&self.started_at)
            .map_err(|e| AppError::DatabaseError(format!("Failed to parse started_at: {}", e)))?
            .with_timezone(&Utc);
        
        let completed_at = self.completed_at
            .map(|s| chrono::DateTime::parse_from_rfc3339(&s)
                .map(|dt| dt.with_timezone(&Utc)))
            .transpose()
            .map_err(|e| AppError::DatabaseError(format!("Failed to parse completed_at: {}", e)))?;

        Ok(Deployment {
            id: self.id,
            script_id: self.script_id,
            script_name: self.script_name,
            server_ids,
            variables,
            status,
            logs: Vec::new(), // Logs are loaded separately
            started_at,
            completed_at,
            duration_ms: self.duration_ms.map(|d| d as u64),
            triggered_by: self.triggered_by,
            rollback_of: self.rollback_of,
        })
    }
}

/// Database row structure for deployment logs
#[derive(sqlx::FromRow)]
struct DeploymentLogRow {
    id: String,
    deployment_id: String,
    step_id: String,
    step_name: String,
    server_id: String,
    server_name: String,
    output: Option<String>,
    stderr: Option<String>,
    exit_code: Option<i32>,
    started_at: String,
    completed_at: Option<String>,
    duration_ms: Option<i64>,
    status: String,
}

impl DeploymentLogRow {
    fn into_log(self) -> Result<DeploymentLog> {
        let status: StepStatus = self.status.parse()
            .map_err(|e: String| AppError::DatabaseError(e))?;

        let started_at = chrono::DateTime::parse_from_rfc3339(&self.started_at)
            .map_err(|e| AppError::DatabaseError(format!("Failed to parse started_at: {}", e)))?
            .with_timezone(&Utc);
        
        let completed_at = self.completed_at
            .map(|s| chrono::DateTime::parse_from_rfc3339(&s)
                .map(|dt| dt.with_timezone(&Utc)))
            .transpose()
            .map_err(|e| AppError::DatabaseError(format!("Failed to parse completed_at: {}", e)))?;

        Ok(DeploymentLog {
            id: self.id,
            deployment_id: self.deployment_id,
            step_id: self.step_id,
            step_name: self.step_name,
            server_id: self.server_id,
            server_name: self.server_name,
            output: self.output.unwrap_or_default(),
            stderr: self.stderr.unwrap_or_default(),
            exit_code: self.exit_code,
            started_at,
            completed_at,
            duration_ms: self.duration_ms.map(|d| d as u64),
            status,
        })
    }
}
