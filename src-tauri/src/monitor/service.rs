use crate::error::{AppError, Result};
use crate::server::{Server, ServerManager};
use crate::ssh::SshClient;
use super::models::*;
use chrono::{DateTime, Duration, Utc};
use sqlx::SqlitePool;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, RwLock};
use uuid::Uuid;

/// Monitor service for collecting server metrics and managing alerts
/// Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7
pub struct MonitorService {
    ssh_client: Arc<SshClient>,
    server_manager: Arc<Mutex<ServerManager>>,
    db: SqlitePool,
    app_handle: RwLock<Option<AppHandle>>,
    monitoring_active: AtomicBool,
    monitoring_interval_secs: RwLock<u64>,
}

impl MonitorService {
    pub fn new(
        ssh_client: Arc<SshClient>,
        server_manager: Arc<Mutex<ServerManager>>,
        db: SqlitePool,
    ) -> Self {
        Self {
            ssh_client,
            server_manager,
            db,
            app_handle: RwLock::new(None),
            monitoring_active: AtomicBool::new(false),
            monitoring_interval_secs: RwLock::new(60), // Default: 60 seconds
        }
    }

    /// Set the app handle for emitting events
    pub async fn set_app_handle(&self, app_handle: AppHandle) {
        let mut handle = self.app_handle.write().await;
        *handle = Some(app_handle);
    }

    /// Get server metrics via SSH commands
    /// Requirements: 4.2
    pub fn get_server_metrics(&self, server: &Server) -> Result<ServerMetrics> {
        // Combined command to get all metrics in one SSH call for efficiency
        let command = r#"
            # CPU usage (from /proc/stat)
            cpu_line=$(head -1 /proc/stat)
            cpu_user=$(echo $cpu_line | awk '{print $2}')
            cpu_nice=$(echo $cpu_line | awk '{print $3}')
            cpu_system=$(echo $cpu_line | awk '{print $4}')
            cpu_idle=$(echo $cpu_line | awk '{print $5}')
            cpu_total=$((cpu_user + cpu_nice + cpu_system + cpu_idle))
            cpu_used=$((cpu_user + cpu_nice + cpu_system))
            if [ $cpu_total -gt 0 ]; then
                cpu_percent=$((cpu_used * 100 / cpu_total))
            else
                cpu_percent=0
            fi
            echo "CPU:$cpu_percent"
            
            # Memory from /proc/meminfo
            mem_total=$(grep MemTotal /proc/meminfo | awk '{print $2}')
            mem_available=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
            if [ -z "$mem_available" ]; then
                mem_free=$(grep MemFree /proc/meminfo | awk '{print $2}')
                mem_buffers=$(grep Buffers /proc/meminfo | awk '{print $2}')
                mem_cached=$(grep "^Cached:" /proc/meminfo | awk '{print $2}')
                mem_available=$((mem_free + mem_buffers + mem_cached))
            fi
            mem_used=$((mem_total - mem_available))
            echo "MEM:$mem_used:$mem_total"
            
            # Disk usage (root partition)
            disk_info=$(df -k / | tail -1)
            disk_total=$(echo $disk_info | awk '{print $2}')
            disk_used=$(echo $disk_info | awk '{print $3}')
            echo "DISK:$disk_used:$disk_total"
            
            # Load average
            load_avg=$(cat /proc/loadavg | awk '{print $1":"$2":"$3}')
            echo "LOAD:$load_avg"
            
            # Uptime in seconds
            uptime_secs=$(cat /proc/uptime | awk '{print int($1)}')
            echo "UPTIME:$uptime_secs"
        "#;

        let output = self.ssh_client.execute_command(server, command, Some(30))?;
        
        if output.exit_code != 0 {
            return Err(AppError::CommandFailed(format!(
                "Failed to collect metrics: {}",
                output.stderr
            )));
        }

        self.parse_metrics_output(&output.stdout)
    }


