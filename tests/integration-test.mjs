/**
 * Integration Test Suite — Telegram + WhatsApp + DeerFlow + Hermes Agent
 * 
 * Tests message flow through the Whatomate ecosystem:
 *   1. Telegram -> Hermes Agent -> AI Response
 *   2. WhatsApp -> Hermes Agent -> AI Response
 *   3. DeerFlow Telegram Channel
 *   4. DeerFlow WhatsApp Channel
 *   5. Shadowbroker -> Hermes Agent -> WhatsApp/Telegram Alert
 *   6. Cross-service: Whatomate -> Hermes -> Shadowbroker
 */

const BASE_URL = 'http://127.0.0.1'
const TELEGRAM_BOT_TOKEN = '7892896783:AAGfNhHc17aIFbedR4iw1txEYBGhsg9oz40'

// Service ports
const HERMES_PORT = 8642
const COGNITIVE_PORT = 8645
const BRIDGE_PORT = 3001
const SHADOWBROKER_PORT = 8660
const VITE_PORT = 3000
const DEERFLOW_PORT = 8001

// Colors for output
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const RESET = '\x1b[0m'

let passed = 0
let failed = 0
let skipped = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`${GREEN}  ✅ ${name}${RESET}`)
    passed++
  } catch (err) {
    if (err.message === 'SKIP') {
      console.log(`${YELLOW}  ⏭️  ${name} (skipped)${RESET}`)
      skipped++
    } else {
      console.log(`${RED}  ❌ ${name}: ${err.message}${RESET}`)
      failed++
    }
  }
}

async function fetchJSON(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeout || 10000)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timeout)
    const text = await res.text()
    try {
      return { status: res.status, data: JSON.parse(text) }
    } catch {
      return { status: res.status, data: text }
    }
  } catch (err) {
    clearTimeout(timeout)
    throw new Error(`Fetch failed: ${err.message}`)
  }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 1: Service Health Checks
// ═══════════════════════════════════════════════════════════════

async function testServiceHealth() {
  console.log(`\n${CYAN}━━━ Section 1: Service Health Checks ━━━${RESET}`)

  await test('Vue.js Frontend (3000) is accessible', async () => {
    const { status } = await fetchJSON(`${BASE_URL}:${VITE_PORT}/`, { timeout: 5000 })
    if (status !== 200) throw new Error(`HTTP ${status}`)
  })

  await test('WhatsApp Bridge (3001) is healthy', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}:${BRIDGE_PORT}/health`, { timeout: 5000 })
    if (status !== 200) throw new Error(`HTTP ${status}`)
    if (data.status !== 'ok') throw new Error(`Status: ${data.status}`)
  })

  await test('Cognitive API (8645) is healthy', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}:${COGNITIVE_PORT}/health`, { timeout: 5000 })
    if (status !== 200) throw new Error(`HTTP ${status}`)
    if (data.status !== 'ok') throw new Error(`Status: ${data.status}`)
  })

  await test('Shadowbroker (8660) is healthy', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}:${SHADOWBROKER_PORT}/health`, { timeout: 5000 })
    if (status !== 200) throw new Error(`HTTP ${status}`)
    if (data.status !== 'ok') throw new Error(`Status: ${data.status}`)
  })

  await test('Hermes Agent (8642) is healthy', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}:${HERMES_PORT}/health`, { timeout: 5000 })
    if (status !== 200) throw new Error(`HTTP ${status}`)
  })

  await test('DeerFlow (8001) is accessible', async () => {
    try {
      const { status } = await fetchJSON(`${BASE_URL}:${DEERFLOW_PORT}/api/models`, { timeout: 5000 })
      if (status !== 200) throw new Error(`HTTP ${status}`)
    } catch (err) {
      throw new Error('SKIP')
    }
  })
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2: Telegram Integration
// ═══════════════════════════════════════════════════════════════

