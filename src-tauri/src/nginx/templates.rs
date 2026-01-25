use super::models::TemplateType;

/// Generate Nginx config based on template type
pub fn generate_config(
    domain: &str,
    aliases: &[String],
    root_path: &str,
    template_type: &TemplateType,
    proxy_pass: Option<&str>,
    ssl_enabled: bool,
    ssl_cert: Option<&str>,
    ssl_key: Option<&str>,
) -> String {
    let server_name = if aliases.is_empty() {
        domain.to_string()
    } else {
        format!("{} {}", domain, aliases.join(" "))
    };

    let ssl_config = if ssl_enabled {
        let default_cert = format!("/etc/letsencrypt/live/{}/fullchain.pem", domain);
        let default_key = format!("/etc/letsencrypt/live/{}/privkey.pem", domain);
        let cert = ssl_cert.unwrap_or(&default_cert);
        let key = ssl_key.unwrap_or(&default_key);
        format!(
            r#"
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    
    ssl_certificate {};
    ssl_certificate_key {};
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;"#,
            cert, key
        )
    } else {
        "    listen 80;\n    listen [::]:80;".to_string()
    };

    let http_redirect = if ssl_enabled {
        format!(
            r#"
# HTTP to HTTPS redirect
server {{
    listen 80;
    listen [::]:80;
    server_name {};
    return 301 https://$server_name$request_uri;
}}

"#,
            server_name
        )
    } else {
        String::new()
    };

    let location_block = match template_type {
        TemplateType::Static => generate_static_location(),
        TemplateType::Php => generate_php_location(root_path),
        TemplateType::PhpLaravel => generate_laravel_location(root_path),
        TemplateType::PhpWordpress => generate_wordpress_location(root_path),
        TemplateType::NodeJs => {
            generate_nodejs_location(proxy_pass.unwrap_or("http://127.0.0.1:3000"))
        }
        TemplateType::NodeNextJs => {
            generate_nextjs_location(proxy_pass.unwrap_or("http://127.0.0.1:3000"))
        }
        TemplateType::Python => {
            generate_python_location(proxy_pass.unwrap_or("http://127.0.0.1:8000"))
        }
        TemplateType::PythonDjango => {
            generate_django_location(root_path, proxy_pass.unwrap_or("http://127.0.0.1:8000"))
        }
        TemplateType::PythonFlask => {
            generate_flask_location(proxy_pass.unwrap_or("http://127.0.0.1:5000"))
        }
        TemplateType::RubyRails => {
            generate_rails_location(proxy_pass.unwrap_or("http://127.0.0.1:3000"))
        }
        TemplateType::Java => generate_java_location(proxy_pass.unwrap_or("http://127.0.0.1:8080")),
        TemplateType::GoLang => {
            generate_golang_location(proxy_pass.unwrap_or("http://127.0.0.1:8080"))
        }
        TemplateType::ReverseProxy => {
            generate_reverse_proxy_location(proxy_pass.unwrap_or("http://127.0.0.1:8080"))
        }
        TemplateType::LoadBalancer => {
            generate_load_balancer_config(domain, proxy_pass.unwrap_or("http://127.0.0.1:8080"))
        }
        TemplateType::Custom => {
            "    # Custom configuration - add your own location blocks".to_string()
        }
    };

    format!(
        r#"{}server {{
{}
    server_name {};
    root {};

    # Logging
    access_log /var/log/nginx/{}.access.log;
    error_log /var/log/nginx/{}.error.log;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

{}
}}
"#,
        http_redirect, ssl_config, server_name, root_path, domain, domain, location_block
    )
}

fn generate_static_location() -> String {
    r#"    index index.html index.htm;

    location / {
        try_files $uri $uri/ =404;
    }

    # Cache static assets
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|ttf|svg)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Deny access to hidden files
    location ~ /\. {
        deny all;
    }"#
    .to_string()
}

