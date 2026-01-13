use crate::credentials::CredentialStore;
use crate::deployments::{Deployment, DeploymentLogger, DeploymentStatus, StepResult};
use crate::error::{AppError, Result};
use crate::scripts::models::{DeploymentScript, OnError, Step};
use crate::scripts::resolver::{ExecutionContext, VariableResolver};
use crate::server::{Server, ServerManager};
use crate::ssh::SshClient;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;

/// Configuration for script execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionConfig {
    pub script_id: String,
    pub server_ids: Vec<String>,
    pub variables: HashMap<String, String>,
    #[serde(default)]
    pub parallel: bool,
    #[serde(default)]
    pub dry_run: bool,
    /// Optional sudo password for commands requiring elevated privileges
    #[serde(default)]
    pub sudo_password: Option<String>,
}

/// Result of a dry-run execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DryRunResult {
    pub script_name: String,
    pub servers: Vec<DryRunServer>,
    pub total_steps: usize,
}

/// Dry-run result for a single server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DryRunServer {
    pub server_id: String,
    pub server_name: String,
    pub steps: Vec<DryRunStep>,
}

/// Dry-run result for a single step
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DryRunStep {
    pub step_id: String,
    pub step_name: String,
    pub commands: Vec<String>,
    pub working_dir: Option<String>,
    pub condition: Option<String>,
    pub condition_result: Option<bool>,
    pub will_execute: bool,
    pub skip_reason: Option<String>,
}

/// State of a running deployment for cancellation support
struct RunningDeployment {
    cancel_flag: Arc<AtomicBool>,
}

/// Script execution engine
/// 
/// Handles:
/// - Sequential and parallel execution of deployment steps
/// - Variable resolution and interpolation
/// - Error handling strategies (abort, continue, rollback)
/// - Step timeouts
/// - Deployment cancellation
/// - Real-time logging
/// 
/// Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 6.6
pub struct ScriptEngine {
    ssh_client: Arc<SshClient>,
    variable_resolver: Arc<VariableResolver>,
    deployment_logger: Arc<DeploymentLogger>,
    server_manager: Arc<Mutex<ServerManager>>,
    running_deployments: Arc<Mutex<HashMap<String, RunningDeployment>>>,
}

impl ScriptEngine {
    pub fn new(
        ssh_client: Arc<SshClient>,
        credential_store: Arc<CredentialStore>,
        deployment_logger: Arc<DeploymentLogger>,
        server_manager: Arc<Mutex<ServerManager>>,
    ) -> Self {
        let variable_resolver = Arc::new(VariableResolver::new(credential_store));
        Self {
            ssh_client,
            variable_resolver,
            deployment_logger,
            server_manager,
            running_deployments: Arc::new(Mutex::new(HashMap::new())),
        }
    }