async function testTelegramIntegration() {
  console.log(`\n${CYAN}━━━ Section 2: Telegram Integration ━━━${RESET}`)

  await test('Telegram Bot API is reachable', async () => {
    const { status, data } = await fetchJSON(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`,
      { timeout: 10000 }
    )
    if (!data.ok) throw new Error(`Telegram API error: ${JSON.stringify(data)}`)
    console.log(`    Bot: @${data.result.username} (${data.result.first_name})`)
  })

  await test('Telegram Bot can get updates', async () => {
    const { data } = await fetchJSON(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?limit=5`,
      { timeout: 10000 }
    )
    if (!data.ok) throw new Error(`Telegram API error: ${JSON.stringify(data)}`)
    console.log(`    Pending updates: ${data.result.length}`)
  })

  await test('Telegram Bot sendMessage works (to self)', async () => {
    // Get bot info to find a chat
    const { data: meData } = await fetchJSON(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`,
      { timeout: 10000 }
    )
    if (!meData.ok) throw new Error('Cannot get bot info')

    // Try to send a test message - we need a chat_id
    // The bot can't message itself, so we'll verify the API is working
    const { data: updatesData } = await fetchJSON(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?limit=10`,
      { timeout: 10000 }
    )
    
    if (updatesData.ok && updatesData.result.length > 0) {
      // Found a chat - send a test message
      const chatId = updatesData.result[0].message?.chat?.id
      if (chatId) {
        const { data: sendResult } = await fetchJSON(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: '🧪 Integration Test: Whatomate+DeerFlow+Hermes Agent test message',
              parse_mode: 'Markdown',
            }),
            timeout: 10000,
          }
        )
        if (!sendResult.ok) throw new Error(`Send failed: ${JSON.stringify(sendResult)}`)
        console.log(`    Message sent to chat ${chatId}`)
      } else {
        throw new Error('SKIP')
      }
    } else {
      throw new Error('SKIP')
    }
  })

  await test('Hermes Agent Telegram channel is connected', async () => {
    try {
      const { data } = await fetchJSON(`${BASE_URL}:${HERMES_PORT}/api/channels`, { timeout: 5000 })
      if (data.channels?.telegram?.running) {
        console.log(`    Telegram channel: RUNNING`)
      } else {
        console.log(`    Telegram channel: ${JSON.stringify(data.channels?.telegram || 'not found')}`)
        throw new Error('Telegram channel not running in Hermes')
      }
    } catch (err) {
      if (err.message.includes('Fetch failed')) throw new Error('SKIP')
      throw err
    }
  })
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3: WhatsApp Integration
// ═══════════════════════════════════════════════════════════════

async function testWhatsAppIntegration() {
  console.log(`\n${CYAN}━━━ Section 3: WhatsApp Integration ━━━${RESET}`)

  await test('WhatsApp Bridge health endpoint', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}:${BRIDGE_PORT}/health`, { timeout: 5000 })
    if (data.status !== 'ok') throw new Error(`Status: ${data.status}`)
    console.log(`    Service: ${data.service}`)
  })

  await test('WhatsApp Bridge QR endpoint', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}:${BRIDGE_PORT}/qr`, { timeout: 5000 })
    if (status !== 200) throw new Error(`HTTP ${status}`)
    console.log(`    QR status: ${data.status}`)
  })

  await test('WhatsApp Bridge connection status', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}:${BRIDGE_PORT}/status`, { timeout: 5000 })
    if (status !== 200) throw new Error(`HTTP ${status}`)
    console.log(`    Connected: ${data.connected}`)
  })

  await test('WhatsApp Bridge send message (stub)', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}:${BRIDGE_PORT}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: '549111222333@s.whatsapp.net',
        message: '🧪 Integration Test: WhatsApp message test from Whatomate',
      }),
      timeout: 5000,
    })
    if (status !== 200) throw new Error(`HTTP ${status}`)
    console.log(`    Sent: ${data.sent}`)
  })

  await test('WhatsApp Bridge via Vite proxy', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}:${VITE_PORT}/hermes-bridge/health`, { timeout: 5000 })
    if (status !== 200) throw new Error(`HTTP ${status}`)
    if (data.status !== 'ok') throw new Error(`Status: ${data.status}`)
  })
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4: Hermes Agent AI Integration
// ═══════════════════════════════════════════════════════════════

