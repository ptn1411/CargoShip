import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Nginx Management Types
// ============================================================================

export type TemplateType = 
  | "static"
  | "php"
  | "php_laravel"
  | "php_wordpress"
  | "node_js"
  | "node_next_js"
  | "python"
  | "python_django"
  | "python_flask"
  | "ruby_rails"
  | "java"
  | "go_lang"
  | "reverse_proxy"
  | "load_balancer"
  | "custom";

export interface NginxDomain {
  id: string;
  server_id: string;
  domain: string;
  aliases: string[];
  root_path: string;
  config_path: string;
  enabled: boolean;
  ssl_enabled: boolean;
  ssl_certificate: string | null;
  ssl_certificate_key: string | null;
  proxy_pass: string | null;
  template_type: TemplateType;
  custom_config: string | null;
  created_at: number;
  updated_at: number;
}

export interface NginxStatus {
  running: boolean;
  version: string;
  config_test: boolean;
  config_error: string | null;
  sites_enabled: number;
  sites_available: number;
}

export interface SslCertificate {
  domain: string;
  issuer: string;
  valid_from: string;
  valid_until: string;
  days_remaining: number;
  auto_renew: boolean;
}


export interface SslResult {
  success: boolean;
  domain: string;
  message: string;
  certificate_path: string | null;
  key_path: string | null;
}

export interface ConfigSnippet {
  id: string;
  name: string;
  description: string;
  category: string;
  content: string;
}

export interface CreateDomainInput {
  server_id: string;
  domain: string;
  aliases?: string[];
  root_path?: string;
  template_type: TemplateType;
  proxy_pass?: string;
  enable_ssl: boolean;
  custom_config?: string;
}

export interface UpdateDomainInput {
  domain?: string;
  aliases?: string[];
  root_path?: string;
  template_type?: TemplateType;
  proxy_pass?: string;
  custom_config?: string;
}

// ============================================================================
// Nginx Management API
// ============================================================================

export const nginxApi = {
  // Status & Control
  getStatus: (serverId: string) => 
    invoke<NginxStatus>("nginx_get_status", { serverId }),
  restart: (serverId: string) => 
    invoke<void>("nginx_restart", { serverId }),
  start: (serverId: string) => 
    invoke<void>("nginx_start", { serverId }),
  stop: (serverId: string) => 
    invoke<void>("nginx_stop", { serverId }),

  // Domain Management
  listDomains: (serverId: string) => 
    invoke<NginxDomain[]>("nginx_list_domains", { serverId }),
  createDomain: (input: CreateDomainInput) => 
    invoke<NginxDomain>("nginx_create_domain", { input }),
  updateDomain: (serverId: string, domainName: string, input: UpdateDomainInput) => 
    invoke<NginxDomain>("nginx_update_domain", { serverId, domainName, input }),
  deleteDomain: (serverId: string, domainName: string) => 
    invoke<void>("nginx_delete_domain", { serverId, domainName }),
  toggleDomain: (serverId: string, domainName: string, enable: boolean) => 
    invoke<void>("nginx_toggle_domain", { serverId, domainName, enable }),

  // Config Management
  getDomainConfig: (serverId: string, domainName: string) => 
    invoke<string>("nginx_get_domain_config", { serverId, domainName }),
  saveDomainConfig: (serverId: string, domainName: string, content: string) => 
    invoke<void>("nginx_save_domain_config", { serverId, domainName, content }),
  getSnippets: () => 
    invoke<ConfigSnippet[]>("nginx_get_snippets"),

  // SSL Management
  issueSsl: (serverId: string, domainName: string, email: string) => 
    invoke<SslResult>("nginx_issue_ssl", { serverId, domainName, email }),
  renewSsl: (serverId: string) => 
    invoke<string>("nginx_renew_ssl", { serverId }),
  listSslCertificates: (serverId: string) => 
    invoke<SslCertificate[]>("nginx_list_ssl_certificates", { serverId }),
};
