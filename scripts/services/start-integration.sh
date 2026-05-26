#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# Whatomate + Hermes + DeerFlow — Unified Startup Script
# ══════════════════════════════════════════════════════════════════════════════
set -e

PROJECT_DIR="/home/z/my-project"
HERMES_DIR="/home/z/hermes-agent"
DEERFLOW_DIR="/home/z/deer-flow"

echo "═══════════════════════════════════════════════════════════════"
echo "  Whatomate Platform — Full Integration Startup"
echo "═══════════════════════════════════════════════════════════════"

# Kill any existing processes
echo "[1/7] Cleaning up existing processes..."
pkill -f "cognitive-api-server" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "whatomate" 2>/dev/null || true
pkill -f "bridge.js" 2>/dev/null || true
pkill -f "hermes" 2>/dev/null || true
pkill -f "deerflow" 2>/dev/null || true
sleep 1

# 1. Start Whatomate Go Backend
echo "[2/7] Starting Whatomate Go Backend (port 8080)..."
cd "$PROJECT_DIR"
if [ -f ./whatomate ]; then
    ./whatomate server &
    BACKEND_PID=$!
    echo "  → Backend PID: $BACKEND_PID"
else
    echo "  → Building backend..."
    go build -o whatomate ./cmd/whatomate/
    ./whatomate server &
    BACKEND_PID=$!
    echo "  → Backend PID: $BACKEND_PID"
fi
sleep 2

# 2. Start Cognitive Capital API
echo "[3/7] Starting Cognitive Capital API (port 8645)..."
cd "$PROJECT_DIR/frontend"
npx tsx cognitive-api-server.ts &
COGNITIVE_PID=$!
echo "  → Cognitive API PID: $COGNITIVE_PID"
sleep 1

# 3. Start Hermes WhatsApp Bridge (Baileys)
echo "[4/7] Starting Hermes WhatsApp Bridge (port 3001)..."
cd "$HERMES_DIR"
node scripts/whatsapp-bridge/bridge.js --port 3001 --session ~/.hermes/whatsapp/session &
BRIDGE_PID=$!
echo "  → Bridge PID: $BRIDGE_PID"
sleep 2

# 4. Start Hermes Agent Gateway
echo "[5/7] Starting Hermes Agent Gateway (port 8642)..."
cd "$HERMES_DIR"
# Source the .env
if [ -f ~/.hermes/.env ]; then
    export $(grep -v '^#' ~/.hermes/.env | xargs)
fi
python -m hermes_cli.main gateway --whatsapp &
HERMES_PID=$!
echo "  → Hermes PID: $HERMES_PID"
sleep 3

# 5. Start DeerFlow Gateway
echo "[6/7] Starting DeerFlow Gateway (port 8001)..."
cd "$DEERFLOW_DIR"
python -m deerflow.main gateway &
DEERFLOW_PID=$!
echo "  → DeerFlow PID: $DEERFLOW_PID"
sleep 3

# 6. Start Vue.js Frontend (Vite dev server)
echo "[7/7] Starting Vue.js Frontend (port 3000)..."
cd "$PROJECT_DIR/frontend"
npx vite --host 0.0.0.0 &
FRONTEND_PID=$!
echo "  → Frontend PID: $FRONTEND_PID"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  All Services Running!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Frontend:          http://localhost:3000"
echo "  Go Backend:        http://localhost:8080"
echo "  Hermes API:        http://localhost:8642"
echo "  Hermes Dashboard:  http://localhost:9119"
echo "  WhatsApp Bridge:   http://localhost:3001"
echo "  DeerFlow Gateway:  http://localhost:8001"
echo "  Cognitive API:     http://localhost:8645"
echo ""
echo "  PIDs: Backend=$BACKEND_PID | Cognitive=$COGNITIVE_PID | Bridge=$BRIDGE_PID | Hermes=$HERMES_PID | DeerFlow=$DEERFLOW_PID | Frontend=$FRONTEND_PID"
echo ""
echo "  Press Ctrl+C to stop all services"
echo ""

# Wait for any process to exit
wait
