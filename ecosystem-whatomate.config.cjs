/**
 * Whatomate Intelligence Ecosystem — PM2 Process Manager Configuration
 *
 * Start all:   pm2 start ecosystem-whatomate.config.cjs
 * Stop all:    pm2 stop ecosystem-whatomate.config.cjs
 * Status:      pm2 status
 * Logs:        pm2 logs
 *
 * Service Ports:
 *   6379  — Redis Server
 *   3000  — Next.js Frontend (already running via bun)
 *   8000  — Shadowbroker OSINT (Python/FastAPI)
 *   8645  — Cognitive Capital API (Node.js/Redis)
 *   8680  — Agent Mission Groups (Node.js/Redis)
 *   8700  — Telethon Service (Python/FastAPI)
 */

const fs = require('fs')
const path = require('path')

// Load secrets
let secrets = {}
try {
  const secretsPath = path.join(__dirname, '.env.secrets')
  const secretsContent = fs.readFileSync(secretsPath, 'utf8')
  for (const line of secretsContent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=')
      if (key && valueParts.length > 0) {
        secrets[key.trim()] = valueParts.join('=').trim()
      }
    }
  }
} catch {
  console.warn('[ecosystem] .env.secrets not found')
}

module.exports = {
  apps: [
    // ─── 1. Redis Server ─────────────────────────────────────────────────
    {
      name: 'redis',
      script: '/home/z/.local/bin/redis-server',
      args: '--port 6379 --dir /tmp --pidfile /tmp/redis.pid',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },

    // ─── 2. Shadowbroker OSINT Backend (port 8000) ──────────────────────
    {
      name: 'osint',
      cwd: '/home/z/my-project/shadowbroker-osint',
      script: '/home/z/.venv/bin/python3',
      args: '-m uvicorn main:app --host 0.0.0.0 --port 8000',
      interpreter: 'none',
      env: {
        NASA_FIRMS_MAP_KEY: '48f3d852d3a84cf043ad1a08c07c2146',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        PYTHONUNBUFFERED: '1',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 10000,
      wait_ready: false,
      listen_timeout: 60000,
    },

    // ─── 3. Cognitive Capital API (port 8645) ────────────────────────────
    {
      name: 'cognitive-api',
      cwd: '/home/z/my-project/cognitive-service',
      script: 'index.ts',
      interpreter: '/home/z/.npm-global/bin/tsx',
      env: {
        COGNITIVE_API_PORT: '8645',
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },

    // ─── 4. Agent Mission Groups (port 8680) ────────────────────────────
    {
      name: 'agent-missions',
      cwd: '/home/z/my-project/agent-missions',
      script: 'index.ts',
      interpreter: '/home/z/.npm-global/bin/tsx',
      env: {
        MISSION_PORT: '8680',
        OSINT_URL: 'http://localhost:8000/api/live-data',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },

    // ─── 5. Telethon Service (port 8700) ────────────────────────────────
    {
      name: 'telethon',
      cwd: '/home/z/my-project/telethon-service',
      script: '/home/z/.venv/bin/python3',
      args: '-m uvicorn server:app --host 0.0.0.0 --port 8700',
      interpreter: 'none',
      env: {
        PYTHONUNBUFFERED: '1',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },

    // ─── 6. WhatsApp Bridge (port 3001) ──────────────────────────────────
    {
      name: 'whatsapp-bridge',
      cwd: '/home/z/my-project/hermes-agent/whatsapp-bridge',
      script: 'bridge.cjs',
      interpreter: 'node',
      env: {
        PORT: '3001',
        NODE_ENV: 'production',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
}
