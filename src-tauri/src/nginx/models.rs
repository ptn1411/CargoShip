use serde::{Deserialize, Serialize};

/// Represents a domain/site configuration in Nginx
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NginxDomain {
    pub id: String,
    pub server_id: String,
    pub domain: String,
    pub aliases: Vec<String>,
    pub root_path: String,
    pub config_path: String,
    pub enabled: bool,
    pub ssl_enabled: bool,
    pub ssl_certificate: Option<String>,
    pub ssl_certificate_key: Option<String>,
    pub proxy_pass: Option<String>,
    pub template_type: TemplateType,
    pub custom_config: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// SSL Certificate info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SslCertificate {
    pub domain: String,
    pub issuer: String,
    pub valid_from: String,
    pub valid_until: String,
    pub days_remaining: i32,
    pub auto_renew: bool,
}

/// Template types for different application stacks
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TemplateType {
    Static,
    Php,
    PhpLaravel,
    PhpWordpress,
    NodeJs,
    NodeNextJs,
    Python,
    PythonDjango,
    PythonFlask,
    RubyRails,
    Java,
    GoLang,
    ReverseProxy,
    LoadBalancer,
    Custom,
}

impl Default for TemplateType {
    fn default() -> Self {
        TemplateType::Static
    }
}

impl std::fmt::Display for TemplateType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TemplateType::Static => write!(f, "Static HTML/CSS/JS"),
            TemplateType::Php => write!(f, "PHP (Generic)"),
            TemplateType::PhpLaravel => write!(f, "PHP Laravel"),
            TemplateType::PhpWordpress => write!(f, "PHP WordPress"),
            TemplateType::NodeJs => write!(f, "Node.js"),
            TemplateType::NodeNextJs => write!(f, "Next.js"),
            TemplateType::Python => write!(f, "Python (Generic)"),
            TemplateType::PythonDjango => write!(f, "Python Django"),
            TemplateType::PythonFlask => write!(f, "Python Flask"),
            TemplateType::RubyRails => write!(f, "Ruby on Rails"),
            TemplateType::Java => write!(f, "Java (Tomcat/Spring)"),
            TemplateType::GoLang => write!(f, "Go"),
            TemplateType::ReverseProxy => write!(f, "Reverse Proxy"),
            TemplateType::LoadBalancer => write!(f, "Load Balancer"),
            TemplateType::Custom => write!(f, "Custom"),
        }
    }
}

/// Input for creating a new domain
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateDomainInput {
    pub server_id: String,
    pub domain: String,
    pub aliases: Option<Vec<String>>,
    pub root_path: Option<String>,
    pub template_type: TemplateType,
    pub proxy_pass: Option<String>,
    pub enable_ssl: bool,
    pub custom_config: Option<String>,
}

/// Input for updating a domain
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateDomainInput {
    pub domain: Option<String>,
    pub aliases: Option<Vec<String>>,
    pub root_path: Option<String>,
    pub template_type: Option<TemplateType>,
    pub proxy_pass: Option<String>,
    pub custom_config: Option<String>,
}

/// Nginx service status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NginxStatus {
    pub running: bool,
    pub version: String,
    pub config_test: bool,
    pub config_error: Option<String>,
    pub sites_enabled: u32,
    pub sites_available: u32,
}

/// SSL issuance result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SslResult {
    pub success: bool,
    pub domain: String,
    pub message: String,
    pub certificate_path: Option<String>,
    pub key_path: Option<String>,
}

/// Config snippet that can be added to domain config
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigSnippet {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub content: String,
}
