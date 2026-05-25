# Set UTF-8 encoding
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "        ⛵ Welcome to VibeETL ⛵" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
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
& "$VenvDir\Scripts\pip.exe" install -r "$BackendDir\requirements.txt"

# 2. Setup Frontend
Write-Host "[2/4] Setting up React frontend dependencies..." -ForegroundColor Green
$FrontendDir = Join-Path $PSScriptRoot "frontend"
Push-Location $FrontendDir
npm install
Pop-Location

# 3. Start Backend in a separate window
Write-Host "[3/4] Starting VibeETL Backend Engine..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit -Command `"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; cd '$BackendDir'; .\venv\Scripts\activate; python run.py`"" -WindowStyle Normal

# 4. Start Frontend in a separate window
Write-Host "[4/4] Starting VibeETL Frontend Dev Server..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit -Command `"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; cd '$FrontendDir'; npm run dev`"" -WindowStyle Normal

Write-Host ""
Write-Host "VibeETL has been launched!" -ForegroundColor Cyan
Write-Host "  - Backend Engine: http://127.0.0.1:8000" -ForegroundColor Gray
Write-Host "  - Frontend Portal: http://localhost:5173 (usually, check the Vite console)" -ForegroundColor Gray
Write-Host ""
Write-Host "Close the spawned console windows to stop the servers." -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Cyan
