/**
 * Whatomate Ecosystem — PM2 Process Manager Configuration
 *
 * Start all services:  pm2 start ecosystem.config.cjs
 * Stop all:           pm2 stop ecosystem.config.cjs
 * Restart:            pm2 restart ecosystem.config.cjs
 * Status:             pm2 status
 * Logs:               pm2 logs
 *
 * Service Ports:
 *   3000  — Vue.js Frontend (Vite)
 *   3001  — WhatsApp Bridge (stub)
 *   8642  — Hermes Agent (Telegram bot + orchestrator)
 *   8645  — Cognitive Capital API
 *   8660  — Shadowbroker AI Bridge
 *   8700  — Telethon Service (Python)
 *   6379  — Redis Server
 */

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

    // ─── 2. Cognitive Capital API (port 8645) ────────────────────────────
    {
      name: 'cognitive-api',
      cwd: '/home/z/my-project/frontend',
      script: 'cognitive-api-server.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      env: {
        COGNITIVE_API_PORT: '8645',
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
    },

    // ─── 3. WhatsApp Bridge Stub (port 3001) ────────────────────────────
    {
      name: 'whatsapp-bridge',
      cwd: '/home/z/my-project/frontend',
      script: 'whatsapp-bridge-stub.cjs',
      interpreter: 'node',
      env: {
        PORT: '3001',
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },

    // ─── 4. Shadowbroker AI Bridge (port 8660) ──────────────────────────
    {
      name: 'shadowbroker',
      cwd: '/home/z/my-project/frontend',
      script: 'shadowbroker-ai-bridge.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      env: {
        BRIDGE_PORT: '8660',
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
        REDIS_URL: 'redis://localhost:6379',
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
    },

    // ─── 5. Telethon Service (port 8700) ────────────────────────────────
    {
      name: 'telethon-service',
      cwd: '/home/z/my-project/telethon-service',
      script: 'python3 -m uvicorn server:app --host 0.0.0.0 --port 8700 --log-level info',
      interpreter: 'none',
      env: {
        PYTHONUNBUFFERED: '1',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
    },

    // ─── 6. Hermes Agent (port 8642) ────────────────────────────────────
    {
      name: 'hermes-agent',
      cwd: '/home/z/my-project/hermes-agent',
      script: 'src/index.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      env: {
        HERMES_PORT: '8642',
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
        TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
        TELETHON_URL: 'http://localhost:8700',
        SHADOWBROKER_URL: 'http://localhost:8660',
        COGNITIVE_URL: 'http://localhost:8645',
        DEERFLOW_URL: 'http://localhost:8000',
        WHATSAPP_BRIDGE_URL: 'http://localhost:3001',
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
        REDIS_URL: 'redis://localhost:6379',
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
    },

    // ─── 7. Vue.js Frontend (port 3000) ─────────────────────────────────
    {
      name: 'frontend',
      cwd: '/home/z/my-project/frontend',
      script: 'node_modules/.bin/vite',
      args: '--host 0.0.0.0 --port 3000',
      env: {
        NODE_ENV: 'development',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
}
