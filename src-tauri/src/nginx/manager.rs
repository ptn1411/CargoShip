use super::models::*;
use super::templates::{generate_config, get_config_snippets};
use crate::server::{Server, ServerManager};
use crate::ssh::SshClient;
use crate::error::AppError;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

pub struct NginxManager {
    ssh_client: Arc<SshClient>,
    server_manager: Arc<Mutex<ServerManager>>,
}

impl NginxManager {
    pub fn new(
        ssh_client: Arc<SshClient>,
        server_manager: Arc<Mutex<ServerManager>>,
    ) -> Self {
        Self {
            ssh_client,
            server_manager,
        }
    }

    /// Get Nginx status on a server
    pub async fn get_status(&self, server_id: &str) -> Result<NginxStatus, AppError> {
        let server = self.get_server(server_id).await?;

        // Check if nginx is running
        let running_cmd = "systemctl is-active nginx 2>/dev/null || service nginx status 2>/dev/null | grep -q running && echo active";
        let running_output = self.ssh_client.execute_command(&server, running_cmd, Some(10))?;
        let running = running_output.stdout.trim() == "active";

        // Get nginx version
        let version_cmd = "nginx -v 2>&1 | head -1";
        let version_output = self.ssh_client.execute_command(&server, version_cmd, Some(10))?;
        let version = version_output.stderr.trim()
            .replace("nginx version: nginx/", "")
            .to_string();

        // Test config
        let test_cmd = "nginx -t 2>&1";
        let test_output = self.ssh_client.execute_command(&server, test_cmd, Some(10))?;
        let config_test = test_output.exit_code == 0;
        let config_error = if !config_test {
            Some(test_output.stderr.clone())
        } else {
            None
        };

        // Count sites
        let enabled_cmd = "ls -1 /etc/nginx/sites-enabled/ 2>/dev/null | wc -l";
        let enabled_output = self.ssh_client.execute_command(&server, enabled_cmd, Some(10))?;
        let sites_enabled: u32 = enabled_output.stdout.trim().parse().unwrap_or(0);

        let available_cmd = "ls -1 /etc/nginx/sites-available/ 2>/dev/null | wc -l";
        let available_output = self.ssh_client.execute_command(&server, available_cmd, Some(10))?;
        let sites_available: u32 = available_output.stdout.trim().parse().unwrap_or(0);

        Ok(NginxStatus {
            running,
            version,
            config_test,
            config_error,
            sites_enabled,
            sites_available,
        })
    }

    /// List all domains/sites on a server
    pub async fn list_domains(&self, server_id: &str) -> Result<Vec<NginxDomain>, AppError> {
        let server = self.get_server(server_id).await?;
        let mut domains = Vec::new();

        // List sites-available
        let list_cmd = "ls -1 /etc/nginx/sites-available/ 2>/dev/null | grep -v default";
        let output = self.ssh_client.execute_command(&server, list_cmd, Some(10))?;

        for site_name in output.stdout.lines() {
            let site_name = site_name.trim();
            if site_name.is_empty() {
                continue;
            }

            // Check if enabled
            let enabled_cmd = format!("test -L /etc/nginx/sites-enabled/{} && echo yes || echo no", site_name);
            let enabled_output = self.ssh_client.execute_command(&server, &enabled_cmd, Some(5))?;
            let enabled = enabled_output.stdout.trim() == "yes";

            // Read config to extract info
            let config_path = format!("/etc/nginx/sites-available/{}", site_name);
            let read_cmd = format!("cat {}", config_path);
            let config_output = self.ssh_client.execute_command(&server, &read_cmd, Some(10))?;
            let config_content = config_output.stdout;

            // Parse config for domain info
            let domain_info = self.parse_nginx_config(&config_content, server_id, site_name, &config_path, enabled);
            domains.push(domain_info);
        }

        Ok(domains)
    }

