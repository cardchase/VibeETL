#!/bin/bash

# Exit on error
set -e

echo -e "\033[0;36m============================================="
echo -e "        *** Welcome to VibeETL ***"
echo -e "=============================================\033[0m"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "\033[0;31mError: python3 is not installed or not in PATH.\033[0m"
    exit 1
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "\033[0;31mError: npm is not installed or not in PATH.\033[0m"
    exit 1
fi

# Get current script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# 1. Setup Backend
echo -e "\033[0;32m[1/4] Setting up Python backend environment...\033[0m"
cd "$SCRIPT_DIR/backend"
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# 2. Setup Frontend
echo -e "\033[0;32m[2/4] Setting up React frontend dependencies...\033[0m"
cd "$SCRIPT_DIR/frontend"
npm install

# Trap to kill background processes on exit
cleanup() {
    echo -e "\033[0;33m\nShutting down VibeETL services...\033[0m"
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT

# 3. Start Backend
echo -e "\033[0;32m[3/4] Starting VibeETL Backend Engine...\033[0m"
cd "$SCRIPT_DIR/backend"
source venv/bin/activate
python run.py &
BACKEND_PID=$!

# 4. Start Frontend
echo -e "\033[0;32m[4/4] Starting VibeETL Frontend Dev Server...\033[0m"
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo -e "\033[0;36m"
echo "VibeETL has been launched!"
echo "  - Backend Engine: http://127.0.0.1:8000"
echo "  - Frontend Portal: http://localhost:5173"
echo ""
echo "Press [Ctrl+C] to stop all services."
echo -e "=============================================\033[0m"

# Wait for background jobs to finish
wait
