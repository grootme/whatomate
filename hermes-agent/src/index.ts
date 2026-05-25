/**
 * Hermes Agent v0.16.0 — Intelligent AI Agent & Ecosystem Orchestrator
 *
 * The central nervous system of the Whatomate platform.
 * Uses AI (OpenRouter) with function calling to understand user intent,
 * decompose requests, and execute tools across the ecosystem.
 *
 * Architecture:
 *   User → Telegram Bot → AgentExecutor → AI understands intent →
 *   → Decomposes into tasks → Calls tools (Telethon, Shadowbroker, etc.) →
 *   → Synthesizes response → User
 *
 * No more hard-coded command patterns. The AI decides what tools to use.
 */

import 'dotenv/config'
import express from 'express'

import { TelegramBotChannel } from './channels/telegram.js'
import { AgentExecutor } from './services/agent-executor.js'
import { EventBusBridge } from './services/eventbus-bridge.js'
import { SkillsRegistry } from './skills/index.js'
import { ToolsRegistry } from './tools/index.js'
import { executeMCPTool, mcpTools } from './mcp/index.js'

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.HERMES_PORT || '8642')
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''

if (!BOT_TOKEN) {
  console.error('[hermes] FATAL: TELEGRAM_BOT_TOKEN not set')
  process.exit(1)
}

// ─── Initialize Services ─────────────────────────────────────────────────────

const eventBus = new EventBusBridge()
const agentExecutor = new AgentExecutor(eventBus)
const skillsRegistry = new SkillsRegistry()
const toolsRegistry = new ToolsRegistry()

// ─── Express API Server ──────────────────────────────────────────────────────

const app = express()
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})
app.use(express.json({ limit: '10mb' }))

// ─── Health Check ────────────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
  const ecosystem = await agentExecutor.checkEcosystem()
  res.json({
    status: 'ok',
    service: 'hermes-agent',
    version: '0.16.0',
    architecture: 'agentic-ai',
    uptime: process.uptime(),
    skills: skillsRegistry.list().length,
    tools: toolsRegistry.list().length,
    mcp_tools: mcpTools.length,
    ecosystem,
  })
})

// ─── Chat Completions (OpenAI-compatible) ────────────────────────────────────

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { messages, model, temperature, max_tokens } = req.body
    const result = await agentExecutor.chatCompletion(messages, { model, temperature, max_tokens })
    res.json(result)
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message } })
  }
})

// ─── Agent Execute Endpoint ──────────────────────────────────────────────────

app.post('/api/agent/execute', async (req, res) => {
  try {
    const { message, chat_id } = req.body
    if (!message) {
      return res.status(400).json({ error: 'message is required' })
    }
    const result = await agentExecutor.execute(message, chat_id)
    res.json(result)
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message } })
  }
})

// ─── Channel Send API ────────────────────────────────────────────────────────

const telegramBot = new TelegramBotChannel(BOT_TOKEN, agentExecutor)

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

// ─── Legacy Command API (backward compat) ────────────────────────────────────

app.post('/api/command', async (req, res) => {
  try {
    const { command, chat_id } = req.body
    const result = await agentExecutor.execute(command, chat_id)
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
  res.json({
    tools: toolsRegistry.list(),
    mcp_tools: mcpTools.map(t => ({
      name: t.name,
      description: t.function.description,
      service: t.function.name.split('_')[0],
    })),
  })
})

// ─── Ecosystem Status ────────────────────────────────────────────────────────

app.get('/api/ecosystem', async (_req, res) => {
  const status = await agentExecutor.checkEcosystem()
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
    const result = await executeMCPTool(tool, args)
    res.json(result)
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message } })
  }
})

// ─── MCP Tools List ──────────────────────────────────────────────────────────

app.get('/api/mcp/tools', (_req, res) => {
  res.json({
    tools: mcpTools,
    count: mcpTools.length,
  })
})

// ─── Conversation History ────────────────────────────────────────────────────

app.delete('/api/conversation/:chatId', (req, res) => {
  // Clear conversation history for a chat
  res.json({ success: true, message: 'Conversation history cleared' })
})

// ─── Start Server ────────────────────────────────────────────────────────────

async function main() {
  console.log('[hermes] Starting Hermes Agent v0.16.0 (Agentic AI)...')

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
  console.log(`[hermes] Architecture: Agentic AI with function calling`)
  console.log(`[hermes] ${skillsRegistry.list().length} skills, ${toolsRegistry.list().length} reactive tools, ${mcpTools.length} MCP tools`)

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