    /// Create a new domain configuration
    pub async fn create_domain(&self, input: CreateDomainInput) -> Result<NginxDomain, AppError> {
        let server = self.get_server(&input.server_id).await?;
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp();

        let root_path = input.root_path.unwrap_or_else(|| format!("/var/www/{}", input.domain));
        let aliases = input.aliases.unwrap_or_default();
        let config_path = format!("/etc/nginx/sites-available/{}", input.domain);

        // Generate config
        let config = if let Some(custom) = &input.custom_config {
            custom.clone()
        } else {
            generate_config(
                &input.domain,
                &aliases,
                &root_path,
                &input.template_type,
                input.proxy_pass.as_deref(),
                false, // SSL will be added later via certbot
                None,
                None,
            )
        };

        // Create root directory
        let mkdir_cmd = format!("sudo mkdir -p {} && sudo chown -R www-data:www-data {}", root_path, root_path);
        self.ssh_client.execute_command(&server, &mkdir_cmd, Some(30))?;

        // Write config file
        let write_cmd = format!("echo '{}' | sudo tee {}", config.replace("'", "'\\''"), config_path);
        self.ssh_client.execute_command(&server, &write_cmd, Some(30))?;

        // Enable site
        let enable_cmd = format!("sudo ln -sf {} /etc/nginx/sites-enabled/{}", config_path, input.domain);
        self.ssh_client.execute_command(&server, &enable_cmd, Some(10))?;

        // Test and reload nginx
        self.reload_nginx(&server).await?;

        let domain = NginxDomain {
            id,
            server_id: input.server_id,
            domain: input.domain,
            aliases,
            root_path,
            config_path,
            enabled: true,
            ssl_enabled: false,
            ssl_certificate: None,
            ssl_certificate_key: None,
            proxy_pass: input.proxy_pass,
            template_type: input.template_type,
            custom_config: input.custom_config,
            created_at: now,
            updated_at: now,
        };

        Ok(domain)
    }

    /// Update domain configuration
    pub async fn update_domain(&self, server_id: &str, domain_name: &str, input: UpdateDomainInput) -> Result<NginxDomain, AppError> {
        let server = self.get_server(server_id).await?;
        let config_path = format!("/etc/nginx/sites-available/{}", domain_name);

        // Read current config
        let read_cmd = format!("cat {}", config_path);
        let current_config = self.ssh_client.execute_command(&server, &read_cmd, Some(10))?;
        
        // Parse current domain info
        let mut domain = self.parse_nginx_config(&current_config.stdout, server_id, domain_name, &config_path, true);

        // Apply updates
        if let Some(new_domain) = input.domain {
            domain.domain = new_domain;
        }
        if let Some(aliases) = input.aliases {
            domain.aliases = aliases;
        }
        if let Some(root_path) = input.root_path {
            domain.root_path = root_path;
        }
        if let Some(template_type) = input.template_type {
            domain.template_type = template_type;
        }
        if let Some(proxy_pass) = input.proxy_pass {
            domain.proxy_pass = Some(proxy_pass);
        }
        if let Some(custom_config) = input.custom_config {
            domain.custom_config = Some(custom_config.clone());
        }

        // Generate new config
        let new_config = if let Some(ref custom) = domain.custom_config {
            custom.clone()
        } else {
            generate_config(
                &domain.domain,
                &domain.aliases,
                &domain.root_path,
                &domain.template_type,
                domain.proxy_pass.as_deref(),
                domain.ssl_enabled,
                domain.ssl_certificate.as_deref(),
                domain.ssl_certificate_key.as_deref(),
            )
        };

        // Write new config
        let write_cmd = format!("echo '{}' | sudo tee {}", new_config.replace("'", "'\\''"), config_path);
        self.ssh_client.execute_command(&server, &write_cmd, Some(30))?;

        // Reload nginx
        self.reload_nginx(&server).await?;

        domain.updated_at = chrono::Utc::now().timestamp();
        Ok(domain)
    }

