use crate::scripts::models::*;
use chrono::Utc;
use std::collections::HashMap;

/// Information about a template for display in UI
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TemplateInfo {
    pub name: String,
    pub description: String,
    pub category: String,
    pub variables: Vec<Variable>,
}

/// Library of built-in deployment script templates
/// Requirements: 3.1
pub struct TemplateLibrary {
    templates: HashMap<String, DeploymentScript>,
}

impl TemplateLibrary {
    /// Create a new template library with all built-in templates
    pub fn new() -> Self {
        let mut templates = HashMap::new();

        // Add all built-in templates
        let builtin = vec![
            Self::nodejs_template(),
            Self::docker_compose_template(),
            Self::php_template(),
            Self::python_template(),
            Self::static_site_template(),
            Self::database_migration_template(),
            Self::ssl_setup_template(),
            Self::firewall_config_template(),
            // New installation templates
            Self::nginx_install_template(),
            Self::mysql_install_template(),
            Self::redis_install_template(),
            Self::nginx_vhost_template(),
            Self::mysql_database_template(),
            Self::redis_config_template(),
            Self::clawdbot_install_template(),
            Self::sys_swap_template(),
        ];

        for template in builtin {
            templates.insert(template.name.clone(), template);
        }

        Self { templates }
    }

    /// Get a template by name
    pub fn get_template(&self, name: &str) -> Option<&DeploymentScript> {
        self.templates.get(name)
    }

    /// List all available templates
    pub fn list_templates(&self) -> Vec<TemplateInfo> {
        self.templates
            .values()
            .map(|t| TemplateInfo {
                name: t.name.clone(),
                description: t.description.clone(),
                category: Self::get_category(&t.name),
                variables: t.variables.clone(),
            })
            .collect()
    }

    /// Create a new script from a template
    /// Requirements: 3.2, 3.3, 3.4
    pub fn create_from_template(&self, template_name: &str) -> Option<DeploymentScript> {
        self.templates.get(template_name).map(|template| {
            let now = Utc::now();
            DeploymentScript {
                id: uuid::Uuid::new_v4().to_string(),
                name: format!("{} - New", template.name),
                description: template.description.clone(),
                variables: template.variables.clone(),
                steps: template
                    .steps
                    .iter()
                    .map(|s| Step {
                        id: uuid::Uuid::new_v4().to_string(),
                        ..s.clone()
                    })
                    .collect(),
                rollback_steps: template
                    .rollback_steps
                    .iter()
                    .map(|s| Step {
                        id: uuid::Uuid::new_v4().to_string(),
                        ..s.clone()
                    })
                    .collect(),
                tags: template.tags.clone(),
                is_template: false,
                created_at: now,
                updated_at: now,
            }
        })
    }

    fn get_category(name: &str) -> String {
        match name {
            "Node.js Deployment" | "PHP Deployment" | "Python Deployment" => {
                "Application".to_string()
            }
            "Docker Compose Deployment" => "Container".to_string(),
            "Static Site (Nginx)" | "Install Nginx" | "Nginx Virtual Host" => {
                "Web Server".to_string()
            }
            "Database Migration" | "Install MySQL" | "MySQL Create Database" => {
                "Database".to_string()
            }
            "Install Redis" | "Redis Configuration" => "Cache".to_string(),
            "SSL Certificate Setup" | "Firewall Configuration" => "Security".to_string(),
            _ => "Other".to_string(),
        }
    }

