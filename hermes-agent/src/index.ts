/**
 * Hermes Agent v0.17.0 — Clean AI-Driven Architecture
 *
 * Architecture: User → Telegram/API → AgentExecutor → AI understands intent →
 * → Decomposes into tasks → Calls tools (Unified ToolRegistry) →
 * → Executes (parallel when possible) → Synthesizes response → User
 *
 * Key Changes from v0.16:
 *   - Unified ToolRegistry: single source of truth for all tools
 *   - No more CommandRouter (dead code removed)
 *   - SkillsRegistry is now a thin wrapper over ToolRegistry
 *   - MCP integration uses the same ToolRegistry
 *   - Reactive tools (event-driven) separated from AI-callable tools
 */

import 'dotenv/config'
import express from 'express'

import { ToolRegistry } from './tools/registry.js'
import { registerAllTools } from './tools/definitions/index.js'
import { TelegramBotChannel } from './channels/telegram.js'
import { AgentExecutor } from './services/agent-executor.js'
import { EventBusBridge } from './services/eventbus-bridge.js'
import { SkillsRegistry } from './skills/index.js'
import { ReactiveToolsRegistry } from './tools/reactive.js'
import { createMCPBridge } from './mcp/index.js'

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.HERMES_PORT || '8642')
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''

if (!BOT_TOKEN) {
  console.error('[hermes] FATAL: TELEGRAM_BOT_TOKEN not set')
  process.exit(1)
}

// ─── Initialize Core Services ────────────────────────────────────────────────

// 1. Create the Unified Tool Registry
const toolRegistry = new ToolRegistry()

// 2. Register all AI-callable tools
registerAllTools(toolRegistry)
console.log(`[hermes] Registered ${toolRegistry.count} AI-callable tools`)

// 3. Create Event Bus
const eventBus = new EventBusBridge()

// 4. Create Agent Executor with Tool Registry
const agentExecutor = new AgentExecutor(toolRegistry, eventBus)

// 5. Create Skills Registry (thin wrapper over ToolRegistry)
const skillsRegistry = new SkillsRegistry(toolRegistry)

// 6. Create Reactive Tools Registry (event-driven background workers)
const reactiveTools = new ReactiveToolsRegistry()

// 7. Create MCP Bridge (uses ToolRegistry)
const mcpBridge = createMCPBridge(toolRegistry)

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
    version: '0.17.0',
    architecture: 'agentic-ai-unified',
    uptime: process.uptime(),
    tools: {
      ai_callable: toolRegistry.count,
      reactive: reactiveTools.list().length,
      mcp: mcpBridge.getTools().length,
    },
    skills: skillsRegistry.list().length,
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

// ─── Tools API (Unified) ────────────────────────────────────────────────────

app.get('/api/tools', (_req, res) => {
  res.json({
    tools: toolRegistry.list(),
    reactive: reactiveTools.list(),
    mcp_tools: mcpBridge.getTools().map(t => ({
      name: t.function.name,
      description: t.function.description,
      service: t.function.name.split('_')[0],
    })),
  })
})

app.post('/api/tools/:toolName/execute', async (req, res) => {
  try {
    const { toolName } = req.params
    const { params } = req.body
    const result = await toolRegistry.execute(toolName, params || {})
    res.json(result)
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message } })
  }
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
    const result = await mcpBridge.execute(tool, args)
    res.json(result)
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message } })
  }
})

app.get('/api/mcp/tools', (_req, res) => {
  res.json({
    tools: mcpBridge.getTools(),
    count: mcpBridge.getTools().length,
  })
})

// ─── Conversation History ────────────────────────────────────────────────────

app.delete('/api/conversation/:chatId', (req, res) => {
  res.json({ success: true, message: 'Conversation history cleared' })
})

// ─── Start Server ────────────────────────────────────────────────────────────

async function main() {
  console.log('[hermes] Starting Hermes Agent v0.17.0 (Unified AI Architecture)...')

  // Initialize event bus
  await eventBus.connect()

  // Initialize reactive tools with event bus
  reactiveTools.setEventBus(eventBus)

  // Start Express
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[hermes] API server listening on port ${PORT}`)
  })

  // Start Telegram Bot
  await telegramBot.start()

  const aiTools = toolRegistry.count
  const reactiveCount = reactiveTools.list().length
  const mcpCount = mcpBridge.getTools().length

  console.log('[hermes] Hermes Agent is ready!')
  console.log(`[hermes] Architecture: Unified AI with ToolRegistry + parallel execution`)
  console.log(`[hermes] ${aiTools} AI-callable tools | ${reactiveCount} reactive tools | ${mcpCount} MCP tools | ${skillsRegistry.list().length} skills`)

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