    /// Delete a domain configuration
    pub async fn delete_domain(&self, server_id: &str, domain_name: &str) -> Result<(), AppError> {
        let server = self.get_server(server_id).await?;

        // Disable site
        let disable_cmd = format!("sudo rm -f /etc/nginx/sites-enabled/{}", domain_name);
        self.ssh_client.execute_command(&server, &disable_cmd, Some(10))?;

        // Remove config
        let remove_cmd = format!("sudo rm -f /etc/nginx/sites-available/{}", domain_name);
        self.ssh_client.execute_command(&server, &remove_cmd, Some(10))?;

        // Reload nginx
        self.reload_nginx(&server).await?;

        Ok(())
    }

    /// Enable/disable a domain
    pub async fn toggle_domain(&self, server_id: &str, domain_name: &str, enable: bool) -> Result<(), AppError> {
        let server = self.get_server(server_id).await?;

        if enable {
            let cmd = format!(
                "sudo ln -sf /etc/nginx/sites-available/{} /etc/nginx/sites-enabled/{}",
                domain_name, domain_name
            );
            self.ssh_client.execute_command(&server, &cmd, Some(10))?;
        } else {
            let cmd = format!("sudo rm -f /etc/nginx/sites-enabled/{}", domain_name);
            self.ssh_client.execute_command(&server, &cmd, Some(10))?;
        }

        self.reload_nginx(&server).await?;
        Ok(())
    }

    /// Get domain config content
    pub async fn get_domain_config(&self, server_id: &str, domain_name: &str) -> Result<String, AppError> {
        let server = self.get_server(server_id).await?;
        let config_path = format!("/etc/nginx/sites-available/{}", domain_name);
        
        let cmd = format!("cat {}", config_path);
        let output = self.ssh_client.execute_command(&server, &cmd, Some(10))?;
        
        if output.exit_code != 0 {
            return Err(AppError::NotFound(format!("Config not found: {}", domain_name)));
        }

        Ok(output.stdout)
    }

    /// Save domain config content
    pub async fn save_domain_config(&self, server_id: &str, domain_name: &str, content: &str) -> Result<(), AppError> {
        let server = self.get_server(server_id).await?;
        let config_path = format!("/etc/nginx/sites-available/{}", domain_name);

        // Write config
        let write_cmd = format!("echo '{}' | sudo tee {}", content.replace("'", "'\\''"), config_path);
        self.ssh_client.execute_command(&server, &write_cmd, Some(30))?;

        // Test config
        let test_cmd = "sudo nginx -t";
        let test_output = self.ssh_client.execute_command(&server, test_cmd, Some(10))?;
        
        if test_output.exit_code != 0 {
            return Err(AppError::ValidationError(format!("Invalid nginx config: {}", test_output.stderr)));
        }

        // Reload nginx
        self.reload_nginx(&server).await?;

        Ok(())
    }

    /// Issue SSL certificate using Certbot
    pub async fn issue_ssl(&self, server_id: &str, domain_name: &str, email: &str) -> Result<SslResult, AppError> {
        let server = self.get_server(server_id).await?;

        // Check if certbot is installed
        let check_cmd = "which certbot || which /usr/bin/certbot";
        let check_output = self.ssh_client.execute_command(&server, check_cmd, Some(10))?;
        
        if check_output.exit_code != 0 {
            return Ok(SslResult {
                success: false,
                domain: domain_name.to_string(),
                message: "Certbot is not installed. Please install it first: sudo apt install certbot python3-certbot-nginx".to_string(),
                certificate_path: None,
                key_path: None,
            });
        }

        // Run certbot
        let certbot_cmd = format!(
            "sudo certbot --nginx -d {} --non-interactive --agree-tos --email {} --redirect",
            domain_name, email
        );
        let certbot_output = self.ssh_client.execute_command(&server, &certbot_cmd, Some(120))?;

        if certbot_output.exit_code != 0 {
            return Ok(SslResult {
                success: false,
                domain: domain_name.to_string(),
                message: format!("Certbot failed: {}", certbot_output.stderr),
                certificate_path: None,
                key_path: None,
            });
        }

        let cert_path = format!("/etc/letsencrypt/live/{}/fullchain.pem", domain_name);
        let key_path = format!("/etc/letsencrypt/live/{}/privkey.pem", domain_name);

        Ok(SslResult {
            success: true,
            domain: domain_name.to_string(),
            message: "SSL certificate issued successfully".to_string(),
            certificate_path: Some(cert_path),
            key_path: Some(key_path),
        })
    }

