use crate::credentials::CredentialStore;
use crate::deployments::{Deployment, DeploymentLogger, DeploymentStatus};
use crate::error::{AppError, Result};
use crate::scripts::models::{DeploymentScript, Step};
use crate::scripts::ScriptManager;
use crate::server::ServerManager;
use crate::ssh::SshClient;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Manager for handling deployment rollbacks
/// 
/// Provides functionality to:
/// - Execute rollback steps for failed deployments
/// - Create linked deployment records for rollbacks
/// - Handle rollback failures appropriately
/// 
/// Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
pub struct RollbackManager {
    script_manager: Arc<Mutex<ScriptManager>>,
    deployment_logger: Arc<DeploymentLogger>,
    ssh_client: Arc<SshClient>,
    server_manager: Arc<Mutex<ServerManager>>,
    credential_store: Arc<CredentialStore>,
}

impl RollbackManager {
    pub fn new(
        script_manager: Arc<Mutex<ScriptManager>>,
        deployment_logger: Arc<DeploymentLogger>,
        ssh_client: Arc<SshClient>,
        server_manager: Arc<Mutex<ServerManager>>,
        credential_store: Arc<CredentialStore>,
    ) -> Self {
        Self {
            script_manager,
            deployment_logger,
            ssh_client,
            server_manager,
            credential_store,
        }
    }

    /// Execute rollback for a deployment
    /// 
    /// This method:
    /// 1. Retrieves the original deployment and its script
    /// 2. Validates that rollback steps exist
    /// 3. Creates a new linked deployment record for the rollback
    /// 4. Executes the rollback steps
    /// 5. Updates both the rollback and original deployment statuses
    /// 
    /// # Arguments
    /// * `deployment_id` - The ID of the deployment to rollback
    /// 
    /// # Returns
    /// * `Ok(Deployment)` - The rollback deployment record
    /// * `Err(AppError)` - If rollback fails
    /// 
    /// Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
    pub async fn execute_rollback(&self, deployment_id: &str) -> Result<Deployment> {
        // Get the original deployment
        let original_deployment = self.deployment_logger.get_deployment(deployment_id).await?
            .ok_or_else(|| AppError::ValidationError(
                format!("Deployment not found: {}", deployment_id)
            ))?;

        // Get the script for this deployment
        let script = self.script_manager.lock().await
            .get_script(&original_deployment.script_id).await?
            .ok_or_else(|| AppError::ValidationError(
                format!("Script not found: {}", original_deployment.script_id)
            ))?;

        // Validate rollback steps exist (Requirements: 8.1)
        if script.rollback_steps.is_empty() {
            return Err(AppError::ValidationError(
                "Script has no rollback steps defined".to_string()
            ));
        }

        // Create the script engine for execution
        let script_engine = crate::scripts::ScriptEngine::new(
            self.ssh_client.clone(),
            self.credential_store.clone(),
            self.deployment_logger.clone(),
            self.server_manager.clone(),
        );

        // Execute rollback using the script engine
        // This creates a linked deployment record (Requirements: 8.3)
        let rollback_deployment = script_engine.execute_rollback(&script, &original_deployment).await?;

        Ok(rollback_deployment)
    }

    /// Get the rollback steps for a script
    /// 
    /// # Arguments
    /// * `script` - The deployment script
    /// 
    /// # Returns
    /// * The rollback steps defined in the script
    pub fn get_rollback_steps(&self, script: &DeploymentScript) -> Vec<Step> {
        script.rollback_steps.clone()
    }

