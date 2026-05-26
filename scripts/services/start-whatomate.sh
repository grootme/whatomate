#!/bin/bash
# Whatomate Services Starter
# Starts Go backend + Vue.js frontend

BACKEND_LOG="/tmp/whatomate-backend.log"
FRONTEND_LOG="/tmp/whatomate-frontend.log"

echo "[Whatomate] Starting all services..."

# Start Go Backend
echo "[Whatomate] Starting Go backend on port 8080..."
cd /home/z/my-project
./whatomate server -config config.example.toml -workers 0 >> "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "[Whatomate] Backend PID: $BACKEND_PID"

# Wait for backend to be ready
for i in $(seq 1 15); do
    if curl -s -o /dev/null http://localhost:8080/ 2>/dev/null; then
        echo "[Whatomate] Backend is ready!"
        break
    fi
    sleep 1
done

# Start Vue.js Frontend
echo "[Whatomate] Starting Vue.js frontend on port 3000..."
cd /home/z/my-project/frontend
npx vite --host 0.0.0.0 --port 3000 >> "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo "[Whatomate] Frontend PID: $FRONTEND_PID"

# Wait for frontend to be ready
for i in $(seq 1 15); do
    if curl -s -o /dev/null http://localhost:3000/ 2>/dev/null; then
        echo "[Whatomate] Frontend is ready!"
        break
    fi
    sleep 1
done

echo "[Whatomate] All services started!"
echo "[Whatomate] Backend:  http://localhost:8080 (PID: $BACKEND_PID)"
echo "[Whatomate] Frontend: http://localhost:3000 (PID: $FRONTEND_PID)"
echo "[Whatomate] External: http://localhost:81 (via Caddy proxy)"

# Keep script alive - monitor processes
while true; do
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo "[Whatomate] Backend died, restarting..."
        cd /home/z/my-project
        ./whatomate server -config config.example.toml -workers 0 >> "$BACKEND_LOG" 2>&1 &
        BACKEND_PID=$!
    fi
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "[Whatomate] Frontend died, restarting..."
        cd /home/z/my-project/frontend
        npx vite --host 0.0.0.0 --port 3000 >> "$FRONTEND_LOG" 2>&1 &
        FRONTEND_PID=$!
    fi
    sleep 5
done