fn generate_php_location(root_path: &str) -> String {
    format!(
        r#"    index index.php index.html index.htm;

    location / {{
        try_files $uri $uri/ /index.php?$query_string;
    }}

    location ~ \.php$ {{
        fastcgi_pass unix:/var/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME {}$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_intercept_errors on;
        fastcgi_buffer_size 16k;
        fastcgi_buffers 4 16k;
    }}

    location ~ /\.ht {{
        deny all;
    }}"#,
        root_path
    )
}

fn generate_laravel_location(root_path: &str) -> String {
    format!(
        r#"    index index.php;

    charset utf-8;

    location / {{
        try_files $uri $uri/ /index.php?$query_string;
    }}

    location = /favicon.ico {{ access_log off; log_not_found off; }}
    location = /robots.txt  {{ access_log off; log_not_found off; }}

    error_page 404 /index.php;

    location ~ \.php$ {{
        fastcgi_pass unix:/var/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME {}$fastcgi_script_name;
        include fastcgi_params;
    }}

    location ~ /\.(?!well-known).* {{
        deny all;
    }}"#,
        root_path
    )
}

fn generate_wordpress_location(root_path: &str) -> String {
    format!(
        r#"    index index.php index.html index.htm;

    # WordPress permalinks
    location / {{
        try_files $uri $uri/ /index.php?$args;
    }}

    # PHP handling
    location ~ \.php$ {{
        fastcgi_pass unix:/var/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME {}$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_intercept_errors on;
        fastcgi_buffer_size 128k;
        fastcgi_buffers 256 16k;
        fastcgi_busy_buffers_size 256k;
        fastcgi_temp_file_write_size 256k;
    }}

    # Deny access to sensitive files
    location ~ /\.ht {{
        deny all;
    }}

    location = /wp-config.php {{
        deny all;
    }}

    # Cache static files
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {{
        expires max;
        log_not_found off;
    }}

    # Security for uploads
    location ~* /(?:uploads|files)/.*\.php$ {{
        deny all;
    }}"#,
        root_path
    )
}

fn generate_nodejs_location(proxy_pass: &str) -> String {
    format!(
        r#"    location / {{
        proxy_pass {};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }}"#,
        proxy_pass
    )
}

fn generate_nextjs_location(proxy_pass: &str) -> String {
    format!(
        r#"    location / {{
        proxy_pass {};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }}

    # Next.js static files
    location /_next/static {{
        proxy_pass {};
        proxy_cache_valid 60m;
        add_header Cache-Control "public, immutable";
    }}

    # Next.js image optimization
    location /_next/image {{
        proxy_pass {};
    }}"#,
        proxy_pass, proxy_pass, proxy_pass
    )
}

fn generate_python_location(proxy_pass: &str) -> String {
    format!(
        r#"    location / {{
        proxy_pass {};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;
    }}"#,
        proxy_pass
    )
}

fn generate_django_location(root_path: &str, proxy_pass: &str) -> String {
    format!(
        r#"    location / {{
        proxy_pass {};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}

    location /static/ {{
        alias {}/static/;
        expires 30d;
    }}

    location /media/ {{
        alias {}/media/;
        expires 30d;
    }}"#,
        proxy_pass, root_path, root_path
    )
}

fn generate_flask_location(proxy_pass: &str) -> String {
    format!(
        r#"    location / {{
        proxy_pass {};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
    }}"#,
        proxy_pass
    )
}

fn generate_rails_location(proxy_pass: &str) -> String {
    format!(
        r#"    location / {{
        proxy_pass {};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Ssl on;
        proxy_redirect off;
    }}

    location /cable {{
        proxy_pass {};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }}"#,
        proxy_pass, proxy_pass
    )
}

fn generate_java_location(proxy_pass: &str) -> String {
    format!(
        r#"    location / {{
        proxy_pass {};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
    }}"#,
        proxy_pass
    )
}

fn generate_golang_location(proxy_pass: &str) -> String {
    format!(
        r#"    location / {{
        proxy_pass {};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }}"#,
        proxy_pass
    )
}

