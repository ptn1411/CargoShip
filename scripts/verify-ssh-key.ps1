# SSH Key Verification Script for Windows
# This script helps diagnose SSH key authentication issues

param(
    [Parameter(Mandatory=$true)]
    [string]$KeyPath,
    
    [Parameter(Mandatory=$true)]
    [string]$Server,
    
    [Parameter(Mandatory=$true)]
    [string]$Username
)

Write-Host "=== SSH Key Verification Tool ===" -ForegroundColor Cyan
Write-Host ""

# Check if key file exists
if (-not (Test-Path $KeyPath)) {
    Write-Host "ERROR: Private key not found at: $KeyPath" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Private key found: $KeyPath" -ForegroundColor Green

# Check for public key
$PubKeyPath = "$KeyPath.pub"
if (-not (Test-Path $PubKeyPath)) {
    Write-Host "WARNING: Public key not found at: $PubKeyPath" -ForegroundColor Yellow
    Write-Host "Generating public key from private key..." -ForegroundColor Yellow
    
    ssh-keygen -y -f $KeyPath | Out-File -FilePath $PubKeyPath -Encoding ASCII
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Public key generated successfully" -ForegroundColor Green
    } else {
        Write-Host "ERROR: Failed to generate public key" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✓ Public key found: $PubKeyPath" -ForegroundColor Green
}

# Show key fingerprint
Write-Host ""
Write-Host "Key fingerprint:" -ForegroundColor Cyan
ssh-keygen -lf $KeyPath

# Show public key content
Write-Host ""
Write-Host "Public key content:" -ForegroundColor Cyan
Get-Content $PubKeyPath

# Test SSH connection
Write-Host ""
Write-Host "Testing SSH connection..." -ForegroundColor Cyan
Write-Host "Command: ssh -i $KeyPath -o PreferredAuthentications=publickey -o PasswordAuthentication=no $Username@$Server 'echo Connection successful'" -ForegroundColor Gray
Write-Host ""

$result = ssh -i $KeyPath -o PreferredAuthentications=publickey -o PasswordAuthentication=no "$Username@$Server" "echo 'Connection successful'" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ SSH connection successful!" -ForegroundColor Green
    Write-Host "Your key is properly configured on the server." -ForegroundColor Green
} else {
    Write-Host "✗ SSH connection failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error output:" -ForegroundColor Yellow
    Write-Host $result -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To fix this issue:" -ForegroundColor Cyan
    Write-Host "1. Copy your public key:" -ForegroundColor White
    Write-Host "   Get-Content $PubKeyPath | Set-Clipboard" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. On the server, run:" -ForegroundColor White
    Write-Host "   mkdir -p ~/.ssh" -ForegroundColor Gray
    Write-Host "   echo 'YOUR_PUBLIC_KEY' >> ~/.ssh/authorized_keys" -ForegroundColor Gray
    Write-Host "   chmod 700 ~/.ssh" -ForegroundColor Gray
    Write-Host "   chmod 600 ~/.ssh/authorized_keys" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. Or use ssh-copy-id (if available):" -ForegroundColor White
    Write-Host "   ssh-copy-id -i $PubKeyPath $Username@$Server" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Verification Complete ===" -ForegroundColor Cyan