    /// Node.js deployment template
    /// Requirements: 3.1
    fn nodejs_template() -> DeploymentScript {
        let now = Utc::now();
        DeploymentScript {
            id: "template-nodejs".to_string(),
            name: "Node.js Deployment".to_string(),
            description: "Deploy a Node.js application with PM2 process manager".to_string(),
            variables: vec![
                Variable {
                    name: "app_name".to_string(),
                    description: "Application name for PM2".to_string(),
                    default_value: Some("my-app".to_string()),
                    required: true,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "app_dir".to_string(),
                    description: "Application directory on server".to_string(),
                    default_value: Some("/var/www/app".to_string()),
                    required: true,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "git_repo".to_string(),
                    description: "Git repository URL".to_string(),
                    default_value: None,
                    required: true,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "git_branch".to_string(),
                    description: "Git branch to deploy".to_string(),
                    default_value: Some("main".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "node_env".to_string(),
                    description: "Node environment".to_string(),
                    default_value: Some("production".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
            ],
            steps: vec![
                Step {
                    id: "step-1".to_string(),
                    name: "Pull latest code".to_string(),
                    commands: vec![
                        "cd {{app_dir}}".to_string(),
                        "git fetch origin".to_string(),
                        "git checkout {{git_branch}}".to_string(),
                        "git pull origin {{git_branch}}".to_string(),
                    ],
                    working_dir: Some("{{app_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(300),
                },
                Step {
                    id: "step-2".to_string(),
                    name: "Install dependencies".to_string(),
                    commands: vec!["npm ci --production".to_string()],
                    working_dir: Some("{{app_dir}}".to_string()),
                    env: HashMap::from([("NODE_ENV".to_string(), "{{node_env}}".to_string())]),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(600),
                },
                Step {
                    id: "step-3".to_string(),
                    name: "Build application".to_string(),
                    commands: vec!["npm run build".to_string()],
                    working_dir: Some("{{app_dir}}".to_string()),
                    env: HashMap::from([("NODE_ENV".to_string(), "{{node_env}}".to_string())]),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(600),
                },
                Step {
                    id: "step-4".to_string(),
                    name: "Restart application".to_string(),
                    commands: vec![
                        "pm2 restart {{app_name}} || pm2 start npm --name {{app_name}} -- start"
                            .to_string(),
                        "pm2 save".to_string(),
                    ],
                    working_dir: Some("{{app_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(120),
                },
            ],
            rollback_steps: vec![Step {
                id: "rollback-1".to_string(),
                name: "Revert to previous commit".to_string(),
                commands: vec![
                    "git checkout HEAD~1".to_string(),
                    "npm ci --production".to_string(),
                    "npm run build".to_string(),
                    "pm2 restart {{app_name}}".to_string(),
                ],
                working_dir: Some("{{app_dir}}".to_string()),
                env: HashMap::new(),
                condition: None,
                on_error: OnError::Abort,
                timeout: Some(600),
            }],
            tags: vec![
                "nodejs".to_string(),
                "pm2".to_string(),
                "application".to_string(),
            ],
            is_template: true,
            created_at: now,
            updated_at: now,
        }
    }

    /// Docker Compose deployment template
    /// Requirements: 3.1
    fn docker_compose_template() -> DeploymentScript {
        let now = Utc::now();
        DeploymentScript {
            id: "template-docker-compose".to_string(),
            name: "Docker Compose Deployment".to_string(),
            description: "Deploy application using Docker Compose with zero-downtime".to_string(),
            variables: vec![
                Variable {
                    name: "project_dir".to_string(),
                    description: "Project directory containing docker-compose.yml".to_string(),
                    default_value: Some("/opt/app".to_string()),
                    required: true,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "compose_file".to_string(),
                    description: "Docker Compose file name".to_string(),
                    default_value: Some("docker-compose.yml".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "git_repo".to_string(),
                    description: "Git repository URL".to_string(),
                    default_value: None,
                    required: true,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "git_branch".to_string(),
                    description: "Git branch to deploy".to_string(),
                    default_value: Some("main".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "registry_url".to_string(),
                    description: "Docker registry URL (optional)".to_string(),
                    default_value: None,
                    required: false,
                    var_type: VariableType::String,
                },
            ],
            steps: vec![
                Step {
                    id: "step-1".to_string(),
                    name: "Pull latest code".to_string(),
                    commands: vec![
                        "git fetch origin".to_string(),
                        "git checkout {{git_branch}}".to_string(),
                        "git pull origin {{git_branch}}".to_string(),
                    ],
                    working_dir: Some("{{project_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(300),
                },
                Step {
                    id: "step-2".to_string(),
                    name: "Pull Docker images".to_string(),
                    commands: vec!["docker-compose -f {{compose_file}} pull".to_string()],
                    working_dir: Some("{{project_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(600),
                },
                Step {
                    id: "step-3".to_string(),
                    name: "Build images".to_string(),
                    commands: vec![
                        "docker-compose -f {{compose_file}} build --no-cache".to_string()
                    ],
                    working_dir: Some("{{project_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(1200),
                },
                Step {
                    id: "step-4".to_string(),
                    name: "Deploy with zero-downtime".to_string(),
                    commands: vec![
                        "docker-compose -f {{compose_file}} up -d --remove-orphans".to_string()
                    ],
                    working_dir: Some("{{project_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(300),
                },
                Step {
                    id: "step-5".to_string(),
                    name: "Cleanup old images".to_string(),
                    commands: vec!["docker image prune -f".to_string()],
                    working_dir: Some("{{project_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(120),
                },
            ],
            rollback_steps: vec![Step {
                id: "rollback-1".to_string(),
                name: "Rollback to previous version".to_string(),
                commands: vec![
                    "git checkout HEAD~1".to_string(),
                    "docker-compose -f {{compose_file}} up -d --remove-orphans".to_string(),
                ],
                working_dir: Some("{{project_dir}}".to_string()),
                env: HashMap::new(),
                condition: None,
                on_error: OnError::Abort,
                timeout: Some(300),
            }],
            tags: vec![
                "docker".to_string(),
                "compose".to_string(),
                "container".to_string(),
            ],
            is_template: true,
            created_at: now,
            updated_at: now,
        }
    }

    /// PHP deployment template
    /// Requirements: 3.1
    fn php_template() -> DeploymentScript {
        let now = Utc::now();
        DeploymentScript {
            id: "template-php".to_string(),
            name: "PHP Deployment".to_string(),
            description: "Deploy a PHP application with Composer and PHP-FPM".to_string(),
            variables: vec![
                Variable {
                    name: "app_dir".to_string(),
                    description: "Application directory on server".to_string(),
                    default_value: Some("/var/www/html".to_string()),
                    required: true,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "git_repo".to_string(),
                    description: "Git repository URL".to_string(),
                    default_value: None,
                    required: true,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "git_branch".to_string(),
                    description: "Git branch to deploy".to_string(),
                    default_value: Some("main".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "php_fpm_service".to_string(),
                    description: "PHP-FPM service name".to_string(),
                    default_value: Some("php-fpm".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "web_user".to_string(),
                    description: "Web server user".to_string(),
                    default_value: Some("www-data".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
            ],
            steps: vec![
                Step {
                    id: "step-1".to_string(),
                    name: "Enable maintenance mode".to_string(),
                    commands: vec!["touch {{app_dir}}/storage/framework/down".to_string()],
                    working_dir: Some("{{app_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
                Step {
                    id: "step-2".to_string(),
                    name: "Pull latest code".to_string(),
                    commands: vec![
                        "git fetch origin".to_string(),
                        "git checkout {{git_branch}}".to_string(),
                        "git pull origin {{git_branch}}".to_string(),
                    ],
                    working_dir: Some("{{app_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(300),
                },
                Step {
                    id: "step-3".to_string(),
                    name: "Install Composer dependencies".to_string(),
                    commands: vec!["composer install --no-dev --optimize-autoloader".to_string()],
                    working_dir: Some("{{app_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(600),
                },
                Step {
                    id: "step-4".to_string(),
                    name: "Run database migrations".to_string(),
                    commands: vec!["php artisan migrate --force".to_string()],
                    working_dir: Some("{{app_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(300),
                },
                Step {
                    id: "step-5".to_string(),
                    name: "Clear and rebuild caches".to_string(),
                    commands: vec![
                        "php artisan config:cache".to_string(),
                        "php artisan route:cache".to_string(),
                        "php artisan view:cache".to_string(),
                    ],
                    working_dir: Some("{{app_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(120),
                },
                Step {
                    id: "step-6".to_string(),
                    name: "Set permissions".to_string(),
                    commands: vec![
                        "chown -R {{web_user}}:{{web_user}} {{app_dir}}/storage".to_string(),
                        "chown -R {{web_user}}:{{web_user}} {{app_dir}}/bootstrap/cache"
                            .to_string(),
                        "chmod -R 775 {{app_dir}}/storage".to_string(),
                    ],
                    working_dir: Some("{{app_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(60),
                },
                Step {
                    id: "step-7".to_string(),
                    name: "Restart PHP-FPM".to_string(),
                    commands: vec!["systemctl restart {{php_fpm_service}}".to_string()],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(60),
                },
                Step {
                    id: "step-8".to_string(),
                    name: "Disable maintenance mode".to_string(),
                    commands: vec!["rm -f {{app_dir}}/storage/framework/down".to_string()],
                    working_dir: Some("{{app_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
            ],
            rollback_steps: vec![Step {
                id: "rollback-1".to_string(),
                name: "Revert to previous commit".to_string(),
                commands: vec![
                    "git checkout HEAD~1".to_string(),
                    "composer install --no-dev --optimize-autoloader".to_string(),
                    "php artisan migrate:rollback --force".to_string(),
                    "php artisan config:cache".to_string(),
                    "systemctl restart {{php_fpm_service}}".to_string(),
                    "rm -f {{app_dir}}/storage/framework/down".to_string(),
                ],
                working_dir: Some("{{app_dir}}".to_string()),
                env: HashMap::new(),
                condition: None,
                on_error: OnError::Abort,
                timeout: Some(600),
            }],
            tags: vec![
                "php".to_string(),
                "laravel".to_string(),
                "composer".to_string(),
            ],
            is_template: true,
            created_at: now,
            updated_at: now,
        }
    }

    /// Python deployment template
    /// Requirements: 3.1
    fn python_template() -> DeploymentScript {
        let now = Utc::now();
        DeploymentScript {
            id: "template-python".to_string(),
            name: "Python Deployment".to_string(),
            description: "Deploy a Python application with virtualenv and Gunicorn".to_string(),
            variables: vec![
                Variable {
                    name: "app_name".to_string(),
                    description: "Application name".to_string(),
                    default_value: Some("myapp".to_string()),
                    required: true,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "app_dir".to_string(),
                    description: "Application directory on server".to_string(),
                    default_value: Some("/opt/app".to_string()),
                    required: true,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "git_repo".to_string(),
                    description: "Git repository URL".to_string(),
                    default_value: None,
                    required: true,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "git_branch".to_string(),
                    description: "Git branch to deploy".to_string(),
                    default_value: Some("main".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "venv_dir".to_string(),
                    description: "Virtual environment directory".to_string(),
                    default_value: Some("venv".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "gunicorn_workers".to_string(),
                    description: "Number of Gunicorn workers".to_string(),
                    default_value: Some("4".to_string()),
                    required: false,
                    var_type: VariableType::Number,
                },
            ],
            steps: vec![
                Step {
                    id: "step-1".to_string(),
                    name: "Pull latest code".to_string(),
                    commands: vec![
                        "git fetch origin".to_string(),
                        "git checkout {{git_branch}}".to_string(),
                        "git pull origin {{git_branch}}".to_string(),
                    ],
                    working_dir: Some("{{app_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(300),
                },
                Step {
                    id: "step-2".to_string(),
                    name: "Create/update virtual environment".to_string(),
                    commands: vec![
                        "python3 -m venv {{venv_dir}}".to_string(),
                        "{{venv_dir}}/bin/pip install --upgrade pip".to_string(),
                    ],
                    working_dir: Some("{{app_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(300),
                },
                Step {
                    id: "step-3".to_string(),
                    name: "Install dependencies".to_string(),
                    commands: vec!["{{venv_dir}}/bin/pip install -r requirements.txt".to_string()],
                    working_dir: Some("{{app_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(600),
                },
                Step {
                    id: "step-4".to_string(),
                    name: "Run database migrations".to_string(),
                    commands: vec![
                        "{{venv_dir}}/bin/python manage.py migrate --noinput".to_string()
                    ],
                    working_dir: Some("{{app_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(300),
                },
                Step {
                    id: "step-5".to_string(),
                    name: "Collect static files".to_string(),
                    commands: vec![
                        "{{venv_dir}}/bin/python manage.py collectstatic --noinput".to_string()
                    ],
                    working_dir: Some("{{app_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(120),
                },
                Step {
                    id: "step-6".to_string(),
                    name: "Restart application".to_string(),
                    commands: vec!["systemctl restart {{app_name}}".to_string()],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(60),
                },
            ],
            rollback_steps: vec![Step {
                id: "rollback-1".to_string(),
                name: "Revert to previous commit".to_string(),
                commands: vec![
                    "git checkout HEAD~1".to_string(),
                    "{{venv_dir}}/bin/pip install -r requirements.txt".to_string(),
                    "{{venv_dir}}/bin/python manage.py migrate --noinput".to_string(),
                    "systemctl restart {{app_name}}".to_string(),
                ],
                working_dir: Some("{{app_dir}}".to_string()),
                env: HashMap::new(),
                condition: None,
                on_error: OnError::Abort,
                timeout: Some(600),
            }],
            tags: vec![
                "python".to_string(),
                "django".to_string(),
                "gunicorn".to_string(),
            ],
            is_template: true,
            created_at: now,
            updated_at: now,
        }
    }

    /// Static site (Nginx) deployment template
    /// Requirements: 3.1
    fn static_site_template() -> DeploymentScript {
        let now = Utc::now();
        DeploymentScript {
            id: "template-static-site".to_string(),
            name: "Static Site (Nginx)".to_string(),
            description: "Deploy a static website with Nginx".to_string(),
            variables: vec![
                Variable {
                    name: "site_dir".to_string(),
                    description: "Website directory on server".to_string(),
                    default_value: Some("/var/www/html".to_string()),
                    required: true,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "git_repo".to_string(),
                    description: "Git repository URL".to_string(),
                    default_value: None,
                    required: true,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "git_branch".to_string(),
                    description: "Git branch to deploy".to_string(),
                    default_value: Some("main".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "build_command".to_string(),
                    description: "Build command (e.g., npm run build)".to_string(),
                    default_value: None,
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "build_output_dir".to_string(),
                    description: "Build output directory".to_string(),
                    default_value: Some("dist".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "web_user".to_string(),
                    description: "Web server user".to_string(),
                    default_value: Some("www-data".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
            ],
            steps: vec![
                Step {
                    id: "step-1".to_string(),
                    name: "Pull latest code".to_string(),
                    commands: vec![
                        "git fetch origin".to_string(),
                        "git checkout {{git_branch}}".to_string(),
                        "git pull origin {{git_branch}}".to_string(),
                    ],
                    working_dir: Some("{{site_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(300),
                },
                Step {
                    id: "step-2".to_string(),
                    name: "Install dependencies".to_string(),
                    commands: vec!["npm ci".to_string()],
                    working_dir: Some("{{site_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: Some("test -f package.json".to_string()),
                    on_error: OnError::Abort,
                    timeout: Some(600),
                },
                Step {
                    id: "step-3".to_string(),
                    name: "Build site".to_string(),
                    commands: vec!["{{build_command}}".to_string()],
                    working_dir: Some("{{site_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: Some("test -n \"{{build_command}}\"".to_string()),
                    on_error: OnError::Rollback,
                    timeout: Some(600),
                },
                Step {
                    id: "step-4".to_string(),
                    name: "Set permissions".to_string(),
                    commands: vec![
                        "chown -R {{web_user}}:{{web_user}} {{site_dir}}".to_string(),
                        "find {{site_dir}} -type d -exec chmod 755 {} \\;".to_string(),
                        "find {{site_dir}} -type f -exec chmod 644 {} \\;".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(120),
                },
                Step {
                    id: "step-5".to_string(),
                    name: "Reload Nginx".to_string(),
                    commands: vec!["nginx -t && systemctl reload nginx".to_string()],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(60),
                },
            ],
            rollback_steps: vec![Step {
                id: "rollback-1".to_string(),
                name: "Revert to previous commit".to_string(),
                commands: vec![
                    "git checkout HEAD~1".to_string(),
                    "chown -R {{web_user}}:{{web_user}} {{site_dir}}".to_string(),
                    "systemctl reload nginx".to_string(),
                ],
                working_dir: Some("{{site_dir}}".to_string()),
                env: HashMap::new(),
                condition: None,
                on_error: OnError::Abort,
                timeout: Some(300),
            }],
            tags: vec!["static".to_string(), "nginx".to_string(), "web".to_string()],
            is_template: true,
            created_at: now,
            updated_at: now,
        }
    }

    /// Database migration template
    /// Requirements: 3.1
    fn database_migration_template() -> DeploymentScript {
        let now = Utc::now();
        DeploymentScript {
            id: "template-database-migration".to_string(),
            name: "Database Migration".to_string(),
            description: "Run database migrations with backup and rollback support".to_string(),
            variables: vec![
                Variable {
                    name: "db_name".to_string(),
                    description: "Database name".to_string(),
                    default_value: None,
                    required: true,
                    var_type: VariableType::String,
                },
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
                    default_value: Some("localhost".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "backup_dir".to_string(),
                    description: "Backup directory".to_string(),
                    default_value: Some("/var/backups/db".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "migration_dir".to_string(),
                    description: "Directory containing migration files".to_string(),
                    default_value: Some("/opt/migrations".to_string()),
                    required: true,
                    var_type: VariableType::String,
                },
            ],
            steps: vec![
                Step {
                    id: "step-1".to_string(),
                    name: "Create backup directory".to_string(),
                    commands: vec![
                        "mkdir -p {{backup_dir}}".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(30),
                },
                Step {
                    id: "step-2".to_string(),
                    name: "Backup database".to_string(),
                    commands: vec![
                        "mysqldump -h {{db_host}} -u {{db_user}} -p{{db_password}} {{db_name}} > {{backup_dir}}/{{db_name}}_{{timestamp}}.sql".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(600),
                },
                Step {
                    id: "step-3".to_string(),
                    name: "Run migrations".to_string(),
                    commands: vec![
                        "for f in {{migration_dir}}/*.sql; do mysql -h {{db_host}} -u {{db_user}} -p{{db_password}} {{db_name}} < \"$f\"; done".to_string(),
                    ],
                    working_dir: Some("{{migration_dir}}".to_string()),
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(600),
                },
                Step {
                    id: "step-4".to_string(),
                    name: "Verify database".to_string(),
                    commands: vec![
                        "mysql -h {{db_host}} -u {{db_user}} -p{{db_password}} {{db_name}} -e 'SELECT 1'".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(30),
                },
                Step {
                    id: "step-5".to_string(),
                    name: "Cleanup old backups".to_string(),
                    commands: vec![
                        "find {{backup_dir}} -name '*.sql' -mtime +7 -delete".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(60),
                },
            ],
            rollback_steps: vec![
                Step {
                    id: "rollback-1".to_string(),
                    name: "Restore from backup".to_string(),
                    commands: vec![
                        "LATEST_BACKUP=$(ls -t {{backup_dir}}/{{db_name}}_*.sql | head -1)".to_string(),
                        "mysql -h {{db_host}} -u {{db_user}} -p{{db_password}} {{db_name}} < \"$LATEST_BACKUP\"".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(600),
                },
            ],
            tags: vec!["database".to_string(), "migration".to_string(), "mysql".to_string()],
            is_template: true,
            created_at: now,
            updated_at: now,
        }
    }

    /// SSL certificate setup template
    /// Requirements: 3.1
    fn ssl_setup_template() -> DeploymentScript {
        let now = Utc::now();
        DeploymentScript {
            id: "template-ssl-setup".to_string(),
            name: "SSL Certificate Setup".to_string(),
            description: "Setup SSL certificate using Let's Encrypt with Certbot".to_string(),
            variables: vec![
                Variable {
                    name: "domain".to_string(),
                    description: "Domain name for SSL certificate".to_string(),
                    default_value: None,
                    required: true,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "email".to_string(),
                    description: "Email for Let's Encrypt notifications".to_string(),
                    default_value: None,
                    required: true,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "webroot".to_string(),
                    description: "Webroot directory for domain verification".to_string(),
                    default_value: Some("/var/www/html".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "web_server".to_string(),
                    description: "Web server type (nginx or apache)".to_string(),
                    default_value: Some("nginx".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
            ],
            steps: vec![
                Step {
                    id: "step-1".to_string(),
                    name: "Install Certbot".to_string(),
                    commands: vec![
                        "sudo apt-get update".to_string(),
                        "sudo apt-get install -y certbot python3-certbot-{{web_server}}".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(300),
                },
                Step {
                    id: "step-2".to_string(),
                    name: "Obtain SSL certificate".to_string(),
                    commands: vec![
                        "sudo certbot --{{web_server}} -d {{domain}} --non-interactive --agree-tos -m {{email}} --redirect".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(300),
                },
                Step {
                    id: "step-3".to_string(),
                    name: "Setup auto-renewal".to_string(),
                    commands: vec![
                        "sudo systemctl enable certbot.timer".to_string(),
                        "sudo systemctl start certbot.timer".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(60),
                },
                Step {
                    id: "step-4".to_string(),
                    name: "Test renewal".to_string(),
                    commands: vec![
                        "sudo certbot renew --dry-run".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(120),
                },
                Step {
                    id: "step-5".to_string(),
                    name: "Reload web server".to_string(),
                    commands: vec![
                        "sudo systemctl reload {{web_server}}".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(60),
                },
            ],
            rollback_steps: vec![
                Step {
                    id: "rollback-1".to_string(),
                    name: "Revoke certificate".to_string(),
                    commands: vec![
                        "sudo certbot revoke --cert-name {{domain}} --non-interactive || true".to_string(),
                        "sudo certbot delete --cert-name {{domain}} --non-interactive || true".to_string(),
                        "sudo systemctl reload {{web_server}}".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(120),
                },
            ],
            tags: vec!["ssl".to_string(), "security".to_string(), "letsencrypt".to_string(), "certbot".to_string()],
            is_template: true,
            created_at: now,
            updated_at: now,
        }
    }

    /// Firewall configuration template
    /// Requirements: 3.1
    fn firewall_config_template() -> DeploymentScript {
        let now = Utc::now();
        DeploymentScript {
            id: "template-firewall-config".to_string(),
            name: "Firewall Configuration".to_string(),
            description: "Configure UFW firewall with common rules".to_string(),
            variables: vec![
                Variable {
                    name: "ssh_port".to_string(),
                    description: "SSH port number".to_string(),
                    default_value: Some("22".to_string()),
                    required: false,
                    var_type: VariableType::Number,
                },
                Variable {
                    name: "http_enabled".to_string(),
                    description: "Enable HTTP (port 80)".to_string(),
                    default_value: Some("true".to_string()),
                    required: false,
                    var_type: VariableType::Boolean,
                },
                Variable {
                    name: "https_enabled".to_string(),
                    description: "Enable HTTPS (port 443)".to_string(),
                    default_value: Some("true".to_string()),
                    required: false,
                    var_type: VariableType::Boolean,
                },
                Variable {
                    name: "additional_ports".to_string(),
                    description: "Additional ports to allow (comma-separated)".to_string(),
                    default_value: None,
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "allowed_ips".to_string(),
                    description: "IP addresses to allow for SSH (comma-separated, empty for any)".to_string(),
                    default_value: None,
                    required: false,
                    var_type: VariableType::String,
                },
            ],
            steps: vec![
                Step {
                    id: "step-1".to_string(),
                    name: "Install UFW".to_string(),
                    commands: vec![
                        "sudo apt-get update".to_string(),
                        "sudo apt-get install -y ufw".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(120),
                },
                Step {
                    id: "step-2".to_string(),
                    name: "Reset UFW to defaults".to_string(),
                    commands: vec![
                        "sudo ufw --force reset".to_string(),
                        "sudo ufw default deny incoming".to_string(),
                        "sudo ufw default allow outgoing".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(60),
                },
                Step {
                    id: "step-3".to_string(),
                    name: "Allow SSH".to_string(),
                    commands: vec![
                        "sudo ufw allow {{ssh_port}}/tcp comment 'SSH'".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(30),
                },
                Step {
                    id: "step-4".to_string(),
                    name: "Allow HTTP".to_string(),
                    commands: vec![
                        "sudo ufw allow 80/tcp comment 'HTTP'".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: Some("test \"{{http_enabled}}\" = \"true\"".to_string()),
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
                Step {
                    id: "step-5".to_string(),
                    name: "Allow HTTPS".to_string(),
                    commands: vec![
                        "sudo ufw allow 443/tcp comment 'HTTPS'".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: Some("test \"{{https_enabled}}\" = \"true\"".to_string()),
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
                Step {
                    id: "step-6".to_string(),
                    name: "Allow additional ports".to_string(),
                    commands: vec![
                        "for port in $(echo '{{additional_ports}}' | tr ',' ' '); do sudo ufw allow $port; done".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: Some("test -n \"{{additional_ports}}\"".to_string()),
                    on_error: OnError::Continue,
                    timeout: Some(60),
                },
                Step {
                    id: "step-7".to_string(),
                    name: "Enable UFW".to_string(),
                    commands: vec![
                        "sudo ufw --force enable".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(30),
                },
                Step {
                    id: "step-8".to_string(),
                    name: "Show status".to_string(),
                    commands: vec![
                        "sudo ufw status verbose".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
            ],
            rollback_steps: vec![
                Step {
                    id: "rollback-1".to_string(),
                    name: "Disable UFW".to_string(),
                    commands: vec![
                        "sudo ufw --force disable".to_string(),
                        "sudo ufw --force reset".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(60),
                },
            ],
            tags: vec!["firewall".to_string(), "security".to_string(), "ufw".to_string()],
            is_template: true,
            created_at: now,
            updated_at: now,
        }
    }

    /// Install Nginx template
    fn nginx_install_template() -> DeploymentScript {
        let now = Utc::now();
        DeploymentScript {
            id: "template-nginx-install".to_string(),
            name: "Install Nginx".to_string(),
            description: "Install and configure Nginx web server on Ubuntu/Debian".to_string(),
            variables: vec![
                Variable {
                    name: "worker_processes".to_string(),
                    description: "Number of worker processes (auto for automatic)".to_string(),
                    default_value: Some("auto".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "worker_connections".to_string(),
                    description: "Max connections per worker".to_string(),
                    default_value: Some("1024".to_string()),
                    required: false,
                    var_type: VariableType::Number,
                },
                Variable {
                    name: "client_max_body_size".to_string(),
                    description: "Max upload size".to_string(),
                    default_value: Some("64M".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
            ],
            steps: vec![
                Step {
                    id: "step-1".to_string(),
                    name: "Update package list".to_string(),
                    commands: vec![
                        "sudo apt-get update".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::from([("DEBIAN_FRONTEND".to_string(), "noninteractive".to_string())]),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(300),
                },
                Step {
                    id: "step-2".to_string(),
                    name: "Install Nginx".to_string(),
                    commands: vec![
                        "sudo apt-get install -y nginx".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::from([("DEBIAN_FRONTEND".to_string(), "noninteractive".to_string())]),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(300),
                },
                Step {
                    id: "step-3".to_string(),
                    name: "Backup default config".to_string(),
                    commands: vec![
                        "sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
                Step {
                    id: "step-4".to_string(),
                    name: "Configure Nginx".to_string(),
                    commands: vec![
                        "sudo sed -i 's/worker_processes.*/worker_processes {{worker_processes}};/' /etc/nginx/nginx.conf".to_string(),
                        "sudo sed -i 's/worker_connections.*/worker_connections {{worker_connections}};/' /etc/nginx/nginx.conf".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(60),
                },
                Step {
                    id: "step-5".to_string(),
                    name: "Set client_max_body_size".to_string(),
                    commands: vec![
                        "sudo grep -q 'client_max_body_size' /etc/nginx/nginx.conf || sudo sed -i '/http {/a\\    client_max_body_size {{client_max_body_size}};' /etc/nginx/nginx.conf".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
                Step {
                    id: "step-6".to_string(),
                    name: "Test Nginx config".to_string(),
                    commands: vec![
                        "sudo nginx -t".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(30),
                },
                Step {
                    id: "step-7".to_string(),
                    name: "Enable and start Nginx".to_string(),
                    commands: vec![
                        "sudo systemctl enable nginx".to_string(),
                        "sudo systemctl restart nginx".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(60),
                },
                Step {
                    id: "step-8".to_string(),
                    name: "Verify Nginx status".to_string(),
                    commands: vec![
                        "systemctl status nginx --no-pager".to_string(),
                        "nginx -v".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
            ],
            rollback_steps: vec![
                Step {
                    id: "rollback-1".to_string(),
                    name: "Restore config and restart".to_string(),
                    commands: vec![
                        "cp /etc/nginx/nginx.conf.backup /etc/nginx/nginx.conf".to_string(),
                        "systemctl restart nginx".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(60),
                },
            ],
            tags: vec!["nginx".to_string(), "webserver".to_string(), "install".to_string()],
            is_template: true,
            created_at: now,
            updated_at: now,
        }
    }

    /// Nginx Virtual Host template
    fn nginx_vhost_template() -> DeploymentScript {
        let now = Utc::now();
        DeploymentScript {
            id: "template-nginx-vhost".to_string(),
            name: "Nginx Virtual Host".to_string(),
            description: "Create Nginx virtual host configuration for a domain".to_string(),
            variables: vec![
                Variable {
                    name: "domain".to_string(),
                    description: "Domain name (e.g., example.com)".to_string(),
                    default_value: None,
                    required: true,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "root_path".to_string(),
                    description: "Document root path".to_string(),
                    default_value: Some("/var/www/html".to_string()),
                    required: true,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "php_enabled".to_string(),
                    description: "Enable PHP-FPM support".to_string(),
                    default_value: Some("false".to_string()),
                    required: false,
                    var_type: VariableType::Boolean,
                },
                Variable {
                    name: "php_version".to_string(),
                    description: "PHP version (e.g., 8.2)".to_string(),
                    default_value: Some("8.2".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "proxy_pass".to_string(),
                    description: "Proxy pass URL (leave empty for static)".to_string(),
                    default_value: None,
                    required: false,
                    var_type: VariableType::String,
                },
            ],
            steps: vec![
                Step {
                    id: "step-1".to_string(),
                    name: "Create document root".to_string(),
                    commands: vec![
                        "mkdir -p {{root_path}}".to_string(),
                        "chown -R www-data:www-data {{root_path}}".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(60),
                },
                Step {
                    id: "step-2".to_string(),
                    name: "Create virtual host config".to_string(),
                    commands: vec![
                        r#"cat > /etc/nginx/sites-available/{{domain}} << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name {{domain}} www.{{domain}};
    root {{root_path}};
    index index.html index.htm index.php;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ /\.ht {
        deny all;
    }

    access_log /var/log/nginx/{{domain}}.access.log;
    error_log /var/log/nginx/{{domain}}.error.log;
}
EOF"#.to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(60),
                },
                Step {
                    id: "step-3".to_string(),
                    name: "Add PHP-FPM config".to_string(),
                    commands: vec![
                        r#"sed -i '/location \/ {/a\    location ~ \\.php$ {\n        fastcgi_pass unix:/var/run/php/php{{php_version}}-fpm.sock;\n        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;\n        include fastcgi_params;\n    }' /etc/nginx/sites-available/{{domain}}"#.to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: Some("test \"{{php_enabled}}\" = \"true\"".to_string()),
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
                Step {
                    id: "step-4".to_string(),
                    name: "Enable site".to_string(),
                    commands: vec![
                        "ln -sf /etc/nginx/sites-available/{{domain}} /etc/nginx/sites-enabled/".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(30),
                },
                Step {
                    id: "step-5".to_string(),
                    name: "Test and reload Nginx".to_string(),
                    commands: vec![
                        "nginx -t".to_string(),
                        "systemctl reload nginx".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(60),
                },
            ],
            rollback_steps: vec![
                Step {
                    id: "rollback-1".to_string(),
                    name: "Remove virtual host".to_string(),
                    commands: vec![
                        "rm -f /etc/nginx/sites-enabled/{{domain}}".to_string(),
                        "rm -f /etc/nginx/sites-available/{{domain}}".to_string(),
                        "systemctl reload nginx".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(60),
                },
            ],
            tags: vec!["nginx".to_string(), "vhost".to_string(), "domain".to_string()],
            is_template: true,
            created_at: now,
            updated_at: now,
        }
    }

    /// Install MySQL template
    fn mysql_install_template() -> DeploymentScript {
        let now = Utc::now();
        DeploymentScript {
            id: "template-mysql-install".to_string(),
            name: "Install MySQL".to_string(),
            description: "Install and secure MySQL server on Ubuntu/Debian".to_string(),
            variables: vec![
                Variable {
                    name: "root_password".to_string(),
                    description: "MySQL root password".to_string(),
                    default_value: None,
                    required: true,
                    var_type: VariableType::Secret,
                },
                Variable {
                    name: "bind_address".to_string(),
                    description: "Bind address (127.0.0.1 for local only)".to_string(),
                    default_value: Some("127.0.0.1".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "max_connections".to_string(),
                    description: "Maximum connections".to_string(),
                    default_value: Some("150".to_string()),
                    required: false,
                    var_type: VariableType::Number,
                },
            ],
            steps: vec![
                Step {
                    id: "step-1".to_string(),
                    name: "Update package list".to_string(),
                    commands: vec![
                        "sudo apt-get update".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::from([("DEBIAN_FRONTEND".to_string(), "noninteractive".to_string())]),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(300),
                },
                Step {
                    id: "step-2".to_string(),
                    name: "Install MySQL Server".to_string(),
                    commands: vec![
                        "sudo apt-get install -y mysql-server".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::from([("DEBIAN_FRONTEND".to_string(), "noninteractive".to_string())]),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(600),
                },
                Step {
                    id: "step-3".to_string(),
                    name: "Start MySQL service".to_string(),
                    commands: vec![
                        "sudo systemctl start mysql".to_string(),
                        "sudo systemctl enable mysql".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(60),
                },
                Step {
                    id: "step-4".to_string(),
                    name: "Set root password".to_string(),
                    commands: vec![
                        "sudo mysql -e \"ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '{{root_password}}';\"".to_string(),
                        "sudo mysql -e \"FLUSH PRIVILEGES;\"".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(60),
                },
                Step {
                    id: "step-5".to_string(),
                    name: "Secure MySQL installation".to_string(),
                    commands: vec![
                        "sudo mysql -u root -p{{root_password}} -e \"DELETE FROM mysql.user WHERE User='';\"".to_string(),
                        "sudo mysql -u root -p{{root_password}} -e \"DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');\"".to_string(),
                        "sudo mysql -u root -p{{root_password}} -e \"DROP DATABASE IF EXISTS test;\"".to_string(),
                        "sudo mysql -u root -p{{root_password}} -e \"DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';\"".to_string(),
                        "sudo mysql -u root -p{{root_password}} -e \"FLUSH PRIVILEGES;\"".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(120),
                },
                Step {
                    id: "step-6".to_string(),
                    name: "Configure MySQL".to_string(),
                    commands: vec![
                        "sudo sed -i 's/bind-address.*/bind-address = {{bind_address}}/' /etc/mysql/mysql.conf.d/mysqld.cnf".to_string(),
                        "echo 'max_connections = {{max_connections}}' | sudo tee -a /etc/mysql/mysql.conf.d/mysqld.cnf".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(60),
                },
                Step {
                    id: "step-7".to_string(),
                    name: "Restart MySQL".to_string(),
                    commands: vec![
                        "sudo systemctl restart mysql".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(60),
                },
                Step {
                    id: "step-8".to_string(),
                    name: "Verify MySQL".to_string(),
                    commands: vec![
                        "sudo systemctl status mysql --no-pager".to_string(),
                        "sudo mysql -u root -p{{root_password}} -e \"SELECT VERSION();\"".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
            ],
            rollback_steps: vec![],
            tags: vec!["mysql".to_string(), "database".to_string(), "install".to_string()],
            is_template: true,
            created_at: now,
            updated_at: now,
        }
    }

    /// MySQL Create Database template
    fn mysql_database_template() -> DeploymentScript {
        let now = Utc::now();
        DeploymentScript {
            id: "template-mysql-database".to_string(),
            name: "MySQL Create Database".to_string(),
            description: "Create MySQL database and user with privileges".to_string(),
            variables: vec![
                Variable {
                    name: "root_password".to_string(),
                    description: "MySQL root password".to_string(),
                    default_value: None,
                    required: true,
                    var_type: VariableType::Secret,
                },
                Variable {
                    name: "db_name".to_string(),
                    description: "Database name".to_string(),
                    default_value: None,
                    required: true,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "db_user".to_string(),
                    description: "Database user".to_string(),
                    default_value: None,
                    required: true,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "db_password".to_string(),
                    description: "Database user password".to_string(),
                    default_value: None,
                    required: true,
                    var_type: VariableType::Secret,
                },
                Variable {
                    name: "db_host".to_string(),
                    description: "Allowed host for user".to_string(),
                    default_value: Some("localhost".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "charset".to_string(),
                    description: "Database charset".to_string(),
                    default_value: Some("utf8mb4".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
            ],
            steps: vec![
                Step {
                    id: "step-1".to_string(),
                    name: "Create database".to_string(),
                    commands: vec![
                        "mysql -u root -p{{root_password}} -e \"CREATE DATABASE IF NOT EXISTS {{db_name}} CHARACTER SET {{charset}} COLLATE {{charset}}_unicode_ci;\"".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(60),
                },
                Step {
                    id: "step-2".to_string(),
                    name: "Create user".to_string(),
                    commands: vec![
                        "mysql -u root -p{{root_password}} -e \"CREATE USER IF NOT EXISTS '{{db_user}}'@'{{db_host}}' IDENTIFIED BY '{{db_password}}';\"".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(60),
                },
                Step {
                    id: "step-3".to_string(),
                    name: "Grant privileges".to_string(),
                    commands: vec![
                        "mysql -u root -p{{root_password}} -e \"GRANT ALL PRIVILEGES ON {{db_name}}.* TO '{{db_user}}'@'{{db_host}}';\"".to_string(),
                        "mysql -u root -p{{root_password}} -e \"FLUSH PRIVILEGES;\"".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(60),
                },
                Step {
                    id: "step-4".to_string(),
                    name: "Verify database".to_string(),
                    commands: vec![
                        "mysql -u {{db_user}} -p{{db_password}} -e \"SHOW DATABASES;\" | grep {{db_name}}".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
            ],
            rollback_steps: vec![
                Step {
                    id: "rollback-1".to_string(),
                    name: "Drop database and user".to_string(),
                    commands: vec![
                        "mysql -u root -p{{root_password}} -e \"DROP DATABASE IF EXISTS {{db_name}};\"".to_string(),
                        "mysql -u root -p{{root_password}} -e \"DROP USER IF EXISTS '{{db_user}}'@'{{db_host}}';\"".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(60),
                },
            ],
            tags: vec!["mysql".to_string(), "database".to_string(), "create".to_string()],
            is_template: true,
            created_at: now,
            updated_at: now,
        }
    }

    /// Install Redis template
    fn redis_install_template() -> DeploymentScript {
        let now = Utc::now();
        DeploymentScript {
            id: "template-redis-install".to_string(),
            name: "Install Redis".to_string(),
            description: "Install and configure Redis server on Ubuntu/Debian".to_string(),
            variables: vec![
                Variable {
                    name: "redis_password".to_string(),
                    description: "Redis password (leave empty for no auth)".to_string(),
                    default_value: Some("".to_string()),
                    required: false,
                    var_type: VariableType::Secret,
                },
                Variable {
                    name: "bind_address".to_string(),
                    description: "Bind address".to_string(),
                    default_value: Some("127.0.0.1".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "port".to_string(),
                    description: "Redis port".to_string(),
                    default_value: Some("6379".to_string()),
                    required: false,
                    var_type: VariableType::Number,
                },
                Variable {
                    name: "maxmemory".to_string(),
                    description: "Max memory (e.g., 256mb)".to_string(),
                    default_value: Some("256mb".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
            ],
            steps: vec![
                Step {
                    id: "step-1".to_string(),
                    name: "Update package list".to_string(),
                    commands: vec![
                        "sudo apt-get update".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::from([("DEBIAN_FRONTEND".to_string(), "noninteractive".to_string())]),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(300),
                },
                Step {
                    id: "step-2".to_string(),
                    name: "Install Redis".to_string(),
                    commands: vec![
                        "sudo apt-get install -y redis-server".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::from([("DEBIAN_FRONTEND".to_string(), "noninteractive".to_string())]),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(300),
                },
                Step {
                    id: "step-3".to_string(),
                    name: "Backup config".to_string(),
                    commands: vec![
                        "sudo cp /etc/redis/redis.conf /etc/redis/redis.conf.backup".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
                Step {
                    id: "step-4".to_string(),
                    name: "Configure Redis".to_string(),
                    commands: vec![
                        "sudo sed -i 's/^bind .*/bind {{bind_address}}/' /etc/redis/redis.conf".to_string(),
                        "sudo sed -i 's/^port .*/port {{port}}/' /etc/redis/redis.conf".to_string(),
                        "sudo sed -i 's/^# maxmemory .*/maxmemory {{maxmemory}}/' /etc/redis/redis.conf".to_string(),
                        "sudo sed -i 's/^maxmemory-policy .*/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(60),
                },
                Step {
                    id: "step-5".to_string(),
                    name: "Set Redis password".to_string(),
                    commands: vec![
                        "sudo sed -i 's/^# requirepass .*/requirepass {{redis_password}}/' /etc/redis/redis.conf".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: Some("test -n \"{{redis_password}}\"".to_string()),
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
                Step {
                    id: "step-6".to_string(),
                    name: "Enable supervised systemd".to_string(),
                    commands: vec![
                        "sudo sed -i 's/^supervised .*/supervised systemd/' /etc/redis/redis.conf".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
                Step {
                    id: "step-7".to_string(),
                    name: "Restart Redis".to_string(),
                    commands: vec![
                        "sudo systemctl restart redis-server".to_string(),
                        "sudo systemctl enable redis-server".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(60),
                },
                Step {
                    id: "step-8".to_string(),
                    name: "Verify Redis".to_string(),
                    commands: vec![
                        "sudo systemctl status redis-server --no-pager".to_string(),
                        "redis-cli ping".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
            ],
            rollback_steps: vec![
                Step {
                    id: "rollback-1".to_string(),
                    name: "Restore config".to_string(),
                    commands: vec![
                        "sudo cp /etc/redis/redis.conf.backup /etc/redis/redis.conf".to_string(),
                        "systemctl restart redis-server".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(60),
                },
            ],
            tags: vec!["redis".to_string(), "cache".to_string(), "install".to_string()],
            is_template: true,
            created_at: now,
            updated_at: now,
        }
    }

    /// Redis Configuration template
    fn redis_config_template() -> DeploymentScript {
        let now = Utc::now();
        DeploymentScript {
            id: "template-redis-config".to_string(),
            name: "Redis Configuration".to_string(),
            description: "Configure Redis settings and persistence".to_string(),
            variables: vec![
                Variable {
                    name: "maxmemory".to_string(),
                    description: "Max memory limit".to_string(),
                    default_value: Some("512mb".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "maxmemory_policy".to_string(),
                    description: "Eviction policy".to_string(),
                    default_value: Some("allkeys-lru".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "appendonly".to_string(),
                    description: "Enable AOF persistence".to_string(),
                    default_value: Some("yes".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "save_intervals".to_string(),
                    description: "RDB save intervals (e.g., 900 1 300 10)".to_string(),
                    default_value: Some("900 1 300 10 60 10000".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
            ],
            steps: vec![
                Step {
                    id: "step-1".to_string(),
                    name: "Backup current config".to_string(),
                    commands: vec![
                        "cp /etc/redis/redis.conf /etc/redis/redis.conf.$(date +%Y%m%d_%H%M%S)".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
                Step {
                    id: "step-2".to_string(),
                    name: "Configure memory settings".to_string(),
                    commands: vec![
                        "sed -i 's/^maxmemory .*/maxmemory {{maxmemory}}/' /etc/redis/redis.conf".to_string(),
                        "sed -i 's/^maxmemory-policy .*/maxmemory-policy {{maxmemory_policy}}/' /etc/redis/redis.conf".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(60),
                },
                Step {
                    id: "step-3".to_string(),
                    name: "Configure persistence".to_string(),
                    commands: vec![
                        "sed -i 's/^appendonly .*/appendonly {{appendonly}}/' /etc/redis/redis.conf".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
                Step {
                    id: "step-4".to_string(),
                    name: "Test config".to_string(),
                    commands: vec![
                        "redis-server --test-memory 1".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
                Step {
                    id: "step-5".to_string(),
                    name: "Restart Redis".to_string(),
                    commands: vec![
                        "systemctl restart redis-server".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Rollback,
                    timeout: Some(60),
                },
                Step {
                    id: "step-6".to_string(),
                    name: "Verify configuration".to_string(),
                    commands: vec![
                        "redis-cli CONFIG GET maxmemory".to_string(),
                        "redis-cli CONFIG GET maxmemory-policy".to_string(),
                        "redis-cli INFO memory | head -10".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
            ],
            rollback_steps: vec![],
            tags: vec!["redis".to_string(), "config".to_string(), "cache".to_string()],
            is_template: true,
            created_at: now,
            updated_at: now,
        }
    }

    /// Install Clawdbot template
    fn clawdbot_install_template() -> DeploymentScript {
        let now = Utc::now();
        DeploymentScript {
            id: "template-clawdbot-install".to_string(),
            name: "Install Clawdbot".to_string(),
            description: "Install Clawdbot setup and dependencies".to_string(),
            variables: vec![],
            steps: vec![
                Step {
                    id: "step-1".to_string(),
                    name: "Update package list".to_string(),
                    commands: vec!["sudo apt-get update".to_string()],
                    working_dir: None,
                    env: HashMap::from([(
                        "DEBIAN_FRONTEND".to_string(),
                        "noninteractive".to_string(),
                    )]),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(300),
                },
                Step {
                    id: "step-2".to_string(),
                    name: "Install dependencies".to_string(),
                    commands: vec![
                        "sudo apt-get install -y git curl jq ca-certificates openssl".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::from([(
                        "DEBIAN_FRONTEND".to_string(),
                        "noninteractive".to_string(),
                    )]),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(300),
                },
                Step {
                    id: "step-3".to_string(),
                    name: "Setup Node.js repository".to_string(),
                    commands: vec![
                        "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
                            .to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(300),
                },
                Step {
                    id: "step-4".to_string(),
                    name: "Install Node.js".to_string(),
                    commands: vec!["sudo apt-get install -y nodejs".to_string()],
                    working_dir: None,
                    env: HashMap::from([(
                        "DEBIAN_FRONTEND".to_string(),
                        "noninteractive".to_string(),
                    )]),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(600),
                },
                Step {
                    id: "step-5".to_string(),
                    name: "Install build tools".to_string(),
                    commands: vec!["sudo apt-get install -y build-essential python3".to_string()],
                    working_dir: None,
                    env: HashMap::from([(
                        "DEBIAN_FRONTEND".to_string(),
                        "noninteractive".to_string(),
                    )]),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(600),
                },
                Step {
                    id: "step-6".to_string(),
                    name: "Install Clawdbot".to_string(),
                    commands: vec!["npm i -g clawdbot@latest".to_string()],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(600),
                },
                Step {
                    id: "step-7".to_string(),
                    name: "Final update".to_string(),
                    commands: vec!["sudo apt-get update".to_string()],
                    working_dir: None,
                    env: HashMap::from([(
                        "DEBIAN_FRONTEND".to_string(),
                        "noninteractive".to_string(),
                    )]),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(300),
                },
            ],
            rollback_steps: vec![],
            tags: vec![
                "clawdbot".to_string(),
                "install".to_string(),
                "nodejs".to_string(),
            ],
            is_template: true,
            created_at: now,
            updated_at: now,
        }
    }

    /// System Swap Configuration template
    fn sys_swap_template() -> DeploymentScript {
        let now = Utc::now();
        DeploymentScript {
            id: "template-sys-swap".to_string(),
            name: "System Swap".to_string(),
            description: "Create and configure swap memory".to_string(),
            variables: vec![
                Variable {
                    name: "swap_size".to_string(),
                    description: "Swap size (e.g., 4G)".to_string(),
                    default_value: Some("4G".to_string()),
                    required: true,
                    var_type: VariableType::String,
                },
                Variable {
                    name: "swappiness".to_string(),
                    description: "Swappiness value (0-100)".to_string(),
                    default_value: Some("10".to_string()),
                    required: false,
                    var_type: VariableType::String,
                },
            ],
            steps: vec![
                Step {
                    id: "step-1".to_string(),
                    name: "Create swap file".to_string(),
                    commands: vec![
                        "sudo fallocate -l {{swap_size}} /swapfile".to_string(),
                        "sudo chmod 600 /swapfile".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(60),
                },
                Step {
                    id: "step-2".to_string(),
                    name: "Enable swap".to_string(),
                    commands: vec![
                        "sudo mkswap /swapfile".to_string(),
                        "sudo swapon /swapfile".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(60),
                },
                Step {
                    id: "step-3".to_string(),
                    name: "Persist swap settings".to_string(),
                    commands: vec![
                        "grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
                Step {
                    id: "step-4".to_string(),
                    name: "Configure swappiness".to_string(),
                    commands: vec![
                        "sudo sysctl vm.swappiness={{swappiness}}".to_string(),
                        "grep -q 'vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness={{swappiness}}' | sudo tee -a /etc/sysctl.conf".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
                Step {
                    id: "step-5".to_string(),
                    name: "Verify swap".to_string(),
                    commands: vec![
                        "free -h".to_string(),
                        "swapon --show".to_string(),
                        "cat /proc/sys/vm/swappiness".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Continue,
                    timeout: Some(30),
                },
            ],
            rollback_steps: vec![
                Step {
                    id: "rollback-1".to_string(),
                    name: "Disable and remove swap".to_string(),
                    commands: vec![
                        "sudo swapoff /swapfile".to_string(),
                        "sudo rm -f /swapfile".to_string(),
                        "sudo sed -i '/\\/swapfile/d' /etc/fstab".to_string(),
                    ],
                    working_dir: None,
                    env: HashMap::new(),
                    condition: None,
                    on_error: OnError::Abort,
                    timeout: Some(60),
                },
            ],
            tags: vec!["system".to_string(), "swap".to_string(), "memory".to_string()],
            is_template: true,
            created_at: now,
            updated_at: now,
        }
    }
}

impl Default for TemplateLibrary {
    fn default() -> Self {
        Self::new()
    }
}