fn generate_reverse_proxy_location(proxy_pass: &str) -> String {
    format!(
        r#"    location / {{
        proxy_pass {};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_request_buffering off;
    }}"#,
        proxy_pass
    )
}

fn generate_load_balancer_config(domain: &str, _proxy_pass: &str) -> String {
    format!(
        r#"# Upstream servers - modify as needed
upstream {}_backend {{
    least_conn;
    server 127.0.0.1:8001 weight=3;
    server 127.0.0.1:8002 weight=2;
    server 127.0.0.1:8003 backup;
    keepalive 32;
}}

    location / {{
        proxy_pass http://{}_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }}"#,
        domain.replace('.', "_"),
        domain.replace('.', "_")
    )
}

/// Get list of available config snippets
pub fn get_config_snippets() -> Vec<super::models::ConfigSnippet> {
    vec![
        super::models::ConfigSnippet {
            id: "gzip".to_string(),
            name: "Gzip Compression".to_string(),
            description: "Enable gzip compression for text-based content".to_string(),
            category: "Performance".to_string(),
            content: r#"    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;"#.to_string(),
        },
        super::models::ConfigSnippet {
            id: "rate_limit".to_string(),
            name: "Rate Limiting".to_string(),
            description: "Limit request rate to prevent abuse".to_string(),
            category: "Security".to_string(),
            content: r#"    # Rate limiting
    limit_req_zone $binary_remote_addr zone=one:10m rate=10r/s;
    limit_req zone=one burst=20 nodelay;"#.to_string(),
        },
        super::models::ConfigSnippet {
            id: "cors".to_string(),
            name: "CORS Headers".to_string(),
            description: "Enable Cross-Origin Resource Sharing".to_string(),
            category: "Headers".to_string(),
            content: r#"    # CORS headers
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
    add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;"#.to_string(),
        },
        super::models::ConfigSnippet {
            id: "websocket".to_string(),
            name: "WebSocket Support".to_string(),
            description: "Enable WebSocket connections".to_string(),
            category: "Protocol".to_string(),
            content: r#"    # WebSocket support
    location /ws {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }"#.to_string(),
        },
        super::models::ConfigSnippet {
            id: "cache_static".to_string(),
            name: "Static File Caching".to_string(),
            description: "Cache static assets for better performance".to_string(),
            category: "Performance".to_string(),
            content: r#"    # Static file caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|ttf|svg|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }"#.to_string(),
        },
        super::models::ConfigSnippet {
            id: "security_headers".to_string(),
            name: "Security Headers".to_string(),
            description: "Add comprehensive security headers".to_string(),
            category: "Security".to_string(),
            content: r#"    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';" always;"#.to_string(),
        },
        super::models::ConfigSnippet {
            id: "php_fpm".to_string(),
            name: "PHP-FPM Socket".to_string(),
            description: "PHP-FPM configuration via Unix socket".to_string(),
            category: "PHP".to_string(),
            content: r#"    # PHP-FPM configuration
    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_intercept_errors on;
        fastcgi_buffer_size 16k;
        fastcgi_buffers 4 16k;
    }"#.to_string(),
        },
        super::models::ConfigSnippet {
            id: "deny_hidden".to_string(),
            name: "Deny Hidden Files".to_string(),
            description: "Block access to hidden files and directories".to_string(),
            category: "Security".to_string(),
            content: r#"    # Deny hidden files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }"#.to_string(),
        },
        super::models::ConfigSnippet {
            id: "client_max_body".to_string(),
            name: "Upload Size Limit".to_string(),
            description: "Set maximum upload file size".to_string(),
            category: "Limits".to_string(),
            content: r#"    # Upload size limit
    client_max_body_size 100M;
    client_body_buffer_size 128k;"#.to_string(),
        },
        super::models::ConfigSnippet {
            id: "proxy_timeout".to_string(),
            name: "Proxy Timeouts".to_string(),
            description: "Configure proxy timeout settings".to_string(),
            category: "Proxy".to_string(),
            content: r#"    # Proxy timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
    send_timeout 60s;"#.to_string(),
        },
    ]
}
