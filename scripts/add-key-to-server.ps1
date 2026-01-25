# Add SSH Public Key to Server
# This script copies your public key to the server's authorized_keys

param(
    [Parameter(Mandatory=$true)]
    [string]$KeyPath,
    
    [Parameter(Mandatory=$true)]
    [string]$Server,
    
    [Parameter(Mandatory=$true)]
    [string]$Username
)

Write-Host "=== Add SSH Key to Server ===" -ForegroundColor Cyan
Write-Host ""

# Check if key file exists
if (-not (Test-Path $KeyPath)) {
    Write-Host "ERROR: Private key not found at: $KeyPath" -ForegroundColor Red
    exit 1
}

# Check for public key
$PubKeyPath = "$KeyPath.pub"
if (-not (Test-Path $PubKeyPath)) {
    Write-Host "Generating public key from private key..." -ForegroundColor Yellow
    ssh-keygen -y -f $KeyPath | Out-File -FilePath $PubKeyPath -Encoding ASCII
}

# Read public key
$PublicKey = Get-Content $PubKeyPath -Raw
$PublicKey = $PublicKey.Trim()

Write-Host "Public key to add:" -ForegroundColor Cyan
Write-Host $PublicKey -ForegroundColor Gray
Write-Host ""

# Ask for confirmation
$confirm = Read-Host "Add this key to $Username@$Server? (y/n)"
if ($confirm -ne 'y') {
    Write-Host "Cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Adding key to server..." -ForegroundColor Cyan
Write-Host "You will be prompted for the server password." -ForegroundColor Yellow
Write-Host ""

# Create the command to add the key
$command = @"
mkdir -p ~/.ssh && \
chmod 700 ~/.ssh && \
echo '$PublicKey' >> ~/.ssh/authorized_keys && \
chmod 600 ~/.ssh/authorized_keys && \
echo 'Key added successfully'
"@

# Execute on server
ssh "$Username@$Server" $command

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ Key added successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Testing connection..." -ForegroundColor Cyan
    
    $test = ssh -i $KeyPath -o PreferredAuthentications=publickey -o PasswordAuthentication=no "$Username@$Server" "echo 'Connection test successful'" 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Connection test successful!" -ForegroundColor Green
        Write-Host "You can now use this key to connect without a password." -ForegroundColor Green
    } else {
        Write-Host "✗ Connection test failed" -ForegroundColor Red
        Write-Host $test -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "✗ Failed to add key" -ForegroundColor Red
    Write-Host "Please check your server password and try again." -ForegroundColor Yellow
}

Write-Host ""