    /// Parse the metrics output from SSH command
    fn parse_metrics_output(&self, output: &str) -> Result<ServerMetrics> {
        let mut cpu_percent: f32 = 0.0;
        let mut memory_used: u64 = 0;
        let mut memory_total: u64 = 0;
        let mut disk_used: u64 = 0;
        let mut disk_total: u64 = 0;
        let mut load_average: [f32; 3] = [0.0, 0.0, 0.0];
        let mut uptime_seconds: u64 = 0;

        for line in output.lines() {
            let line = line.trim();
            if line.starts_with("CPU:") {
                cpu_percent = line[4..].parse().unwrap_or(0.0);
            } else if line.starts_with("MEM:") {
                let parts: Vec<&str> = line[4..].split(':').collect();
                if parts.len() >= 2 {
                    // Values are in KB, convert to bytes
                    memory_used = parts[0].parse::<u64>().unwrap_or(0) * 1024;
                    memory_total = parts[1].parse::<u64>().unwrap_or(0) * 1024;
                }
            } else if line.starts_with("DISK:") {
                let parts: Vec<&str> = line[5..].split(':').collect();
                if parts.len() >= 2 {
                    // Values are in KB, convert to bytes
                    disk_used = parts[0].parse::<u64>().unwrap_or(0) * 1024;
                    disk_total = parts[1].parse::<u64>().unwrap_or(0) * 1024;
                }
            } else if line.starts_with("LOAD:") {
                let parts: Vec<&str> = line[5..].split(':').collect();
                if parts.len() >= 3 {
                    load_average[0] = parts[0].parse().unwrap_or(0.0);
                    load_average[1] = parts[1].parse().unwrap_or(0.0);
                    load_average[2] = parts[2].parse().unwrap_or(0.0);
                }
            } else if line.starts_with("UPTIME:") {
                uptime_seconds = line[7..].parse().unwrap_or(0);
            }
        }

        Ok(ServerMetrics {
            cpu_percent,
            memory_used,
            memory_total,
            disk_used,
            disk_total,
            load_average,
            uptime_seconds,
            collected_at: Utc::now(),
        })
    }

    /// Get status of all servers
    /// Requirements: 4.1
    pub async fn get_all_server_status(&self) -> Result<Vec<ServerStatus>> {
        let servers = self.server_manager.lock().await.list_servers().await?;
        let mut statuses = Vec::new();

        for server in servers {
            let (online, metrics) = match self.get_server_metrics(&server) {
                Ok(m) => (true, Some(m)),
                Err(_) => (false, None),
            };

            statuses.push(ServerStatus {
                server_id: server.id.clone(),
                server_name: server.name.clone(),
                online,
                metrics,
                last_checked: Utc::now(),
            });
        }

        Ok(statuses)
    }