    /// Execute a deployment script on the specified servers
    /// 
    /// # Arguments
    /// * `script` - The deployment script to execute
    /// * `config` - Execution configuration including servers and variables
    /// 
    /// # Returns
    /// * `Ok(Deployment)` - The completed deployment record
    /// * `Err(AppError)` - If execution fails
    /// 
    /// # Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7
    pub async fn execute(
        &self,
        script: &DeploymentScript,
        config: ExecutionConfig,
    ) -> Result<Deployment> {
        // Validate required variables
        self.variable_resolver.validate_required(script, &config.variables)?;

        // Get servers
        let servers = self.get_servers(&config.server_ids).await?;
        if servers.is_empty() {
            return Err(AppError::ValidationError("No servers specified for deployment".to_string()));
        }

        // Merge sudo_password into variables if provided
        let mut variables = config.variables.clone();
        if let Some(ref sudo_pass) = config.sudo_password {
            variables.insert("__sudo_password__".to_string(), sudo_pass.clone());
        }

        // Create deployment record (without sudo password for security)
        let deployment = self.deployment_logger.create_deployment(
            &script.id,
            &script.name,
            &config.server_ids,
            &config.variables, // Use original variables without sudo password
            &whoami::username(),
        ).await?;

        // Register running deployment for cancellation support
        let cancel_flag = Arc::new(AtomicBool::new(false));
        {
            let mut running = self.running_deployments.lock().await;
            running.insert(deployment.id.clone(), RunningDeployment {
                cancel_flag: cancel_flag.clone(),
            });
        }

        // Execute based on parallel/sequential mode
        let result = if config.parallel && servers.len() > 1 {
            self.execute_parallel(script, &deployment, &servers, &variables, cancel_flag.clone()).await
        } else {
            self.execute_sequential(script, &deployment, &servers, &variables, cancel_flag.clone()).await
        };

        // Remove from running deployments
        {
            let mut running = self.running_deployments.lock().await;
            running.remove(&deployment.id);
        }

        // Complete deployment with final status
        let final_status = match &result {
            Ok(status) => status.clone(),
            Err(_) => DeploymentStatus::Failed,
        };
        self.deployment_logger.complete_deployment(&deployment.id, final_status.clone()).await?;

        // Return updated deployment
        self.deployment_logger.get_deployment(&deployment.id).await?
            .ok_or_else(|| AppError::DatabaseError("Failed to retrieve deployment".to_string()))
    }

    /// Execute steps sequentially on all servers
    /// Requirements: 5.1
    async fn execute_sequential(
        &self,
        script: &DeploymentScript,
        deployment: &Deployment,
        servers: &[Server],
        variables: &HashMap<String, String>,
        cancel_flag: Arc<AtomicBool>,
    ) -> Result<DeploymentStatus> {
        let mut overall_status = DeploymentStatus::Success;
        let mut needs_rollback = false;

        for server in servers {
            if cancel_flag.load(Ordering::Relaxed) {
                return Ok(DeploymentStatus::Cancelled);
            }

            let context = ExecutionContext::new(Some(server.clone()), whoami::username());
            
            match self.execute_steps_on_server(
                script,
                deployment,
                server,
                &script.steps,
                variables,
                &context,
                cancel_flag.clone(),
            ).await {
                Ok(status) => {
                    if status == DeploymentStatus::Failed {
                        overall_status = DeploymentStatus::Partial;
                    }
                    if status == DeploymentStatus::RolledBack {
                        needs_rollback = true;
                    }
                }
                Err(_) => {
                    overall_status = DeploymentStatus::Partial;
                }
            }
        }

        if needs_rollback {
            Ok(DeploymentStatus::RolledBack)
        } else {
            Ok(overall_status)
        }
    }

    /// Execute steps in parallel on all servers
    /// Requirements: 5.2
    async fn execute_parallel(
        &self,
        script: &DeploymentScript,
        deployment: &Deployment,
        servers: &[Server],
        variables: &HashMap<String, String>,
        cancel_flag: Arc<AtomicBool>,
    ) -> Result<DeploymentStatus> {
        let mut handles = Vec::new();

        for server in servers {
            let script_clone = script.clone();
            let deployment_id = deployment.id.clone();
            let server_clone = server.clone();
            let variables_clone = variables.clone();
            let cancel_flag_clone = cancel_flag.clone();
            let ssh_client = self.ssh_client.clone();
            let variable_resolver = self.variable_resolver.clone();
            let deployment_logger = self.deployment_logger.clone();

            let handle = tokio::spawn(async move {
                let context = ExecutionContext::new(Some(server_clone.clone()), whoami::username());
                
                execute_steps_on_server_static(
                    &script_clone,
                    &deployment_id,
                    &server_clone,
                    &script_clone.steps,
                    &variables_clone,
                    &context,
                    cancel_flag_clone,
                    ssh_client,
                    variable_resolver,
                    deployment_logger,
                ).await
            });

            handles.push(handle);
        }

        // Wait for all parallel executions
        let mut any_failed = false;
        let mut any_rolled_back = false;

        for handle in handles {
            match handle.await {
                Ok(Ok(status)) => {
                    match status {
                        DeploymentStatus::Failed => any_failed = true,
                        DeploymentStatus::RolledBack => any_rolled_back = true,
                        _ => {}
                    }
                }
                Ok(Err(_)) => any_failed = true,
                Err(_) => any_failed = true,
            }
        }

        if cancel_flag.load(Ordering::Relaxed) {
            Ok(DeploymentStatus::Cancelled)
        } else if any_rolled_back {
            Ok(DeploymentStatus::RolledBack)
        } else if any_failed {
            Ok(DeploymentStatus::Partial)
        } else {
            Ok(DeploymentStatus::Success)
        }
    }


