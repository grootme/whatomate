#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# Whatomate Platform — Development Startup Script
# Starts all services needed for the Vue.js frontend with Hermes + DeerFlow
# ══════════════════════════════════════════════════════════════════════════════
set -e

PROJECT_DIR="/home/z/my-project"
HERMES_DIR="/home/z/hermes-agent"
BRIDGE_DIR="/home/z/hermes-agent/scripts/whatsapp-bridge"
PIDDIR="/tmp/whatomate-dev"

mkdir -p "$PIDDIR"

# ─── Colors ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[whatomate]${NC} $1"; }
warn() { echo -e "${YELLOW}[whatomate]${NC} $1"; }
info() { echo -e "${CYAN}[whatomate]${NC} $1"; }
err()  { echo -e "${RED}[whatomate]${NC} $1"; }

# ─── Cleanup ─────────────────────────────────────────────────────────────────
cleanup() {
  echo ""
  log "Shutting down all services..."
  for pidfile in "$PIDDIR"/*.pid; do
    if [ -f "$pidfile" ]; then
      PID=$(cat "$pidfile")
      kill "$PID" 2>/dev/null || true
      rm -f "$pidfile"
    fi
  done
  # Also kill by process pattern to be thorough
  pkill -f "cognitive-api-server" 2>/dev/null || true
  pkill -f "bridge.js" 2>/dev/null || true
  pkill -f "vite" 2>/dev/null || true
  log "All services stopped."
  exit 0
}

trap cleanup SIGINT SIGTERM

# ─── Stop any previous runs ──────────────────────────────────────────────────
log "Cleaning up previous instances..."
for pidfile in "$PIDDIR"/*.pid; do
  if [ -f "$pidfile" ]; then
    PID=$(cat "$pidfile")
    kill "$PID" 2>/dev/null || true
    rm -f "$pidfile"
  fi
done
pkill -f "cognitive-api-server" 2>/dev/null || true
pkill -f "bridge.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
sleep 1

echo ""
info "═══════════════════════════════════════════════════════════════"
info "  Whatomate Platform — Dev Mode"
info "═══════════════════════════════════════════════════════════════"
echo ""

# ─── 1. Cognitive Capital API (port 8645) ────────────────────────────────────
log "[1/3] Starting Cognitive Capital API on port 8645..."
cd "$PROJECT_DIR/frontend"
npx tsx cognitive-api-server.ts > /tmp/whatomate-cognitive.log 2>&1 &
echo $! > "$PIDDIR/cognitive.pid"
sleep 1

# Check it started
if curl -s http://localhost:8645/health > /dev/null 2>&1; then
  log "  ✓ Cognitive API is running"
else
  warn "  ⚠ Cognitive API may still be starting..."
fi

# ─── 2. WhatsApp Baileys Bridge (port 3001) ──────────────────────────────────
log "[2/3] Starting WhatsApp Baileys Bridge on port 3001..."
cd "$BRIDGE_DIR"
node bridge.js --port 3001 --session ~/.hermes/whatsapp/session > /tmp/whatomate-bridge.log 2>&1 &
echo $! > "$PIDDIR/bridge.pid"
sleep 2

# Check it started
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
  log "  ✓ WhatsApp Bridge is running"
else
  warn "  ⚠ WhatsApp Bridge may still be starting (generating QR code)..."
fi

# ─── 3. Vue.js Frontend — Vite Dev Server (port 3000) ────────────────────────
log "[3/3] Starting Vue.js Frontend on port 3000..."
cd "$PROJECT_DIR/frontend"
npx vite --host 0.0.0.0 --port 3000 > /tmp/whatomate-frontend.log 2>&1 &
echo $! > "$PIDDIR/frontend.pid"
sleep 3

# Check it started
if curl -s http://localhost:3000 > /dev/null 2>&1; then
  log "  ✓ Frontend is running"
else
  warn "  ⚠ Frontend may still be starting..."
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
info "═══════════════════════════════════════════════════════════════"
info "  All Services Started!"
info "═══════════════════════════════════════════════════════════════"
echo ""
log "  Frontend:          http://localhost:3000"
log "  WhatsApp Bridge:   http://localhost:3001"
log "  Cognitive API:     http://localhost:8645"
echo ""
log "  Vite Proxy Routes:"
log "    /api/*           → http://localhost:8080 (Go Backend)"
log "    /hermes-api/*    → http://localhost:8642 (Hermes API)"
log "    /hermes-bridge/* → http://localhost:3001 (WhatsApp Bridge)"
log "    /hermes-dashboard/* → http://localhost:9119 (Dashboard)"
log "    /deerflow-api/*  → http://localhost:8001 (DeerFlow)"
log "    /cognitive-api/* → http://localhost:8645 (Cognitive)"
echo ""
log "  Logs:"
log "    Frontend:  /tmp/whatomate-frontend.log"
log "    Bridge:    /tmp/whatomate-bridge.log"
log "    Cognitive: /tmp/whatomate-cognitive.log"
echo ""
warn "  Press Ctrl+C to stop all services"
echo ""

# Wait for any child process to exit
wait