    /// Check if a deployment can be rolled back
    /// 
    /// A deployment can be rolled back if:
    /// - It exists
    /// - Its script has rollback steps defined
    /// - It's not already a rollback deployment
    /// - Its status is Failed, Partial, or Success
    /// 
    /// # Arguments
    /// * `deployment_id` - The ID of the deployment to check
    /// 
    /// # Returns
    /// * `Ok(bool)` - Whether the deployment can be rolled back
    /// * `Err(AppError)` - If there's an error checking
    pub async fn can_rollback(&self, deployment_id: &str) -> Result<bool> {
        // Get the deployment
        let deployment = match self.deployment_logger.get_deployment(deployment_id).await? {
            Some(d) => d,
            None => return Ok(false),
        };

        // Check if this is already a rollback deployment
        if deployment.rollback_of.is_some() {
            return Ok(false);
        }

        // Check if status allows rollback
        let can_rollback_status = matches!(
            deployment.status,
            DeploymentStatus::Failed 
            | DeploymentStatus::Partial 
            | DeploymentStatus::Success
        );

        if !can_rollback_status {
            return Ok(false);
        }

        // Check if script has rollback steps
        let script = match self.script_manager.lock().await
            .get_script(&deployment.script_id).await? {
            Some(s) => s,
            None => return Ok(false),
        };

        Ok(!script.rollback_steps.is_empty())
    }

    /// Get rollback information for a deployment
    /// 
    /// Returns information about whether a deployment can be rolled back
    /// and the rollback steps that would be executed.
    /// 
    /// # Arguments
    /// * `deployment_id` - The ID of the deployment
    /// 
    /// # Returns
    /// * `Ok(RollbackInfo)` - Information about the rollback
    /// * `Err(AppError)` - If there's an error
    pub async fn get_rollback_info(&self, deployment_id: &str) -> Result<RollbackInfo> {
        let deployment = self.deployment_logger.get_deployment(deployment_id).await?
            .ok_or_else(|| AppError::ValidationError(
                format!("Deployment not found: {}", deployment_id)
            ))?;

        let script = self.script_manager.lock().await
            .get_script(&deployment.script_id).await?;

        let (has_rollback_steps, rollback_step_count, rollback_step_names) = match &script {
            Some(s) => (
                !s.rollback_steps.is_empty(),
                s.rollback_steps.len(),
                s.rollback_steps.iter().map(|step| step.name.clone()).collect(),
            ),
            None => (false, 0, Vec::new()),
        };

        let can_rollback = self.can_rollback(deployment_id).await?;

        let reason_cannot_rollback = if !can_rollback {
            if deployment.rollback_of.is_some() {
                Some("This is already a rollback deployment".to_string())
            } else if !has_rollback_steps {
                Some("Script has no rollback steps defined".to_string())
            } else if !matches!(
                deployment.status,
                DeploymentStatus::Failed | DeploymentStatus::Partial | DeploymentStatus::Success
            ) {
                Some(format!("Deployment status '{}' does not allow rollback", deployment.status))
            } else {
                Some("Unknown reason".to_string())
            }
        } else {
            None
        };

        Ok(RollbackInfo {
            deployment_id: deployment_id.to_string(),
            can_rollback,
            has_rollback_steps,
            rollback_step_count,
            rollback_step_names,
            reason_cannot_rollback,
        })
    }
}

/// Information about rollback capability for a deployment
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RollbackInfo {
    pub deployment_id: String,
    pub can_rollback: bool,
    pub has_rollback_steps: bool,
    pub rollback_step_count: usize,
    pub rollback_step_names: Vec<String>,
    pub reason_cannot_rollback: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rollback_info_serialization() {
        let info = RollbackInfo {
            deployment_id: "test-123".to_string(),
            can_rollback: true,
            has_rollback_steps: true,
            rollback_step_count: 3,
            rollback_step_names: vec![
                "Stop service".to_string(),
                "Restore backup".to_string(),
                "Start service".to_string(),
            ],
            reason_cannot_rollback: None,
        };

        let json = serde_json::to_string(&info).unwrap();
        let deserialized: RollbackInfo = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.deployment_id, "test-123");
        assert!(deserialized.can_rollback);
        assert_eq!(deserialized.rollback_step_count, 3);
    }

    #[test]
    fn test_rollback_info_cannot_rollback() {
        let info = RollbackInfo {
            deployment_id: "test-456".to_string(),
            can_rollback: false,
            has_rollback_steps: false,
            rollback_step_count: 0,
            rollback_step_names: Vec::new(),
            reason_cannot_rollback: Some("Script has no rollback steps defined".to_string()),
        };

        assert!(!info.can_rollback);
        assert!(info.reason_cannot_rollback.is_some());
    }
}
