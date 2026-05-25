/**
 * Hermes Agent v0.15.0 — Telegram Bot & Ecosystem Orchestrator
 *
 * The central nervous system of the Whatomate platform.
 * Receives user commands from Telegram bot and routes them through
 * the full ecosystem: Telethon, Shadowbroker, DeerFlow, Cognitive API.
 *
 * Architecture:
 *   User → Telegram Bot → Hermes Agent → Ecosystem Services → AI Analysis → Response
 *
 * Commands:
 *   "analiza mis grupos"    → Full Telegram group analysis via Telethon + AI
 *   "lista mis grupos"      → List all Telegram groups with participants
 *   "busca [término]"       → Search messages across all groups
 *   "reporte shadowbroker"  → Generate Shadowbroker OSINT report
 *   "reporte [tema]"        → Generate AI report on any topic
 *   "estado"                → Ecosystem health check
 *   Any other text          → AI chat via OpenRouter
 */

import 'dotenv/config'
import express from 'express'

import { TelegramBot } from './channels/telegram.js'
import { CommandRouter } from './services/command-router.js'
import { EventBusBridge } from './services/eventbus-bridge.js'
import { SkillsRegistry } from './skills/index.js'
import { ToolsRegistry } from './tools/index.js'

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.HERMES_PORT || '8642')
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''

if (!BOT_TOKEN) {
  console.error('[hermes] FATAL: TELEGRAM_BOT_TOKEN not set')
  process.exit(1)
}

// ─── Express API Server ──────────────────────────────────────────────────────

const app = express()
app.use((req, res, next) => { res.header('Access-Control-Allow-Origin', '*'); res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS'); res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization'); if (req.method === 'OPTIONS') return res.sendStatus(200); next(); })
app.use(express.json({ limit: '10mb' }))

// ─── Initialize Services ─────────────────────────────────────────────────────

const skillsRegistry = new SkillsRegistry()
const toolsRegistry = new ToolsRegistry()
const eventBus = new EventBusBridge()
const commandRouter = new CommandRouter(skillsRegistry, toolsRegistry, eventBus)
const telegramBot = new TelegramBot(BOT_TOKEN, commandRouter)

// ─── Health Check ────────────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
  const ecosystem = await commandRouter.checkEcosystem()
  res.json({
    status: 'ok',
    service: 'hermes-agent',
    version: '0.15.0',
    uptime: process.uptime(),
    skills: skillsRegistry.list().length,
    tools: toolsRegistry.list().length,
    ecosystem,
  })
})

// ─── Chat Completions (OpenAI-compatible) ────────────────────────────────────

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { messages, model, temperature, max_tokens } = req.body
    const result = await commandRouter.chatCompletion(messages, { model, temperature, max_tokens })
    res.json(result)
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message } })
  }
})

// ─── Channel Send API ────────────────────────────────────────────────────────

app.post('/api/channels/:channelType/send', async (req, res) => {
  try {
    const { channelType } = req.params
    const { recipientId, message } = req.body

    if (channelType === 'telegram') {
      await telegramBot.sendMessage(recipientId, message)
      res.json({ success: true })
    } else {
      res.status(400).json({ error: `Unknown channel type: ${channelType}` })
    }
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message } })
  }
})

// ─── Command API ─────────────────────────────────────────────────────────────

app.post('/api/command', async (req, res) => {
  try {
    const { command, chat_id, args } = req.body
    const result = await commandRouter.processCommand(command, chat_id, args)
    res.json(result)
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message } })
  }
})

// ─── Skills API ──────────────────────────────────────────────────────────────

app.get('/api/skills', (_req, res) => {
  res.json({ skills: skillsRegistry.list() })
})

app.post('/api/skills/:skillId/execute', async (req, res) => {
  try {
    const { skillId } = req.params
    const { params } = req.body
    const result = await skillsRegistry.execute(skillId, params)
    res.json(result)
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message } })
  }
})

// ─── Tools API ───────────────────────────────────────────────────────────────

app.get('/api/tools', (_req, res) => {
  res.json({ tools: toolsRegistry.list() })
})

// ─── Ecosystem Status ────────────────────────────────────────────────────────

app.get('/api/ecosystem', async (_req, res) => {
  const status = await commandRouter.checkEcosystem()
  res.json(status)
})

// ─── Event Bus Status ────────────────────────────────────────────────────────

app.get('/api/events', async (_req, res) => {
  const status = await eventBus.getStatus()
  res.json(status)
})

// ─── MCP Bridge ──────────────────────────────────────────────────────────────

app.post('/api/mcp/call', async (req, res) => {
  try {
    const { tool, arguments: args } = req.body
    const result = await commandRouter.executeMCPTool(tool, args)
    res.json(result)
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message } })
  }
})

// ─── Start Server ────────────────────────────────────────────────────────────

async function main() {
  console.log('[hermes] Starting Hermes Agent v0.15.0...')

  // Initialize event bus
  await eventBus.connect()

  // Initialize tools with event bus
  toolsRegistry.setEventBus(eventBus)

  // Start Express
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[hermes] API server listening on port ${PORT}`)
  })

  // Start Telegram Bot
  await telegramBot.start()

  console.log('[hermes] Hermes Agent is ready!')
  console.log(`[hermes] ${skillsRegistry.list().length} skills, ${toolsRegistry.list().length} tools loaded`)

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[hermes] Shutting down...')
    await telegramBot.stop()
    await eventBus.disconnect()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[hermes] Fatal error:', err)
  process.exit(1)
})
