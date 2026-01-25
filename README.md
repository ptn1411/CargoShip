# CargoShip

![CargoShip](./public/logo.png)

CargoShip là ứng dụng desktop quản lý VPS/Server mạnh mẽ, được xây dựng với Tauri + React + TypeScript. Giúp DevOps và System Admin quản lý nhiều server từ một giao diện thống nhất.

## Tính năng chính

### 🖥️ Quản lý Server
- Thêm, sửa, xóa thông tin server (SSH)
- Nhóm server theo project/môi trường
- Theo dõi trạng thái kết nối real-time
- Lưu trữ credentials an toàn với OS Keychain

### 📁 File Browser
- Duyệt file/folder trên remote server qua SFTP
- Upload/Download file với progress bar
- Tạo, xóa, rename, chmod file/folder
- Hỗ trợ drag & drop

### ✏️ Code Editor
- Editor tích hợp Monaco (VS Code engine)
- Syntax highlighting cho nhiều ngôn ngữ
- Chỉnh sửa file trực tiếp trên server
- Diff viewer so sánh thay đổi

### 💻 Terminal
- SSH Terminal với xterm.js
- Hỗ trợ nhiều tab terminal
- Local terminal (PowerShell/Bash)
- Tìm kiếm trong terminal output

### 📜 Script Management
- Tạo và quản lý deployment scripts
- Template scripts có sẵn
- Biến động (variables) cho scripts
- Dry-run mode xem trước lệnh
- Lịch sử deployment với rollback

### 🔧 Nginx Manager
- Quản lý virtual hosts
- Tạo config từ template
- SSL/Let's Encrypt integration
- Kiểm tra syntax và reload nginx

### 🗄️ Database Manager
- Kết nối MySQL/PostgreSQL qua SSH tunnel
- Query editor với syntax highlighting
- Xem và quản lý tables
- Export kết quả query

### 📊 Dashboard
- Tổng quan tất cả servers
- Metrics: CPU, RAM, Disk usage
- Alert khi resource cao
- Quick actions

### ⚡ Các tính năng khác
- Command Palette (Ctrl+P)
- Code Snippets library
- SSH Key management
- Dark/Light/System theme
- Batch operations trên nhiều server

## Cài đặt

### Yêu cầu
- Node.js 18+
- Rust 1.70+
- Tauri CLI

### Development

```bash
# Cài dependencies
npm install

# Chạy dev mode
npm run tauri dev
```

### Build

```bash
# Build production
npm run tauri build
```

Output sẽ nằm trong `src-tauri/target/release/bundle/`

## Kiến trúc

```
CargoShip/
├── src/                    # Frontend React
│   ├── components/         # UI Components
│   │   ├── dashboard/      # Dashboard & metrics
│   │   ├── database/       # Database manager
│   │   ├── editor/         # Monaco editor
│   │   ├── files/          # File browser
│   │   ├── nginx/          # Nginx manager
│   │   ├── scripts/        # Script management
│   │   ├── servers/        # Server management
│   │   ├── terminal/       # Terminal emulator
│   │   └── ...
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities
│   └── store/              # Zustand state management
│
├── src-tauri/              # Backend Rust
│   └── src/
│       ├── ssh/            # SSH client & connection pool
│       ├── files/          # SFTP file operations
│       ├── terminal/       # PTY & terminal sessions
│       ├── database/       # DB connections via tunnel
│       ├── nginx/          # Nginx config management
│       ├── scripts/        # Script engine & templates
│       ├── credentials/    # Secure credential storage
│       └── ...
```

## Tech Stack

**Frontend:**
- React 19
- TypeScript
- Tailwind CSS
- Zustand (state management)
- Monaco Editor
- xterm.js

**Backend:**
- Tauri 2
- Rust
- ssh2 (SSH/SFTP)
- sqlx (SQLite local storage)
- keyring (OS credential storage)

## License

MIT
