#!/bin/bash
# Keep-alive wrapper for services
# Usage: bash /home/z/my-project/services.sh start|stop|status

LOCKDIR="/tmp/whatomate-services"
mkdir -p "$LOCKDIR"

start_bridge() {
  echo "Starting WhatsApp Baileys bridge on port 3001..."
  cd /home/z/hermes-agent
  while true; do
    node scripts/whatsapp-bridge/bridge.js --port 3001 --session ~/.hermes/whatsapp/session 2>&1
    echo "[bridge] Exited, restarting in 3s..."
    sleep 3
  done &
  echo $! > "$LOCKDIR/bridge.pid"
}

start_next() {
  echo "Starting Next.js proxy on port 3000..."
  cd /home/z/my-project
  npx next dev --port 3000 2>&1 &
  echo $! > "$LOCKDIR/next.pid"
}

stop_all() {
  for f in bridge.pid next.pid; do
    if [ -f "$LOCKDIR/$f" ]; then
      PID=$(cat "$LOCKDIR/$f")
      kill -TERM -- -$PID 2>/dev/null || kill $PID 2>/dev/null || true
      rm "$LOCKDIR/$f"
    fi
  done
  pkill -f "bridge.js" 2>/dev/null || true
  pkill -f "next-server" 2>/dev/null || true
}

status() {
  echo "Bridge PID: $(cat $LOCKDIR/bridge.pid 2>/dev/null || echo 'not running')"
  echo "Next.js PID: $(cat $LOCKDIR/next.pid 2>/dev/null || echo 'not running')"
  ss -tlnp | grep -E "300[01]"
}

case "$1" in
  start)
    stop_all
    start_bridge
    sleep 3
    start_next
    echo "Services started. Use '$0 status' to check."
    ;;
  stop)
    stop_all
    echo "Services stopped."
    ;;
  status)
    status
    ;;
  *)
    echo "Usage: $0 {start|stop|status}"
    ;;
esac
