#!/bin/bash
# Shadowbroker OSINT Backend - Persistent Start Script
# This script keeps the service running by using exec to replace the shell process

cd /home/z/shadowbroker

# Set up virtual environment
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

# Activate venv
. venv/bin/activate

# Install dependencies quietly
pip install -q -r requirements.txt 2>/dev/null || true

# Start uvicorn - exec replaces this shell process with uvicorn
exec python -m uvicorn main:app --host 0.0.0.0 --port 8000 --log-level info
