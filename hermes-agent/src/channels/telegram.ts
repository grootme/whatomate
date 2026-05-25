/**
 * Telegram Bot Channel
 * Receives messages from Telegram and routes them through the AgentExecutor.
 * The AI decides what to do — no hard-coded command patterns.
 */

import TelegramBot from 'node-telegram-bot-api'
import { AgentExecutor } from '../services/agent-executor.js'

export class TelegramBotChannel {
  private bot: TelegramBot
  private agent: AgentExecutor
  private running: boolean = false

  constructor(token: string, agent: AgentExecutor) {
    this.bot = new TelegramBot(token, { polling: false })
    this.agent = agent

    // Setup message handler
    this.setupHandlers()
  }

  private setupHandlers(): void {
    // Handle all text messages
    this.bot.on('message', async (msg) => {
      if (!msg.text || !msg.from) return
      const chatId = msg.chat.id.toString()
      const text = msg.text.trim()

      console.log(`[hermes:telegram] From ${msg.from.username || msg.from.first_name} (${chatId}): ${text.substring(0, 80)}`)

      try {
        // Send "typing" indicator
        await this.bot.sendChatAction(chatId, 'typing')

        // Route through the intelligent agent
        const result = await this.agent.execute(text, chatId)

        if (result.response) {
          // Sanitize and send response
          const sanitized = this.sanitizeForTelegram(result.response)
          const chunks = this.splitMessage(sanitized, 4000)
          for (const chunk of chunks) {
            await this.bot.sendMessage(chatId, chunk)
          }
        } else if (result.error) {
          await this.bot.sendMessage(chatId, `Error: ${result.error}`)
        }
      } catch (error: any) {
        console.error(`[hermes:telegram] Error:`, error.message)
        try {
          await this.bot.sendMessage(chatId, `Lo siento, hubo un error procesando tu mensaje. Intenta de nuevo.`)
        } catch { /* ignore send errors */ }
      }
    })

    // Handle polling errors
    this.bot.on('polling_error', (error) => {
      console.error(`[hermes:telegram] Polling error:`, error.message)
    })
  }

  /**
   * Sanitize text for Telegram — strip HTML/Markdown that could cause parse errors.
   * We send as plain text to avoid parse_mode issues.
   */
  private sanitizeForTelegram(text: string): string {
    return text
      // Remove DOCTYPE and HTML tags
      .replace(/<!doctype[^>]*>/gi, '')
      .replace(/<html[^>]*>/gi, '')
      .replace(/<\/html>/gi, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<body[^>]*>/gi, '')
      .replace(/<\/body>/gi, '')
      // Convert HTML bold/italic to Markdown-ish
      .replace(/<b>(.*?)<\/b>/gi, '*$1*')
      .replace(/<strong>(.*?)<\/strong>/gi, '*$1*')
      .replace(/<i>(.*?)<\/i>/gi, '_$1_')
      .replace(/<em>(.*?)<\/em>/gi, '_$1_')
      .replace(/<code>(.*?)<\/code>/gi, '`$1`')
      .replace(/<pre>(.*?)<\/pre>/gis, '```\n$1\n```')
      // Remove remaining HTML tags
      .replace(/<[^>]+>/g, '')
      // Clean up excessive whitespace
      .replace(/\n{4,}/g, '\n\n\n')
      .trim()
  }

  private splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text]

    const chunks: string[] = []
    let remaining = text

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining)
        break
      }

      // Find a good split point
      let splitAt = remaining.lastIndexOf('\n', maxLength)
      if (splitAt < maxLength * 0.5) {
        splitAt = remaining.lastIndexOf('. ', maxLength)
      }
      if (splitAt < maxLength * 0.5) {
        splitAt = maxLength
      }

      chunks.push(remaining.substring(0, splitAt + 1))
      remaining = remaining.substring(splitAt + 1)
    }

    return chunks
  }

  async sendMessage(chatId: string, message: string): Promise<void> {
    try {
      const sanitized = this.sanitizeForTelegram(message)
      const chunks = this.splitMessage(sanitized, 4000)
      for (const chunk of chunks) {
        await this.bot.sendMessage(chatId, chunk)
      }
    } catch (error: any) {
      console.error(`[hermes:telegram] Send error:`, error.message)
    }
  }

  async start(): Promise<void> {
    if (this.running) return

    try {
      // Get bot info
      const botInfo = await this.bot.getMe()
      console.log(`[hermes:telegram] Bot: @${botInfo.username} (${botInfo.first_name})`)

      // Start polling
      await this.bot.startPolling({ restart: true })
      this.running = true
      console.log('[hermes:telegram] Polling started')
    } catch (error: any) {
      console.error('[hermes:telegram] Failed to start:', error.message)
      console.log('[hermes:telegram] Will retry in 5 seconds...')
      setTimeout(() => this.start(), 5000)
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return
    this.running = false
    await this.bot.stopPolling()
    console.log('[hermes:telegram] Polling stopped')
  }
}

// Re-export with simpler name
export { TelegramBotChannel as TelegramBot }