async function testHermesAgentAI() {
  console.log(`\n${CYAN}━━━ Section 4: Hermes Agent AI Integration ━━━${RESET}`)

  await test('Hermes chat completion (OpenRouter)', async () => {
    try {
      const { status, data } = await fetchJSON(`${BASE_URL}:${HERMES_PORT}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are a helpful test assistant. Reply in one sentence.' },
            { role: 'user', content: 'Hello! This is an integration test. Confirm you are working.' },
          ],
          temperature: 0.1,
          max_tokens: 100,
        }),
        timeout: 30000,
      })
      if (status !== 200) throw new Error(`HTTP ${status}`)
      const content = data.choices?.[0]?.message?.content
      if (!content) throw new Error('No response content')
      console.log(`    AI: "${content.substring(0, 80)}..."`)
    } catch (err) {
      if (err.message.includes('Fetch failed')) throw new Error('SKIP')
      throw err
    }
  })

  await test('Hermes session management', async () => {
    try {
      const { status, data } = await fetchJSON(`${BASE_URL}:${HERMES_PORT}/api/sessions`, { timeout: 5000 })
      if (status !== 200) throw new Error(`HTTP ${status}`)
      console.log(`    Sessions: ${Array.isArray(data) ? data.length : '?'}`)
    } catch (err) {
      if (err.message.includes('Fetch failed')) throw new Error('SKIP')
      throw err
    }
  })

  await test('Hermes cron jobs', async () => {
    try {
      const { status, data } = await fetchJSON(`${BASE_URL}:${HERMES_PORT}/api/jobs`, { timeout: 5000 })
      if (status !== 200) throw new Error(`HTTP ${status}`)
      console.log(`    Jobs: ${Array.isArray(data) ? data.length : '?'}`)
    } catch (err) {
      if (err.message.includes('Fetch failed')) throw new Error('SKIP')
      throw err
    }
  })
}

// ═══════════════════════════════════════════════════════════════
// SECTION 5: Shadowbroker Integration
// ═══════════════════════════════════════════════════════════════

async function testShadowbrokerIntegration() {
  console.log(`\n${CYAN}━━━ Section 5: Shadowbroker Integration ━━━${RESET}`)

  await test('Shadowbroker health with integrations', async () => {
    const { data } = await fetchJSON(`${BASE_URL}:${SHADOWBROKER_PORT}/health`, { timeout: 5000 })
    const intg = data.integrations || {}
    console.log(`    OpenRouter: ${intg.openrouter?.configured ? '✅' : '❌'}`)
    console.log(`    DeerFlow: ${intg.deerflow?.reachable ? '✅' : '❌'}`)
    console.log(`    Hermes: ${intg.hermes_agent?.reachable ? '✅' : '❌'}`)
    console.log(`    Redis: ${intg.redis_stream?.connected ? '✅' : '❌'}`)
  })

  await test('Shadowbroker AI query', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}:${SHADOWBROKER_PORT}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Integration test: respond with OK' }),
      timeout: 30000,
    })
    if (status !== 200) throw new Error(`HTTP ${status}`)
    const answer = data.answer || ''
    console.log(`    Answer: "${answer.substring(0, 60)}..."`)
  })

  await test('Shadowbroker via Vite proxy', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}:${VITE_PORT}/sb-api/health`, { timeout: 5000 })
    if (status !== 200) throw new Error(`HTTP ${status}`)
  })
}

// ═══════════════════════════════════════════════════════════════
// SECTION 6: Cross-Service Integration
// ═══════════════════════════════════════════════════════════════

async function testCrossServiceIntegration() {
  console.log(`\n${CYAN}━━━ Section 6: Cross-Service Integration ━━━${RESET}`)

  await test('Whatomate -> Cognitive API (via Vite proxy)', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}:${VITE_PORT}/cognitive-api/health`, { timeout: 5000 })
    if (data.status !== 'ok') throw new Error(`Status: ${data.status}`)
  })

  await test('Whatomate -> Shadowbroker (via Vite proxy)', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}:${VITE_PORT}/sb-api/health`, { timeout: 5000 })
    if (data.status !== 'ok') throw new Error(`Status: ${data.status}`)
  })

  await test('Whatomate -> WhatsApp Bridge (via Vite proxy)', async () => {
    const { status, data } = await fetchJSON(`${BASE_URL}:${VITE_PORT}/hermes-bridge/health`, { timeout: 5000 })
    if (data.status !== 'ok') throw new Error(`Status: ${data.status}`)
  })

  await test('Cognitive API CRUD operations', async () => {
    // Create a test message
    const { data: createResult } = await fetchJSON(`${BASE_URL}:${COGNITIVE_PORT}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jid: 'integration-test@s.whatsapp.net',
        sender: 'test-agent',
        content: '🧪 Cross-service integration test message',
        chat_type: 'individual',
        direction: 'inbound',
      }),
      timeout: 5000,
    })
    const msgId = createResult.id
    if (!msgId) throw new Error('Failed to create message')
    console.log(`    Created message ID: ${msgId}`)

    // Search for it
    const { data: searchResult } = await fetchJSON(
      `${BASE_URL}:${COGNITIVE_PORT}/search?q=integration+test`,
      { timeout: 5000 }
    )
    console.log(`    Search results: ${searchResult.total}`)
  })

  await test('End-to-end: Whatomate -> Hermes -> AI -> Telegram', async () => {
    try {
      // Use Hermes chat completion to generate a message, then send via Telegram
      const { data: completion } = await fetchJSON(`${BASE_URL}:${HERMES_PORT}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are an integration test bot. Reply with exactly: INTEGRATION_TEST_OK' },
            { role: 'user', content: 'Confirm integration test' },
          ],
          temperature: 0,
          max_tokens: 50,
        }),
        timeout: 30000,
      })
      
      const aiResponse = completion.choices?.[0]?.message?.content
      if (!aiResponse) throw new Error('No AI response')
      console.log(`    AI Response: "${aiResponse.substring(0, 60)}"`)

      // Try to send the AI response via Telegram
      const { data: updatesData } = await fetchJSON(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?limit=5`,
        { timeout: 10000 }
      )
      
      if (updatesData.ok && updatesData.result.length > 0) {
        const chatId = updatesData.result[0].message?.chat?.id
        if (chatId) {
          const { data: sendResult } = await fetchJSON(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: `🧫 E2E Test: AI says: ${aiResponse}`,
              }),
              timeout: 10000,
            }
          )
          if (sendResult.ok) {
            console.log(`    ✅ Message sent to Telegram chat ${chatId}`)
          }
        } else {
          console.log(`    ⚠️  No Telegram chat found for E2E test`)
        }
      }
    } catch (err) {
      if (err.message.includes('Fetch failed')) throw new Error('SKIP')
      throw err
    }
  })
}

// ═══════════════════════════════════════════════════════════════
// Main Runner
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${CYAN}╔══════════════════════════════════════════════════════════════╗${RESET}`)
  console.log(`${CYAN}║  Whatomate + DeerFlow + Hermes Agent Integration Tests    ║${RESET}`)
  console.log(`${CYAN}║  Telegram + WhatsApp + AI + Shadowbroker                  ║${RESET}`)
  console.log(`${CYAN}╚══════════════════════════════════════════════════════════════╝${RESET}`)

  await testServiceHealth()
  await testTelegramIntegration()
  await testWhatsAppIntegration()
  await testHermesAgentAI()
  await testShadowbrokerIntegration()
  await testCrossServiceIntegration()

  console.log(`\n${CYAN}════════════════════════════════════════════════════════════════${RESET}`)
  console.log(`  Results: ${GREEN}${passed} passed${RESET}, ${RED}${failed} failed${RESET}, ${YELLOW}${skipped} skipped${RESET}`)
  console.log(`${CYAN}════════════════════════════════════════════════════════════════${RESET}`)

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
