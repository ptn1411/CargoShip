use super::models::*;
use crate::error::{AppError, Result};
use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

pub struct SnippetLibrary {
    db: SqlitePool,
}

impl SnippetLibrary {
    pub fn new(db: SqlitePool) -> Self {
        Self { db }
    }

    /// Validate snippet input
    fn validate_input(name: &str, command: &str, category: &str) -> Result<()> {
        if name.trim().is_empty() {
            return Err(AppError::ValidationError(
                "Snippet name cannot be empty".to_string(),
            ));
        }
        if command.trim().is_empty() {
            return Err(AppError::ValidationError(
                "Snippet command cannot be empty".to_string(),
            ));
        }
        if category.trim().is_empty() {
            return Err(AppError::ValidationError(
                "Snippet category cannot be empty".to_string(),
            ));
        }
        Ok(())
    }

    /// Create a new snippet
    /// Requirements: 5.1
    pub async fn create_snippet(&self, input: CreateSnippetInput) -> Result<Snippet> {
        Self::validate_input(&input.name, &input.command, &input.category)?;

        let now = Utc::now();
        let id = Uuid::new_v4().to_string();
        let tags_json = serde_json::to_string(&input.tags).unwrap_or_else(|_| "[]".to_string());

        sqlx::query(
            r#"
            INSERT INTO snippets (id, name, description, command, category, tags, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&input.name)
        .bind(&input.description)
        .bind(&input.command)
        .bind(&input.category)
        .bind(&tags_json)
        .bind(now.to_rfc3339())
        .bind(now.to_rfc3339())
        .execute(&self.db)
        .await?;

        Ok(Snippet {
            id,
            name: input.name,
            description: input.description,
            command: input.command,
            category: input.category,
            tags: input.tags,
            created_at: now,
            updated_at: now,
        })
    }

    /// Get a snippet by ID
    /// Requirements: 5.2
    pub async fn get_snippet(&self, id: &str) -> Result<Option<Snippet>> {
        let row = sqlx::query_as::<_, SnippetRow>("SELECT * FROM snippets WHERE id = ?")
            .bind(id)
            .fetch_optional(&self.db)
            .await?;

        Ok(row.map(|r| r.into_snippet()))
    }

    /// List all snippets
    /// Requirements: 5.2
    pub async fn list_snippets(&self) -> Result<Vec<Snippet>> {
        let rows =
            sqlx::query_as::<_, SnippetRow>("SELECT * FROM snippets ORDER BY category, name")
                .fetch_all(&self.db)
                .await?;

        Ok(rows.into_iter().map(|r| r.into_snippet()).collect())
    }

    /// List snippets by category
    /// Requirements: 5.2
    pub async fn list_by_category(&self, category: &str) -> Result<Vec<Snippet>> {
        let rows = sqlx::query_as::<_, SnippetRow>(
            "SELECT * FROM snippets WHERE category = ? ORDER BY name",
        )
        .bind(category)
        .fetch_all(&self.db)
        .await?;

        Ok(rows.into_iter().map(|r| r.into_snippet()).collect())
    }

    /// Search snippets by name or command content (case-insensitive)
    /// Requirements: 5.3
    pub async fn search_snippets(&self, query: &str) -> Result<Vec<Snippet>> {
        let search_pattern = format!("%{}%", query.to_lowercase());

        let rows = sqlx::query_as::<_, SnippetRow>(
            r#"
            SELECT * FROM snippets 
            WHERE LOWER(name) LIKE ? OR LOWER(command) LIKE ?
            ORDER BY category, name
            "#,
        )
        .bind(&search_pattern)
        .bind(&search_pattern)
        .fetch_all(&self.db)
        .await?;

        Ok(rows.into_iter().map(|r| r.into_snippet()).collect())
    }

    /// Update an existing snippet
    /// Requirements: 5.1
    pub async fn update_snippet(&self, id: &str, input: UpdateSnippetInput) -> Result<Snippet> {
        let existing = self
            .get_snippet(id)
            .await?
            .ok_or_else(|| AppError::ValidationError(format!("Snippet not found: {}", id)))?;

        let name = input.name.unwrap_or(existing.name);
        let description = input.description.or(existing.description);
        let command = input.command.unwrap_or(existing.command);
        let category = input.category.unwrap_or(existing.category);
        let tags = input.tags.unwrap_or(existing.tags);

        Self::validate_input(&name, &command, &category)?;

        let now = Utc::now();
        let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());

        sqlx::query(
            r#"
            UPDATE snippets 
            SET name = ?, description = ?, command = ?, category = ?, tags = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(&name)
        .bind(&description)
        .bind(&command)
        .bind(&category)
        .bind(&tags_json)
        .bind(now.to_rfc3339())
        .bind(id)
        .execute(&self.db)
        .await?;

        Ok(Snippet {
            id: id.to_string(),
            name,
            description,
            command,
            category,
            tags,
            created_at: existing.created_at,
            updated_at: now,
        })
    }

    /// Delete a snippet
    /// Requirements: 5.1
    pub async fn delete_snippet(&self, id: &str) -> Result<()> {
        let result = sqlx::query("DELETE FROM snippets WHERE id = ?")
            .bind(id)
            .execute(&self.db)
            .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::ValidationError(format!(
                "Snippet not found: {}",
                id
            )));
        }

