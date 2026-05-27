# Set UTF-8 encoding to fix emoji rendering
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "                 *** Welcome to VibeETL ***                 " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# Check Python installation
if (-not (Get-Command "python" -ErrorAction SilentlyContinue)) {
    Write-Error "Python is not installed or not in your PATH. Please install Python 3.9+ to run the backend engine."
    Exit 1
}

# Check Node.js/npm installation
if (-not (Get-Command "npm" -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js/npm is not installed or not in your PATH. Please install Node.js to run the React frontend."
    Exit 1
}

# 1. Setup Backend
Write-Host "[1/4] Setting up Python backend environment..." -ForegroundColor Green
$BackendDir = Join-Path $PSScriptRoot "backend"
$VenvDir = Join-Path $BackendDir "venv"

if (-not (Test-Path $VenvDir)) {
    Write-Host "Creating Python virtual environment in $VenvDir..." -ForegroundColor Gray
    python -m venv $VenvDir
}

Write-Host "Upgrading pip and installing python requirements..." -ForegroundColor Gray
& "$VenvDir\Scripts\python.exe" -m pip install --upgrade pip
& "$VenvDir\Scripts\python.exe" -m pip install -r "$BackendDir\requirements.txt"

# 2. Setup Frontend
Write-Host "[2/4] Setting up React frontend dependencies..." -ForegroundColor Green
$FrontendDir = Join-Path $PSScriptRoot "frontend"
Push-Location $FrontendDir
npm install
Pop-Location

try {
    # 3. Find Free Port for Backend
    Write-Host "[3/4] Finding free port for VibeETL Backend Engine..." -ForegroundColor Green
    $BackendPort = 8000
    while ($true) {
        $portInUse = Get-NetTCPConnection -LocalPort $BackendPort -ErrorAction SilentlyContinue
        if (-not $portInUse) {
            break
        }
        $BackendPort++
    }
    Write-Host "Found free backend port: $BackendPort" -ForegroundColor Gray
    
    $env:PORT = $BackendPort
    
    # Write environment variable for React Frontend
    $envContent = "VITE_API_BASE_URL=http://127.0.0.1:$BackendPort"
    Set-Content -Path "$FrontendDir\.env" -Value $envContent

    Write-Host "Starting Backend Engine..." -ForegroundColor Green
    $BackendProcess = Start-Process -FilePath "$VenvDir\Scripts\python.exe" -ArgumentList "run.py" -WorkingDirectory $BackendDir -PassThru -WindowStyle Hidden

    # 4. Start Frontend in background
    Write-Host "[4/4] Starting VibeETL Frontend Dev Server..." -ForegroundColor Green
    $FrontendProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "run dev" -WorkingDirectory $FrontendDir -PassThru -WindowStyle Hidden

    Write-Host ""
    Write-Host "VibeETL has been launched successfully!" -ForegroundColor Cyan
    Write-Host "  - Backend Engine:  http://127.0.0.1:$BackendPort" -ForegroundColor Gray
    Write-Host "  - Frontend Portal: http://localhost:5173" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Press ANY KEY or CTRL+C to stop the servers and exit." -ForegroundColor Yellow
    
    # Optional: Catch Ctrl+C manually if it bypasses finally in some shells
    [console]::TreatControlCAsInput = $true
    while ($true) {
        if ([console]::KeyAvailable) {
            $key = [console]::ReadKey($true)
            break
        }
        Start-Sleep -Milliseconds 100
    }
} finally {
    Write-Host "`nShutting down servers and freeing ports..." -ForegroundColor Cyan
    if ($BackendProcess) { Stop-Process -Id $BackendProcess.Id -Force -ErrorAction SilentlyContinue }
    if ($FrontendProcess) { Stop-Process -Id $FrontendProcess.Id -Force -ErrorAction SilentlyContinue }
    
    # Force kill any orphaned processes listening on ports to prevent ghost servers
    Get-NetTCPConnection -LocalPort $BackendPort, 5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    
    [console]::TreatControlCAsInput = $false
    Write-Host "Done! Ports are cleared." -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Cyan
}
