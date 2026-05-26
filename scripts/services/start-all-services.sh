#!/bin/bash
# Start all Whatomate ecosystem services

echo "Starting Whatomate ecosystem services..."

# WhatsApp Bridge
cd /home/z/my-project/frontend
node whatsapp-bridge-stub.cjs &
BRIDGE_PID=$!
echo "WhatsApp Bridge: PID $BRIDGE_PID (port 3001)"

# Hermes Agent
cd /home/z/hermes-agent
npx tsx src/index.ts &
HERMES_PID=$!
echo "Hermes Agent: PID $HERMES_PID (port 8642)"

# Shadowbroker
cd /home/z/shadowbroker
npx tsx src/index.ts &
SHADOW_PID=$!
echo "Shadowbroker: PID $SHADOW_PID (port 8660)"

# Wait for startup
sleep 8

# Verify
echo ""
echo "=== Service Status ==="
for svc in "Bridge:3001" "Hermes:8642" "Shadowbroker:8660"; do
    name="${svc%%:*}"
    port="${svc##*:}"
    if curl -s -m 2 "http://localhost:$port/health" > /dev/null 2>&1; then
        echo "  $name (port $port): OK"
    else
        echo "  $name (port $port): FAILED"
    fi
done

echo ""
echo "All services started. Press Ctrl+C to stop."

# Wait for any child to exit
wait