    /// Execute steps on a single server
    /// Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.7
    async fn execute_steps_on_server(
        &self,
        script: &DeploymentScript,
        deployment: &Deployment,
        server: &Server,
        steps: &[Step],
        variables: &HashMap<String, String>,
        context: &ExecutionContext,
        cancel_flag: Arc<AtomicBool>,
    ) -> Result<DeploymentStatus> {
        execute_steps_on_server_static(
            script,
            &deployment.id,
            server,
            steps,
            variables,
            context,
            cancel_flag,
            self.ssh_client.clone(),
            self.variable_resolver.clone(),
            self.deployment_logger.clone(),
        ).await
    }

    /// Execute a dry-run showing commands without executing
    /// Requirements: 5.8
    pub async fn execute_dry_run(
        &self,
        script: &DeploymentScript,
        config: ExecutionConfig,
    ) -> Result<DryRunResult> {
        // Validate required variables
        self.variable_resolver.validate_required(script, &config.variables)?;

        // Get servers
        let servers = self.get_servers(&config.server_ids).await?;
        if servers.is_empty() {
            return Err(AppError::ValidationError("No servers specified for deployment".to_string()));
        }

        let mut dry_run_servers = Vec::new();

        for server in &servers {
            let context = ExecutionContext::new(Some(server.clone()), whoami::username());
            let mut dry_run_steps = Vec::new();

            for step in &script.steps {
                // Resolve commands with variables
                let resolved_commands: Vec<String> = step.commands.iter()
                    .map(|cmd| {
                        self.variable_resolver.resolve_with_script(
                            cmd,
                            &config.variables,
                            &context,
                            &script.variables,
                        ).unwrap_or_else(|_| cmd.clone())
                    })
                    .collect();

                // Resolve working directory
                let resolved_working_dir = step.working_dir.as_ref().map(|wd| {
                    self.variable_resolver.resolve_with_script(
                        wd,
                        &config.variables,
                        &context,
                        &script.variables,
                    ).unwrap_or_else(|_| wd.clone())
                });

                // Evaluate condition if present
                let (condition_result, will_execute, skip_reason) = if let Some(ref condition) = step.condition {
                    match self.evaluate_condition(condition, server, &config.variables, &context, &script.variables).await {
                        Ok(result) => (Some(result), result, if !result { Some("Condition evaluated to false".to_string()) } else { None }),
                        Err(e) => (None, false, Some(format!("Condition evaluation failed: {}", e))),
                    }
                } else {
                    (None, true, None)
                };

                dry_run_steps.push(DryRunStep {
                    step_id: step.id.clone(),
                    step_name: step.name.clone(),
                    commands: resolved_commands,
                    working_dir: resolved_working_dir,
                    condition: step.condition.clone(),
                    condition_result,
                    will_execute,
                    skip_reason,
                });
            }

            dry_run_servers.push(DryRunServer {
                server_id: server.id.clone(),
                server_name: server.name.clone(),
                steps: dry_run_steps,
            });
        }

        Ok(DryRunResult {
            script_name: script.name.clone(),
            servers: dry_run_servers,
            total_steps: script.steps.len(),
        })
    }

