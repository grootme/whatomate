#!/bin/bash
while true; do
  cd /home/z/hermes-agent
  node scripts/whatsapp-bridge/bridge.js --port 3001 --session ~/.hermes/whatsapp/session 2>&1
  sleep 5
done
