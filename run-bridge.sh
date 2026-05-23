#!/bin/bash
# Persistent bridge runner - keeps Baileys bridge alive with auto-restart
BRIDGE_DIR="/home/z/hermes-agent"
SESSION_DIR="$HOME/.hermes/whatsapp/session"
PORT=3001
LOG="/tmp/bridge-persistent.log"

mkdir -p "$SESSION_DIR"

echo "[$(date)] Starting persistent bridge on port $PORT..." > "$LOG"

while true; do
  cd "$BRIDGE_DIR"
  echo "[$(date)] Starting bridge..." >> "$LOG"
  node scripts/whatsapp-bridge/bridge.js --port $PORT --session "$SESSION_DIR" >> "$LOG" 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Bridge exited with code $EXIT_CODE. Restarting in 3s..." >> "$LOG"
  sleep 3
done