    /// Cancel a running deployment
    /// Requirements: 6.6
    pub async fn cancel(&self, deployment_id: &str) -> Result<()> {
        let running = self.running_deployments.lock().await;
        
        if let Some(deployment) = running.get(deployment_id) {
            deployment.cancel_flag.store(true, Ordering::Relaxed);
            Ok(())
        } else {
            Err(AppError::ValidationError(format!(
                "Deployment not found or not running: {}",
                deployment_id
            )))
        }
    }

    /// Evaluate a step condition
    /// Requirements: 5.6
    pub async fn evaluate_condition(
        &self,
        condition: &str,
        server: &Server,
        variables: &HashMap<String, String>,
        context: &ExecutionContext,
        script_variables: &[crate::scripts::models::Variable],
    ) -> Result<bool> {
        // Resolve variables in condition
        let resolved_condition = self.variable_resolver.resolve_with_script(
            condition,
            variables,
            context,
            script_variables,
        )?;

        // Execute condition as a shell command
        // The condition is true if the command exits with code 0
        let result = self.ssh_client.execute_command(
            server,
            &resolved_condition,
            Some(30), // 30 second timeout for conditions
        );

        match result {
            Ok(output) => Ok(output.exit_code == 0),
            Err(_) => Ok(false), // Condition failed, treat as false
        }
    }

    /// Get servers by IDs
    async fn get_servers(&self, server_ids: &[String]) -> Result<Vec<Server>> {
        let mut servers = Vec::new();
        let manager = self.server_manager.lock().await;
        
        for id in server_ids {
            if let Some(server) = manager.get_server(id).await? {
                servers.push(server);
            } else {
                return Err(AppError::ServerNotFound(id.clone()));
            }
        }
        
        Ok(servers)
    }

    /// Execute rollback steps for a deployment
    /// Requirements: 8.1
    pub async fn execute_rollback(
        &self,
        script: &DeploymentScript,
        original_deployment: &Deployment,
    ) -> Result<Deployment> {
        if script.rollback_steps.is_empty() {
            return Err(AppError::ValidationError(
                "Script has no rollback steps defined".to_string()
            ));
        }

        // Get servers from original deployment
        let servers = self.get_servers(&original_deployment.server_ids).await?;

        // Create rollback deployment record
        let rollback_deployment = self.deployment_logger.create_rollback_deployment(
            &original_deployment.id,
            &script.id,
            &script.name,
            &original_deployment.server_ids,
            &original_deployment.variables,
            &whoami::username(),
        ).await?;

        // Register for cancellation
        let cancel_flag = Arc::new(AtomicBool::new(false));
        {
            let mut running = self.running_deployments.lock().await;
            running.insert(rollback_deployment.id.clone(), RunningDeployment {
                cancel_flag: cancel_flag.clone(),
            });
        }

        // Execute rollback steps
        let result = self.execute_sequential(
            script,
            &rollback_deployment,
            &servers,
            &original_deployment.variables,
            cancel_flag.clone(),
        ).await;

        // Remove from running
        {
            let mut running = self.running_deployments.lock().await;
            running.remove(&rollback_deployment.id);
        }

        // Complete rollback deployment
        let final_status = match &result {
            Ok(status) => status.clone(),
            Err(_) => DeploymentStatus::RollbackFailed,
        };
        self.deployment_logger.complete_deployment(&rollback_deployment.id, final_status.clone()).await?;

        // Update original deployment status
        let original_status = if final_status == DeploymentStatus::Success {
            DeploymentStatus::RolledBack
        } else {
            DeploymentStatus::RollbackFailed
        };
        self.deployment_logger.update_deployment_status(&original_deployment.id, original_status).await?;

        // Return rollback deployment
        self.deployment_logger.get_deployment(&rollback_deployment.id).await?
            .ok_or_else(|| AppError::DatabaseError("Failed to retrieve rollback deployment".to_string()))
    }
}


