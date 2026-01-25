# Pre-push check script for CargoShip (Windows PowerShell)
# Run this before pushing to ensure code quality
# Usage: 
#   .\scripts\pre-push.ps1          # Run locally
#   .\scripts\pre-push.ps1 -Docker  # Run in Docker container

param(
    [switch]$Docker
)

$ErrorActionPreference = "Continue"

Write-Host "🔍 Running pre-push checks..." -ForegroundColor Cyan
Write-Host ""

if ($Docker) {
    Write-Host "🐳 Running in Docker container..." -ForegroundColor Blue
    Write-Host ""
    
    # Build the Docker image
    Write-Host "Building Docker image..." -ForegroundColor Yellow
    docker build -t cargoship-check -f Dockerfile.check .
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Docker build failed." -ForegroundColor Red
        exit 1
    }
    
    # Run the checks in Docker
    Write-Host ""
    Write-Host "Running checks in container..." -ForegroundColor Yellow
    docker run --rm cargoship-check
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ All Docker checks passed! Safe to push." -ForegroundColor Green
        exit 0
    }
    else {
        Write-Host ""
        Write-Host "❌ Docker checks failed. Please fix before pushing." -ForegroundColor Red
        exit 1
    }
}

# Local checks (without Docker)
$Failed = $false

# Frontend checks
Write-Host "📦 Checking Frontend..." -ForegroundColor Yellow
Write-Host "------------------------"

Write-Host -NoNewline "  TypeScript type check... "
$null = npx tsc --noEmit 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓" -ForegroundColor Green
}
else {
    Write-Host "✗" -ForegroundColor Red
    npx tsc --noEmit
    $Failed = $true
}

Write-Host -NoNewline "  Build frontend... "
$null = npm run build 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓" -ForegroundColor Green
}
else {
    Write-Host "✗" -ForegroundColor Red
    npm run build
    $Failed = $true
}

Write-Host ""

# Backend checks
Write-Host "🦀 Checking Backend (Rust)..." -ForegroundColor Yellow
Write-Host "-----------------------------"

Push-Location src-tauri

Write-Host -NoNewline "  Cargo check... "
$null = cargo check --all-features 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓" -ForegroundColor Green
}
else {
    Write-Host "✗" -ForegroundColor Red
    cargo check --all-features
    $Failed = $true
}

Write-Host -NoNewline "  Cargo clippy... "
$null = cargo clippy --all-features -- -D warnings 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓" -ForegroundColor Green
}
else {
    Write-Host "✗" -ForegroundColor Red
    cargo clippy --all-features -- -D warnings
    $Failed = $true
}

Write-Host -NoNewline "  Cargo fmt check... "
$null = cargo fmt --check 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓" -ForegroundColor Green
}
else {
    Write-Host "⚠ (formatting issues)" -ForegroundColor Yellow
    Write-Host "  Run 'cargo fmt' to fix formatting" -ForegroundColor Gray
}

Pop-Location

Write-Host ""
Write-Host "========================"

if (-not $Failed) {
    Write-Host "✅ All checks passed! Safe to push." -ForegroundColor Green
    exit 0
}
else {
    Write-Host "❌ Some checks failed. Please fix before pushing." -ForegroundColor Red
    exit 1
}
