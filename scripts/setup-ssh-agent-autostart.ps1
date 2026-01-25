# Setup SSH Agent to auto-start and auto-add keys
# Run this script once to configure automatic SSH key loading

Write-Host "=== SSH Agent Auto-Start Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "This script needs to run as Administrator to configure SSH Agent service." -ForegroundColor Yellow
    Write-Host "Please right-click PowerShell and select 'Run as Administrator', then run this script again." -ForegroundColor Yellow
    exit 1
}

# Step 1: Configure SSH Agent service to start automatically
Write-Host "Step 1: Configuring SSH Agent service..." -ForegroundColor Cyan
Set-Service ssh-agent -StartupType Automatic
Start-Service ssh-agent

$service = Get-Service ssh-agent
if ($service.Status -eq 'Running') {
    Write-Host "✓ SSH Agent service is running" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to start SSH Agent service" -ForegroundColor Red
    exit 1
}

# Step 2: Create PowerShell profile to auto-add keys
Write-Host ""
Write-Host "Step 2: Setting up PowerShell profile..." -ForegroundColor Cyan

$profilePath = $PROFILE.CurrentUserAllHosts
$profileDir = Split-Path -Parent $profilePath

if (-not (Test-Path $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}

$sshKeyPath = "$env:USERPROFILE\.ssh\vps2"
$profileContent = @"

# Auto-add SSH keys to agent (added by DevOps Commander)
if (Get-Service ssh-agent -ErrorAction SilentlyContinue) {
    `$agentStatus = Get-Service ssh-agent | Select-Object -ExpandProperty Status
    if (`$agentStatus -eq 'Running') {
        # Check if key is already in agent
        `$keyList = ssh-add -l 2>&1
        if (`$keyList -notmatch 'ED25519' -and (Test-Path '$sshKeyPath')) {
            # Key not in agent, add it silently
            ssh-add '$sshKeyPath' 2>`$null
        }
    }
}
"@

# Check if profile already has this content
if (Test-Path $profilePath) {
    $existingContent = Get-Content $profilePath -Raw
    if ($existingContent -notmatch 'Auto-add SSH keys to agent') {
        Add-Content -Path $profilePath -Value $profileContent
        Write-Host "✓ Added SSH key auto-load to PowerShell profile" -ForegroundColor Green
    } else {
        Write-Host "✓ PowerShell profile already configured" -ForegroundColor Green
    }
} else {
    Set-Content -Path $profilePath -Value $profileContent
    Write-Host "✓ Created PowerShell profile with SSH key auto-load" -ForegroundColor Green
}

Write-Host ""
Write-Host "Profile location: $profilePath" -ForegroundColor Gray

# Step 3: Add key to agent now
Write-Host ""
Write-Host "Step 3: Adding SSH key to agent..." -ForegroundColor Cyan

if (Test-Path $sshKeyPath) {
    Write-Host "You will be prompted for your SSH key passphrase." -ForegroundColor Yellow
    ssh-add $sshKeyPath
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ SSH key added to agent" -ForegroundColor Green
    } else {
        Write-Host "✗ Failed to add SSH key" -ForegroundColor Red
    }
} else {
    Write-Host "✗ SSH key not found at: $sshKeyPath" -ForegroundColor Red
    Write-Host "Please update the path in the script if your key is in a different location." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "What happens now:" -ForegroundColor White
Write-Host "1. SSH Agent will start automatically when Windows boots" -ForegroundColor Gray
Write-Host "2. Your SSH key will be auto-added when you open PowerShell" -ForegroundColor Gray
Write-Host "3. You'll only need to enter passphrase once per session" -ForegroundColor Gray
Write-Host ""
Write-Host "To test: Close and reopen PowerShell, then run: ssh-add -l" -ForegroundColor Cyan
Write-Host ""