    /// Store metrics in database
    /// Requirements: 4.5
    pub async fn store_metrics(&self, server_id: &str, metrics: &ServerMetrics) -> Result<()> {
        let id = Uuid::new_v4().to_string();
        let load_avg_json = serde_json::to_string(&metrics.load_average)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize load average: {}", e)))?;

        sqlx::query(
            r#"
            INSERT INTO server_metrics (
                id, server_id, cpu_percent, memory_used, memory_total,
                disk_used, disk_total, load_average, uptime_seconds, collected_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(server_id)
        .bind(metrics.cpu_percent)
        .bind(metrics.memory_used as i64)
        .bind(metrics.memory_total as i64)
        .bind(metrics.disk_used as i64)
        .bind(metrics.disk_total as i64)
        .bind(&load_avg_json)
        .bind(metrics.uptime_seconds as i64)
        .bind(metrics.collected_at.to_rfc3339())
        .execute(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to store metrics: {}", e)))?;

        Ok(())
    }


    /// Get metrics history for a server
    /// Requirements: 4.5
    pub async fn get_metrics_history(
        &self,
        server_id: &str,
        metric: MetricType,
        hours: u32,
    ) -> Result<Vec<MetricPoint>> {
        let since = Utc::now() - Duration::hours(hours as i64);
        
        let rows = sqlx::query_as::<_, (f64, String)>(
            r#"
            SELECT 
                CASE ?
                    WHEN 'cpu_usage' THEN cpu_percent
                    WHEN 'memory_usage' THEN CAST(memory_used AS REAL) * 100.0 / NULLIF(memory_total, 0)
                    WHEN 'disk_usage' THEN CAST(disk_used AS REAL) * 100.0 / NULLIF(disk_total, 0)
                    ELSE 0
                END as value,
                collected_at
            FROM server_metrics
            WHERE server_id = ? AND collected_at >= ?
            ORDER BY collected_at ASC
            "#,
        )
        .bind(metric.to_string())
        .bind(server_id)
        .bind(since.to_rfc3339())
        .fetch_all(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get metrics history: {}", e)))?;

        let points = rows
            .into_iter()
            .filter_map(|(value, timestamp)| {
                DateTime::parse_from_rfc3339(&timestamp)
                    .ok()
                    .map(|ts| MetricPoint {
                        timestamp: ts.with_timezone(&Utc),
                        value: value as f32,
                    })
            })
            .collect();

        Ok(points)
    }

    /// Clean up old metrics data (keep last 7 days by default)
    pub async fn cleanup_old_metrics(&self, days: i64) -> Result<u64> {
        let cutoff = Utc::now() - Duration::days(days);
        
        let result = sqlx::query("DELETE FROM server_metrics WHERE collected_at < ?")
            .bind(cutoff.to_rfc3339())
            .execute(&self.db)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to cleanup metrics: {}", e)))?;

        Ok(result.rows_affected())
    }

    // ========================================================================
    // Alert Management
    // Requirements: 4.3, 4.6
    // ========================================================================

    /// Create a new alert configuration
    pub async fn create_alert(&self, input: CreateAlertInput) -> Result<AlertConfig> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();

        sqlx::query(
            r#"
            INSERT INTO alerts (id, server_id, metric, condition, threshold, enabled, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&input.server_id)
        .bind(input.metric.to_string())
        .bind(input.condition.to_string())
        .bind(input.threshold)
        .bind(input.enabled)
        .bind(now.to_rfc3339())
        .execute(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to create alert: {}", e)))?;

        Ok(AlertConfig {
            id,
            server_id: input.server_id,
            metric: input.metric,
            condition: input.condition,
            threshold: input.threshold,
            enabled: input.enabled,
            created_at: now,
        })
    }

    /// Get all alert configurations
    pub async fn list_alerts(&self) -> Result<Vec<AlertConfig>> {
        let rows = sqlx::query_as::<_, (String, Option<String>, String, String, f64, bool, String)>(
            "SELECT id, server_id, metric, condition, threshold, enabled, created_at FROM alerts"
        )
        .fetch_all(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to list alerts: {}", e)))?;

        let alerts = rows
            .into_iter()
            .filter_map(|(id, server_id, metric, condition, threshold, enabled, created_at)| {
                let metric = metric.parse().ok()?;
                let condition = condition.parse().ok()?;
                let created_at = DateTime::parse_from_rfc3339(&created_at).ok()?.with_timezone(&Utc);
                
                Some(AlertConfig {
                    id,
                    server_id,
                    metric,
                    condition,
                    threshold: threshold as f32,
                    enabled,
                    created_at,
                })
            })
            .collect();

        Ok(alerts)
    }


    /// Update an alert configuration
    pub async fn update_alert(&self, id: &str, input: UpdateAlertInput) -> Result<AlertConfig> {
        // Get existing alert
        let existing = self.get_alert(id).await?
            .ok_or_else(|| AppError::ValidationError(format!("Alert not found: {}", id)))?;

        let server_id = input.server_id.or(existing.server_id);
        let metric = input.metric.unwrap_or(existing.metric);
        let condition = input.condition.unwrap_or(existing.condition);
        let threshold = input.threshold.unwrap_or(existing.threshold);
        let enabled = input.enabled.unwrap_or(existing.enabled);

        sqlx::query(
            r#"
            UPDATE alerts 
            SET server_id = ?, metric = ?, condition = ?, threshold = ?, enabled = ?
            WHERE id = ?
            "#,
        )
        .bind(&server_id)
        .bind(metric.to_string())
        .bind(condition.to_string())
        .bind(threshold)
        .bind(enabled)
        .bind(id)
        .execute(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to update alert: {}", e)))?;

        Ok(AlertConfig {
            id: id.to_string(),
            server_id,
            metric,
            condition,
            threshold,
            enabled,
            created_at: existing.created_at,
        })
    }

    /// Get a single alert by ID
    pub async fn get_alert(&self, id: &str) -> Result<Option<AlertConfig>> {
        let row = sqlx::query_as::<_, (String, Option<String>, String, String, f64, bool, String)>(
            "SELECT id, server_id, metric, condition, threshold, enabled, created_at FROM alerts WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to get alert: {}", e)))?;

        let alert = row.and_then(|(id, server_id, metric, condition, threshold, enabled, created_at)| {
            let metric = metric.parse().ok()?;
            let condition = condition.parse().ok()?;
            let created_at = DateTime::parse_from_rfc3339(&created_at).ok()?.with_timezone(&Utc);
            
            Some(AlertConfig {
                id,
                server_id,
                metric,
                condition,
                threshold: threshold as f32,
                enabled,
                created_at,
            })
        });

        Ok(alert)
    }

    /// Delete an alert configuration
    pub async fn delete_alert(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM alerts WHERE id = ?")
            .bind(id)
            .execute(&self.db)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to delete alert: {}", e)))?;

        Ok(())
    }

    /// Check alerts against current metrics and return triggered alerts
    /// Requirements: 4.3, 4.6
    pub async fn check_alerts(&self) -> Result<Vec<Alert>> {
        let alerts = self.list_alerts().await?;
        let servers = self.server_manager.lock().await.list_servers().await?;
        let mut triggered = Vec::new();

        for alert in alerts.iter().filter(|a| a.enabled) {
            // Determine which servers to check
            let servers_to_check: Vec<&Server> = if let Some(ref server_id) = alert.server_id {
                servers.iter().filter(|s| &s.id == server_id).collect()
            } else {
                servers.iter().collect()
            };

            for server in servers_to_check {
                if let Ok(metrics) = self.get_server_metrics(server) {
                    let value = self.get_metric_value(&metrics, &alert.metric);
                    
                    if self.evaluate_condition(value, &alert.condition, alert.threshold) {
                        let triggered_alert = Alert {
                            alert_config_id: alert.id.clone(),
                            server_id: server.id.clone(),
                            server_name: server.name.clone(),
                            metric: alert.metric.clone(),
                            condition: alert.condition.clone(),
                            threshold: alert.threshold,
                            actual_value: value,
                            triggered_at: Utc::now(),
                        };
                        triggered.push(triggered_alert);
                    }
                }
            }
        }

        Ok(triggered)
    }


    /// Get the metric value from ServerMetrics based on MetricType
    fn get_metric_value(&self, metrics: &ServerMetrics, metric_type: &MetricType) -> f32 {
        match metric_type {
            MetricType::CpuUsage => metrics.cpu_percent,
            MetricType::MemoryUsage => {
                if metrics.memory_total > 0 {
                    (metrics.memory_used as f32 / metrics.memory_total as f32) * 100.0
                } else {
                    0.0
                }
            }
            MetricType::DiskUsage => {
                if metrics.disk_total > 0 {
                    (metrics.disk_used as f32 / metrics.disk_total as f32) * 100.0
                } else {
                    0.0
                }
            }
        }
    }

    /// Evaluate alert condition
    /// Requirements: 4.3
    pub fn evaluate_condition(&self, value: f32, condition: &AlertCondition, threshold: f32) -> bool {
        match condition {
            AlertCondition::GreaterThan => value > threshold,
            AlertCondition::LessThan => value < threshold,
            AlertCondition::Equals => (value - threshold).abs() < 0.001,
        }
    }

    /// Send desktop notification for triggered alert
    /// Requirements: 4.6
    async fn send_alert_notification(&self, alert: &Alert) {
        if let Some(ref app_handle) = *self.app_handle.read().await {
            // Emit event for frontend to show notification
            let _ = app_handle.emit("alert-triggered", alert);
        }
    }

    // ========================================================================
    // Monitoring Loop
    // Requirements: 4.7
    // ========================================================================

    /// Start the monitoring loop with specified interval
    /// The monitoring loop runs in the background and collects metrics periodically
    /// Requirements: 4.7
    pub async fn start_monitoring(&self, interval_secs: u64) {
        // Update interval
        {
            let mut interval = self.monitoring_interval_secs.write().await;
            *interval = interval_secs;
        }

        // Set monitoring active
        self.monitoring_active.store(true, Ordering::SeqCst);
    }

    /// Stop the monitoring loop
    /// Requirements: 4.7
    pub fn stop_monitoring(&self) {
        self.monitoring_active.store(false, Ordering::SeqCst);
    }

    /// Check if monitoring is active
    pub fn is_monitoring_active(&self) -> bool {
        self.monitoring_active.load(Ordering::SeqCst)
    }

    /// Get current monitoring interval
    pub async fn get_monitoring_interval(&self) -> u64 {
        *self.monitoring_interval_secs.read().await
    }

    /// Run a single monitoring cycle (collect metrics, check alerts, emit events)
    /// This can be called manually or by the background monitoring loop
    pub async fn run_monitoring_cycle(&self) -> Result<()> {
        let servers = self.server_manager.lock().await.list_servers().await?;
        
        for server in servers {
            match self.get_server_metrics(&server) {
                Ok(metrics) => {
                    // Store metrics
                    if let Err(e) = self.store_metrics(&server.id, &metrics).await {
                        eprintln!("Failed to store metrics for {}: {}", server.name, e);
                    }

                    // Emit metrics update event
                    if let Some(ref app_handle) = *self.app_handle.read().await {
                        let _ = app_handle.emit("metrics-updated", serde_json::json!({
                            "server_id": server.id,
                            "metrics": metrics,
                        }));
                    }
                }
                Err(e) => {
                    eprintln!("Failed to collect metrics for {}: {}", server.name, e);
                }
            }
        }

        // Check alerts
        let triggered_alerts = self.check_alerts().await?;
        for alert in triggered_alerts {
            self.send_alert_notification(&alert).await;
        }

        Ok(())
    }
}