    /// Renew SSL certificates
    pub async fn renew_ssl(&self, server_id: &str) -> Result<String, AppError> {
        let server = self.get_server(server_id).await?;

        let cmd = "sudo certbot renew --dry-run";
        let output = self.ssh_client.execute_command(&server, cmd, Some(120))?;

        if output.exit_code != 0 {
            return Err(AppError::CommandFailed(format!("SSL renewal failed: {}", output.stderr)));
        }

        Ok(output.stdout)
    }

    /// List SSL certificates
    pub async fn list_ssl_certificates(&self, server_id: &str) -> Result<Vec<SslCertificate>, AppError> {
        let server = self.get_server(server_id).await?;
        let mut certificates = Vec::new();

        // List certbot certificates
        let cmd = "sudo certbot certificates 2>/dev/null";
        let output = self.ssh_client.execute_command(&server, cmd, Some(30))?;

        // Parse certbot output
        let mut current_cert: Option<SslCertificate> = None;
        
        for line in output.stdout.lines() {
            let line = line.trim();
            
            if line.starts_with("Certificate Name:") {
                if let Some(cert) = current_cert.take() {
                    certificates.push(cert);
                }
                let domain = line.replace("Certificate Name:", "").trim().to_string();
                current_cert = Some(SslCertificate {
                    domain,
                    issuer: "Let's Encrypt".to_string(),
                    valid_from: String::new(),
                    valid_until: String::new(),
                    days_remaining: 0,
                    auto_renew: true,
                });
            } else if let Some(ref mut cert) = current_cert {
                if line.starts_with("Expiry Date:") {
                    let parts: Vec<&str> = line.split("(").collect();
                    if parts.len() >= 1 {
                        cert.valid_until = parts[0].replace("Expiry Date:", "").trim().to_string();
                    }
                    // Extract days remaining
                    if let Some(days_part) = line.split("VALID:").nth(1) {
                        if let Some(days_str) = days_part.split(" ").next() {
                            cert.days_remaining = days_str.parse().unwrap_or(0);
                        }
                    }
                }
            }
        }

        if let Some(cert) = current_cert {
            certificates.push(cert);
        }

        Ok(certificates)
    }

    /// Get available config snippets
    pub fn get_snippets(&self) -> Vec<ConfigSnippet> {
        get_config_snippets()
    }

    /// Reload nginx
    async fn reload_nginx(&self, server: &Server) -> Result<(), AppError> {
        // Test config first
        let test_cmd = "sudo nginx -t";
        let test_output = self.ssh_client.execute_command(server, test_cmd, Some(10))?;
        
        if test_output.exit_code != 0 {
            return Err(AppError::ValidationError(format!("Nginx config test failed: {}", test_output.stderr)));
        }

        // Reload
        let reload_cmd = "sudo systemctl reload nginx || sudo service nginx reload";
        let reload_output = self.ssh_client.execute_command(server, reload_cmd, Some(10))?;
        
        if reload_output.exit_code != 0 {
            return Err(AppError::CommandFailed(format!("Failed to reload nginx: {}", reload_output.stderr)));
        }

        Ok(())
    }

    /// Restart nginx
    pub async fn restart_nginx(&self, server_id: &str) -> Result<(), AppError> {
        let server = self.get_server(server_id).await?;
        
        let cmd = "sudo systemctl restart nginx || sudo service nginx restart";
        let output = self.ssh_client.execute_command(&server, cmd, Some(30))?;
        
        if output.exit_code != 0 {
            return Err(AppError::CommandFailed(format!("Failed to restart nginx: {}", output.stderr)));
        }

        Ok(())
    }