        Ok(())
    }

    /// Export all snippets to JSON
    /// Requirements: 5.6
    pub async fn export_snippets(&self) -> Result<String> {
        let snippets = self.list_snippets().await?;

        let export = SnippetExport {
            version: "1.0".to_string(),
            exported_at: Utc::now(),
            snippets: snippets.iter().map(SnippetExportItem::from).collect(),
        };

        serde_json::to_string_pretty(&export)
            .map_err(|e| AppError::ValidationError(format!("Failed to serialize snippets: {}", e)))
    }

    /// Import snippets from JSON (merge with existing)
    /// Requirements: 5.7
    pub async fn import_snippets(&self, json: &str) -> Result<ImportResult> {
        let export: SnippetExport = serde_json::from_str(json)
            .map_err(|e| AppError::ValidationError(format!("Invalid JSON format: {}", e)))?;

        let mut imported = 0;
        let mut skipped = 0;
        let mut errors = Vec::new();

        for item in export.snippets {
            // Check if snippet with same name already exists
            let existing = self.find_by_name(&item.name).await?;

            if existing.is_some() {
                skipped += 1;
                continue;
            }

            // Validate and create the snippet
            match Self::validate_input(&item.name, &item.command, &item.category) {
                Ok(_) => {
                    let input = CreateSnippetInput {
                        name: item.name.clone(),
                        description: item.description,
                        command: item.command,
                        category: item.category,
                        tags: item.tags,
                    };

                    match self.create_snippet(input).await {
                        Ok(_) => imported += 1,
                        Err(e) => errors.push(format!("Failed to import '{}': {}", item.name, e)),
                    }
                }
                Err(e) => {
                    errors.push(format!("Invalid snippet '{}': {}", item.name, e));
                }
            }
        }

        Ok(ImportResult {
            imported,
            skipped,
            errors,
        })
    }

    /// Find a snippet by name (for import deduplication)
    async fn find_by_name(&self, name: &str) -> Result<Option<Snippet>> {
        let row = sqlx::query_as::<_, SnippetRow>("SELECT * FROM snippets WHERE name = ?")
            .bind(name)
            .fetch_optional(&self.db)
            .await?;

        Ok(row.map(|r| r.into_snippet()))
    }

    /// Get all unique categories
    pub async fn list_categories(&self) -> Result<Vec<String>> {
        let categories = sqlx::query_scalar::<_, String>(
            "SELECT DISTINCT category FROM snippets ORDER BY category",
        )
        .fetch_all(&self.db)
        .await?;

        Ok(categories)
    }

    /// Seed default snippets if none exist
    /// Called on app startup to provide useful snippets out of the box
    pub async fn seed_default_snippets(&self) -> Result<()> {
        let default_snippets = vec![
            // System Info
            CreateSnippetInput {
                name: "System Info".to_string(),
                description: Some("Display system information".to_string()),
                command: "uname -a".to_string(),
                category: "System".to_string(),
                tags: vec!["info".to_string(), "system".to_string()],
            },
            CreateSnippetInput {
                name: "Disk Usage".to_string(),
                description: Some("Show disk space usage".to_string()),
                command: "df -h".to_string(),
                category: "System".to_string(),
                tags: vec!["disk".to_string(), "storage".to_string()],
            },
            CreateSnippetInput {
                name: "Memory Usage".to_string(),
                description: Some("Display memory usage".to_string()),
                command: "free -h".to_string(),
                category: "System".to_string(),
                tags: vec!["memory".to_string(), "ram".to_string()],
            },
            CreateSnippetInput {
                name: "CPU Info".to_string(),
                description: Some("Show CPU information".to_string()),
                command: "lscpu | head -20".to_string(),
                category: "System".to_string(),
                tags: vec!["cpu".to_string(), "hardware".to_string()],
            },
            CreateSnippetInput {
                name: "Top Processes".to_string(),
                description: Some("Show top 10 processes by CPU".to_string()),
                command: "ps aux --sort=-%cpu | head -11".to_string(),
                category: "System".to_string(),
                tags: vec!["process".to_string(), "cpu".to_string()],
            },
            CreateSnippetInput {
                name: "Uptime".to_string(),
                description: Some("Show system uptime".to_string()),
                command: "uptime".to_string(),
                category: "System".to_string(),
                tags: vec!["uptime".to_string()],
            },
            // Network
            CreateSnippetInput {
                name: "Network Interfaces".to_string(),
                description: Some("List network interfaces".to_string()),
                command: "ip addr".to_string(),
                category: "Network".to_string(),
                tags: vec!["network".to_string(), "ip".to_string()],
            },
            CreateSnippetInput {
                name: "Open Ports".to_string(),
                description: Some("Show listening ports".to_string()),
                command: "ss -tulpn".to_string(),
                category: "Network".to_string(),
                tags: vec!["ports".to_string(), "network".to_string()],
            },
            CreateSnippetInput {
                name: "Active Connections".to_string(),
                description: Some("Show active network connections".to_string()),
                command: "ss -tan".to_string(),
                category: "Network".to_string(),
                tags: vec!["connections".to_string(), "network".to_string()],
            },
            CreateSnippetInput {
                name: "DNS Lookup".to_string(),
                description: Some("DNS lookup for a domain".to_string()),
                command: "dig google.com +short".to_string(),
                category: "Network".to_string(),
                tags: vec!["dns".to_string(), "network".to_string()],
            },
            // Docker
            CreateSnippetInput {
                name: "Docker Containers".to_string(),
                description: Some("List running containers".to_string()),
                command: "docker ps".to_string(),
                category: "Docker".to_string(),
                tags: vec!["docker".to_string(), "containers".to_string()],
            },
            CreateSnippetInput {
                name: "Docker All Containers".to_string(),
                description: Some("List all containers including stopped".to_string()),
                command: "docker ps -a".to_string(),
                category: "Docker".to_string(),
                tags: vec!["docker".to_string(), "containers".to_string()],
            },
            CreateSnippetInput {
                name: "Docker Images".to_string(),
                description: Some("List Docker images".to_string()),
                command: "docker images".to_string(),
                category: "Docker".to_string(),
                tags: vec!["docker".to_string(), "images".to_string()],
            },
            CreateSnippetInput {
                name: "Docker Stats".to_string(),
                description: Some("Show container resource usage".to_string()),
                command: "docker stats --no-stream".to_string(),
                category: "Docker".to_string(),
                tags: vec!["docker".to_string(), "stats".to_string()],
            },
            CreateSnippetInput {
                name: "Docker Prune".to_string(),
                description: Some("Remove unused Docker resources".to_string()),
                command: "docker system prune -f".to_string(),
                category: "Docker".to_string(),
                tags: vec!["docker".to_string(), "cleanup".to_string()],
            },
            // Services
            CreateSnippetInput {
                name: "List Services".to_string(),
                description: Some("List all systemd services".to_string()),
                command: "systemctl list-units --type=service".to_string(),
                category: "Services".to_string(),
                tags: vec!["systemd".to_string(), "services".to_string()],
            },
            CreateSnippetInput {
                name: "Failed Services".to_string(),
                description: Some("Show failed systemd services".to_string()),
                command: "systemctl --failed".to_string(),
                category: "Services".to_string(),
                tags: vec!["systemd".to_string(), "failed".to_string()],
            },
            CreateSnippetInput {
                name: "Service Status".to_string(),
                description: Some("Check status of a service".to_string()),
                command: "systemctl status nginx".to_string(),
                category: "Services".to_string(),
                tags: vec!["systemd".to_string(), "status".to_string()],
            },
            // Logs
            CreateSnippetInput {
                name: "System Logs".to_string(),
                description: Some("View recent system logs".to_string()),
                command: "journalctl -xe --no-pager | tail -50".to_string(),
                category: "Logs".to_string(),
                tags: vec!["logs".to_string(), "journalctl".to_string()],
            },
            CreateSnippetInput {
                name: "Follow Logs".to_string(),
                description: Some("Follow system logs in real-time".to_string()),
                command: "journalctl -f".to_string(),
                category: "Logs".to_string(),
                tags: vec!["logs".to_string(), "follow".to_string()],
            },
            CreateSnippetInput {
                name: "Auth Logs".to_string(),
                description: Some("View authentication logs".to_string()),
                command: "tail -50 /var/log/auth.log".to_string(),
                category: "Logs".to_string(),
                tags: vec![
                    "logs".to_string(),
                    "auth".to_string(),
                    "security".to_string(),
                ],
            },
            // Files
            CreateSnippetInput {
                name: "Find Large Files".to_string(),
                description: Some("Find files larger than 100MB".to_string()),
                command: "find / -type f -size +100M 2>/dev/null | head -20".to_string(),
                category: "Files".to_string(),
                tags: vec!["files".to_string(), "disk".to_string()],
            },
            CreateSnippetInput {
                name: "Directory Size".to_string(),
                description: Some("Show directory sizes".to_string()),
                command: "du -sh /* 2>/dev/null | sort -hr | head -10".to_string(),
                category: "Files".to_string(),
                tags: vec!["disk".to_string(), "size".to_string()],
            },
            CreateSnippetInput {
                name: "Recent Files".to_string(),
                description: Some("Find recently modified files".to_string()),
                command: "find . -type f -mmin -60 2>/dev/null | head -20".to_string(),
                category: "Files".to_string(),
                tags: vec!["files".to_string(), "recent".to_string()],
            },
            // Security
            CreateSnippetInput {
                name: "Who's Logged In".to_string(),
                description: Some("Show logged in users".to_string()),
                command: "who".to_string(),
                category: "Security".to_string(),
                tags: vec!["users".to_string(), "security".to_string()],
            },
            CreateSnippetInput {
                name: "Last Logins".to_string(),
                description: Some("Show recent login history".to_string()),
                command: "last -10".to_string(),
                category: "Security".to_string(),
                tags: vec!["logins".to_string(), "security".to_string()],
            },
            CreateSnippetInput {
                name: "Failed Logins".to_string(),
                description: Some("Show failed login attempts".to_string()),
                command: "lastb -10 2>/dev/null || echo 'Need root access'".to_string(),
                category: "Security".to_string(),
                tags: vec!["security".to_string(), "failed".to_string()],
            },
            // Clawdbot
            CreateSnippetInput {
                name: "Clawdbot Onboard".to_string(),
                description: Some("Onboard and install system service".to_string()),
                command: "clawdbot onboard --install-daemon".to_string(),
                category: "Clawdbot".to_string(),
                tags: vec!["clawdbot".to_string(), "setup".to_string()],
            },
            CreateSnippetInput {
                name: "Clawdbot Login".to_string(),
                description: Some("Pair WhatsApp/Scan QR".to_string()),
                command: "clawdbot channels login".to_string(),
                category: "Clawdbot".to_string(),
                tags: vec!["clawdbot".to_string(), "auth".to_string()],
            },
            CreateSnippetInput {
                name: "Clawdbot Doctor".to_string(),
                description: Some("Check efficient operation and issues".to_string()),
                command: "clawdbot doctor".to_string(),
                category: "Clawdbot".to_string(),
                tags: vec!["clawdbot".to_string(), "debug".to_string()],
            },
            CreateSnippetInput {
                name: "Clawdbot GitHub Copilot Login".to_string(),
                description: Some("Login to GitHub Copilot model auth".to_string()),
                command: "clawdbot models auth login-github-copilot".to_string(),
                category: "Clawdbot".to_string(),
                tags: vec![
                    "clawdbot".to_string(),
                    "ai".to_string(),
                    "copilot".to_string(),
                ],
            },
            CreateSnippetInput {
                name: "Clawdbot Set Gemini Auth".to_string(),
                description: Some("Login to Google Antigravity Auth".to_string()),
                command: "clawdbot models auth login --provider google-antigravity --set-default"
                    .to_string(),
                category: "Clawdbot".to_string(),
                tags: vec![
                    "clawdbot".to_string(),
                    "ai".to_string(),
                    "gemini".to_string(),
                ],
            },
            CreateSnippetInput {
                name: "Clawdbot Enable Antigravity".to_string(),
                description: Some("Enable Google Antigravity Auth plugin".to_string()),
                command: "clawdbot plugins enable google-antigravity-auth".to_string(),
                category: "Clawdbot".to_string(),
                tags: vec![
                    "clawdbot".to_string(),
                    "plugins".to_string(),
                    "gemini".to_string(),
                ],
            },
            CreateSnippetInput {
                name: "Clawdbot Set Model".to_string(),
                description: Some("Set default model to GPT-4o".to_string()),
                command: "clawdbot models set github-copilot/gpt-4o".to_string(),
                category: "Clawdbot".to_string(),
                tags: vec![
                    "clawdbot".to_string(),
                    "ai".to_string(),
                    "config".to_string(),
                ],
            },
            CreateSnippetInput {
                name: "Clawdbot Gateway".to_string(),
                description: Some("Run the API gateway manually".to_string()),
                command: "clawdbot gateway --port 18789".to_string(),
                category: "Clawdbot".to_string(),
                tags: vec!["clawdbot".to_string(), "gateway".to_string()],
            },
        ];

        for input in default_snippets {
            // Check if snippet exists by name to avoid duplicates
            let exists =
                sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM snippets WHERE name = ?")
                    .bind(&input.name)
                    .fetch_one(&self.db)
                    .await
                    .unwrap_or(0)
                    > 0;

            if !exists {
                if let Err(e) = self.create_snippet(input).await {
                    eprintln!("Failed to create default snippet: {}", e);
                }
            }
        }

        Ok(())
    }
}

// Helper struct for database row mapping
#[derive(sqlx::FromRow)]
struct SnippetRow {
    id: String,
    name: String,
    description: Option<String>,
    command: String,
    category: String,
    tags: String,
    created_at: String,
    updated_at: String,
}

impl SnippetRow {
    fn into_snippet(self) -> Snippet {
        Snippet {
            id: self.id,
            name: self.name,
            description: self.description,
            command: self.command,
            category: self.category,
            tags: serde_json::from_str(&self.tags).unwrap_or_default(),
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            updated_at: chrono::DateTime::parse_from_rfc3339(&self.updated_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
        }
    }
}
