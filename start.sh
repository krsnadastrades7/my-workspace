#!/bin/bash
# ==============================================================================
# Startup Script for Dharmanagar Iron Gym Management System
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "======================================================================"
echo "🏋️  DHARMANAGAR IRON GYM - LOCAL MANAGEMENT SERVER"
echo "📍  Location: Dharmanagar, North Tripura"
echo "======================================================================"

# Check Python3 availability
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: python3 is not installed or not in PATH."
    exit 1
fi

echo "🔍 Checking Python environment..."
python3 --version

# Check if Flask is installed
if ! python3 -c "import flask" &> /dev/null; then
    echo "📦 Installing required dependencies (Flask)..."
    pip3 install --break-system-packages flask
fi

# Initialize database if gym.db doesn't exist
if [ ! -f "gym.db" ]; then
    echo "💾 Initializing SQLite database with Dharmanagar seed data..."
    python3 database.py
fi

PORT=${PORT:-5000}
HOST=${HOST:-"0.0.0.0"}

echo ""
echo "🚀 Starting server at http://${HOST}:${PORT}"
echo "👑 Admin Account: admin / 01012000"
echo "🏃 Member Accounts: rahuldebnath / 15082000, sneharoy / 10051998, bikramdas / 25121995"
echo "======================================================================"
echo ""

exec python3 server.py
