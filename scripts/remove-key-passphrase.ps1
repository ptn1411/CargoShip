# Remove passphrase from SSH key
# WARNING: This makes your key less secure!

param(
    [Parameter(Mandatory=$false)]
    [string]$KeyPath = "$env:USERPROFILE\.ssh\vps2"
)

Write-Host "=== Remove SSH Key Passphrase ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "WARNING: Removing the passphrase makes your key less secure!" -ForegroundColor Yellow
Write-Host "Anyone with access to your computer can use this key." -ForegroundColor Yellow
Write-Host ""

$confirm = Read-Host "Are you sure you want to remove the passphrase? (yes/no)"
if ($confirm -ne 'yes') {
    Write-Host "Cancelled." -ForegroundColor Yellow
    exit 0
}

if (-not (Test-Path $KeyPath)) {
    Write-Host "ERROR: Key not found at: $KeyPath" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Removing passphrase from: $KeyPath" -ForegroundColor Cyan
Write-Host "You will be prompted for the CURRENT passphrase." -ForegroundColor Yellow
Write-Host ""

# Create backup
$backupPath = "$KeyPath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $KeyPath $backupPath
Write-Host "✓ Backup created: $backupPath" -ForegroundColor Green

# Remove passphrase
ssh-keygen -p -N "" -f $KeyPath

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ Passphrase removed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your key now has no passphrase." -ForegroundColor White
    Write-Host "Backup of original key: $backupPath" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "✗ Failed to remove passphrase" -ForegroundColor Red
    Write-Host "Original key is unchanged." -ForegroundColor Gray
}

Write-Host ""