/// Static function for executing steps on a server (used for parallel execution)
/// Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.7
async fn execute_steps_on_server_static(
    script: &DeploymentScript,
    deployment_id: &str,
    server: &Server,
    steps: &[Step],
    variables: &HashMap<String, String>,
    context: &ExecutionContext,
    cancel_flag: Arc<AtomicBool>,
    ssh_client: Arc<SshClient>,
    variable_resolver: Arc<VariableResolver>,
    deployment_logger: Arc<DeploymentLogger>,
) -> Result<DeploymentStatus> {
    let mut needs_rollback = false;

    for step in steps {
        // Check for cancellation
        if cancel_flag.load(Ordering::Relaxed) {
            return Ok(DeploymentStatus::Cancelled);
        }

        // Log step start
        deployment_logger.log_step_start(
            deployment_id,
            &step.id,
            &step.name,
            &server.id,
            &server.name,
        ).await?;

        // Evaluate condition if present (Requirements: 5.6)
        if let Some(ref condition) = step.condition {
            let resolved_condition = variable_resolver.resolve_with_script(
                condition,
                variables,
                context,
                &script.variables,
            )?;

            let condition_result = ssh_client.execute_command(
                server,
                &resolved_condition,
                Some(10), // 10 second timeout for conditions
            );

            match condition_result {
                Ok(output) if output.exit_code != 0 => {
                    // Condition is false, skip step
                    deployment_logger.log_step_skipped(
                        deployment_id,
                        &step.id,
                        &server.id,
                    ).await?;
                    continue;
                }
                Err(_) => {
                    // Condition evaluation failed, skip step
                    deployment_logger.log_step_skipped(
                        deployment_id,
                        &step.id,
                        &server.id,
                    ).await?;
                    continue;
                }
                _ => {} // Condition is true, proceed
            }
        }

        // Execute step
        let step_result = execute_single_step(
            step,
            server,
            variables,
            context,
            &script.variables,
            cancel_flag.clone(),
            ssh_client.clone(),
            variable_resolver.clone(),
        ).await;

        match step_result {
            Ok(result) => {
                // Log step completion
                deployment_logger.log_step_complete(
                    deployment_id,
                    &step.id,
                    &server.id,
                    &result,
                ).await?;

                // Check if step failed
                if result.exit_code != 0 {
                    match step.on_error {
                        OnError::Abort => {
                            // Requirements: 5.3 - Stop execution immediately
                            return Ok(DeploymentStatus::Failed);
                        }
                        OnError::Continue => {
                            // Requirements: 5.4 - Proceed to next step
                            continue;
                        }
                        OnError::Rollback => {
                            // Requirements: 5.5 - Mark for rollback
                            needs_rollback = true;
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                // Log error
                let error_result = StepResult {
                    exit_code: -1,
                    stdout: String::new(),
                    stderr: e.to_string(),
                    duration_ms: 0,
                };
                deployment_logger.log_step_complete(
                    deployment_id,
                    &step.id,
                    &server.id,
                    &error_result,
                ).await?;

                match step.on_error {
                    OnError::Abort => {
                        return Ok(DeploymentStatus::Failed);
                    }
                    OnError::Continue => {
                        continue;
                    }
                    OnError::Rollback => {
                        needs_rollback = true;
                        break;
                    }
                }
            }
        }
    }

    if needs_rollback {
        // Execute rollback steps if defined
        if !script.rollback_steps.is_empty() {
            let rollback_result = execute_rollback_steps_static(
                script,
                deployment_id,
                server,
                variables,
                context,
                cancel_flag,
                ssh_client,
                variable_resolver,
                deployment_logger,
            ).await;

            match rollback_result {
                Ok(_) => Ok(DeploymentStatus::RolledBack),
                Err(_) => Ok(DeploymentStatus::RollbackFailed),
            }
        } else {
            Ok(DeploymentStatus::Failed)
        }
    } else {
        Ok(DeploymentStatus::Success)
    }
}

/// Execute rollback steps
async fn execute_rollback_steps_static(
    script: &DeploymentScript,
    deployment_id: &str,
    server: &Server,
    variables: &HashMap<String, String>,
    context: &ExecutionContext,
    cancel_flag: Arc<AtomicBool>,
    ssh_client: Arc<SshClient>,
    variable_resolver: Arc<VariableResolver>,
    deployment_logger: Arc<DeploymentLogger>,
) -> Result<()> {
    for step in &script.rollback_steps {
        if cancel_flag.load(Ordering::Relaxed) {
            return Err(AppError::CommandFailed("Rollback cancelled".to_string()));
        }

        deployment_logger.log_step_start(
            deployment_id,
            &step.id,
            &format!("[Rollback] {}", step.name),
            &server.id,
            &server.name,
        ).await?;

        let step_result = execute_single_step(
            step,
            server,
            variables,
            context,
            &script.variables,
            cancel_flag.clone(),
            ssh_client.clone(),
            variable_resolver.clone(),
        ).await;

        match step_result {
            Ok(result) => {
                deployment_logger.log_step_complete(
                    deployment_id,
                    &step.id,
                    &server.id,
                    &result,
                ).await?;

                // For rollback, we continue even if a step fails
                // to try to restore as much as possible
            }
            Err(e) => {
                let error_result = StepResult {
                    exit_code: -1,
                    stdout: String::new(),
                    stderr: e.to_string(),
                    duration_ms: 0,
                };
                deployment_logger.log_step_complete(
                    deployment_id,
                    &step.id,
                    &server.id,
                    &error_result,
                ).await?;
            }
        }
    }

    Ok(())
}


/// Execute a single step on a server
/// Requirements: 5.1, 5.7
async fn execute_single_step(
    step: &Step,
    server: &Server,
    variables: &HashMap<String, String>,
    context: &ExecutionContext,
    script_variables: &[crate::scripts::models::Variable],
    cancel_flag: Arc<AtomicBool>,
    ssh_client: Arc<SshClient>,
    variable_resolver: Arc<VariableResolver>,
) -> Result<StepResult> {
    let start = Instant::now();

    // Get sudo password if provided
    let sudo_password = variables.get("__sudo_password__").cloned();

    // Build all commands into a single script to avoid multiple SSH connections
    let mut script_commands = Vec::new();
    
    for command in &step.commands {
        if cancel_flag.load(Ordering::Relaxed) {
            return Err(AppError::CommandFailed("Command cancelled".to_string()));
        }

        // Resolve variables in command
        let resolved_command = variable_resolver.resolve_with_script(
            command,
            variables,
            context,
            script_variables,
        )?;

        // Build full command with working directory
        let full_command = if let Some(ref working_dir) = step.working_dir {
            let resolved_dir = variable_resolver.resolve_with_script(
                working_dir,
                variables,
                context,
                script_variables,
            )?;
            format!("cd {} && {}", resolved_dir, resolved_command)
        } else {
            resolved_command
        };

        // Add environment variables
        let full_command = if !step.env.is_empty() {
            let env_prefix: String = step.env.iter()
                .map(|(k, v)| {
                    let resolved_v = variable_resolver.resolve_with_script(
                        v,
                        variables,
                        context,
                        script_variables,
                    ).unwrap_or_else(|_| v.clone());
                    format!("{}={}", k, shell_escape(&resolved_v))
                })
                .collect::<Vec<_>>()
                .join(" ");
            format!("{} {}", env_prefix, full_command)
        } else {
            full_command
        };

        // Wrap sudo commands with password if provided
        let full_command = wrap_sudo_with_password(&full_command, &sudo_password);
        
        script_commands.push(full_command);
    }

    // Join all commands with && to stop on first failure
    let combined_script = script_commands.join(" && ");
    
    // Execute all commands in a single SSH connection
    let timeout_secs = step.timeout.or(Some(300)); // Default 5 minute timeout
    
    eprintln!("[DEBUG] Executing step '{}' with {} commands (timeout: {:?}s)", 
              step.name, script_commands.len(), timeout_secs);
    
    let result = ssh_client.execute_command_with_cancel(
        server,
        &combined_script,
        timeout_secs,
        cancel_flag.clone(),
    );
    
    let duration = start.elapsed();

    match result {
        Ok(output) => {
            eprintln!("[DEBUG] Step '{}' completed with exit code: {}", step.name, output.exit_code);
            Ok(StepResult {
                exit_code: output.exit_code,
                stdout: output.stdout,
                stderr: output.stderr,
                duration_ms: duration.as_millis() as u64,
            })
        }
        Err(e) => {
            eprintln!("[DEBUG] Step '{}' failed: {}", step.name, e);
            Ok(StepResult {
                exit_code: -1,
                stdout: String::new(),
                stderr: format!("[error] {}", e),
                duration_ms: duration.as_millis() as u64,
            })
        }
    }
}

/// Wrap sudo commands with password using stdin
/// This converts "sudo cmd" to "echo 'password' | sudo -S -p '' cmd"
/// -S reads password from stdin, -p '' suppresses the password prompt
fn wrap_sudo_with_password(command: &str, sudo_password: &Option<String>) -> String {
    if let Some(ref password) = sudo_password {
        // Check if command contains sudo
        if command.contains("sudo ") {
            // Escape password for shell
            let escaped_password = shell_escape(password);
            // Replace "sudo " with "echo 'password' | sudo -S -p '' "
            // -p '' suppresses the "[sudo] password for user:" prompt
            command.replace("sudo ", &format!("echo {} | sudo -S -p '' ", escaped_password))
        } else {
            command.to_string()
        }
    } else {
        command.to_string()
    }
}

/// Escape a string for shell usage
fn shell_escape(s: &str) -> String {
    if s.contains(|c: char| c.is_whitespace() || c == '\'' || c == '"' || c == '$' || c == '`' || c == '\\') {
        format!("'{}'", s.replace('\'', "'\\''"))
    } else {
        s.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shell_escape_simple() {
        assert_eq!(shell_escape("hello"), "hello");
        assert_eq!(shell_escape("hello_world"), "hello_world");
    }

    #[test]
    fn test_shell_escape_with_spaces() {
        assert_eq!(shell_escape("hello world"), "'hello world'");
    }

    #[test]
    fn test_shell_escape_with_quotes() {
        assert_eq!(shell_escape("it's"), "'it'\\''s'");
    }

    #[test]
    fn test_shell_escape_with_special_chars() {
        assert_eq!(shell_escape("$HOME"), "'$HOME'");
        assert_eq!(shell_escape("`cmd`"), "'`cmd`'");
    }

    #[test]
    fn test_dry_run_step_creation() {
        let step = DryRunStep {
            step_id: "step-1".to_string(),
            step_name: "Test Step".to_string(),
            commands: vec!["echo hello".to_string()],
            working_dir: Some("/tmp".to_string()),
            condition: None,
            condition_result: None,
            will_execute: true,
            skip_reason: None,
        };

        assert!(step.will_execute);
        assert!(step.skip_reason.is_none());
    }

    #[test]
    fn test_dry_run_step_with_condition() {
        let step = DryRunStep {
            step_id: "step-1".to_string(),
            step_name: "Conditional Step".to_string(),
            commands: vec!["echo hello".to_string()],
            working_dir: None,
            condition: Some("test -f /etc/passwd".to_string()),
            condition_result: Some(false),
            will_execute: false,
            skip_reason: Some("Condition evaluated to false".to_string()),
        };

        assert!(!step.will_execute);
        assert!(step.skip_reason.is_some());
    }

    #[test]
    fn test_execution_config_defaults() {
        let config: ExecutionConfig = serde_json::from_str(r#"{
            "script_id": "test",
            "server_ids": ["server1"],
            "variables": {}
        }"#).unwrap();

        assert!(!config.parallel);
        assert!(!config.dry_run);
    }
}