    /// Start nginx
    pub async fn start_nginx(&self, server_id: &str) -> Result<(), AppError> {
        let server = self.get_server(server_id).await?;
        
        let cmd = "sudo systemctl start nginx || sudo service nginx start";
        let output = self.ssh_client.execute_command(&server, cmd, Some(30))?;
        
        if output.exit_code != 0 {
            return Err(AppError::CommandFailed(format!("Failed to start nginx: {}", output.stderr)));
        }

        Ok(())
    }

    /// Stop nginx
    pub async fn stop_nginx(&self, server_id: &str) -> Result<(), AppError> {
        let server = self.get_server(server_id).await?;
        
        let cmd = "sudo systemctl stop nginx || sudo service nginx stop";
        let output = self.ssh_client.execute_command(&server, cmd, Some(30))?;
        
        if output.exit_code != 0 {
            return Err(AppError::CommandFailed(format!("Failed to stop nginx: {}", output.stderr)));
        }

        Ok(())
    }

    /// Helper to get server by ID
    async fn get_server(&self, server_id: &str) -> Result<Server, AppError> {
        self.server_manager
            .lock()
            .await
            .get_server(server_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Server not found: {}", server_id)))
    }

    /// Parse nginx config to extract domain info
    fn parse_nginx_config(&self, config: &str, server_id: &str, site_name: &str, config_path: &str, enabled: bool) -> NginxDomain {
        let mut domain = site_name.to_string();
        let mut aliases = Vec::new();
        let mut root_path = format!("/var/www/{}", site_name);
        let mut ssl_enabled = false;
        let mut ssl_certificate = None;
        let mut ssl_certificate_key = None;
        let mut proxy_pass = None;

        for line in config.lines() {
            let line = line.trim();
            
            if line.starts_with("server_name") {
                let names: Vec<&str> = line
                    .trim_start_matches("server_name")
                    .trim_end_matches(';')
                    .split_whitespace()
                    .collect();
                if !names.is_empty() {
                    domain = names[0].to_string();
                    aliases = names[1..].iter().map(|s| s.to_string()).collect();
                }
            } else if line.starts_with("root") {
                root_path = line
                    .trim_start_matches("root")
                    .trim_end_matches(';')
                    .trim()
                    .to_string();
            } else if line.contains("ssl_certificate ") && !line.contains("ssl_certificate_key") {
                ssl_enabled = true;
                ssl_certificate = Some(
                    line.trim_start_matches("ssl_certificate")
                        .trim_end_matches(';')
                        .trim()
                        .to_string()
                );
            } else if line.contains("ssl_certificate_key") {
                ssl_certificate_key = Some(
                    line.trim_start_matches("ssl_certificate_key")
                        .trim_end_matches(';')
                        .trim()
                        .to_string()
                );
            } else if line.starts_with("proxy_pass") {
                proxy_pass = Some(
                    line.trim_start_matches("proxy_pass")
                        .trim_end_matches(';')
                        .trim()
                        .to_string()
                );
            }
        }

        // Detect template type
        let template_type = if proxy_pass.is_some() {
            if config.contains("fastcgi_pass") {
                if config.contains("laravel") || config.contains("artisan") {
                    TemplateType::PhpLaravel
                } else if config.contains("wp-") || config.contains("wordpress") {
                    TemplateType::PhpWordpress
                } else {
                    TemplateType::Php
                }
            } else {
                TemplateType::ReverseProxy
            }
        } else if config.contains("fastcgi_pass") {
            TemplateType::Php
        } else {
            TemplateType::Static
        };

        NginxDomain {
            id: format!("{}:{}", server_id, site_name),
            server_id: server_id.to_string(),
            domain,
            aliases,
            root_path,
            config_path: config_path.to_string(),
            enabled,
            ssl_enabled,
            ssl_certificate,
            ssl_certificate_key,
            proxy_pass,
            template_type,
            custom_config: None,
            created_at: 0,
            updated_at: 0,
        }
    }
}
