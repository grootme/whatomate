/**
 * Telegram Bot Channel
 * Receives messages from Telegram and routes them to the CommandRouter.
 */

import TelegramBot from 'node-telegram-bot-api'
import { CommandRouter } from '../services/command-router.js'

export class TelegramBotChannel {
  private bot: TelegramBot
  private router: CommandRouter
  private running: boolean = false

  constructor(token: string, router: CommandRouter) {
    this.bot = new TelegramBot(token, { polling: false })
    this.router = router

    // Setup command handlers
    this.setupHandlers()
  }

  private setupHandlers(): void {
    // Handle all text messages
    this.bot.on('message', async (msg) => {
      if (!msg.text || !msg.from) return
      const chatId = msg.chat.id.toString()
      const text = msg.text.trim()

      console.log(`[hermes:telegram] Received from ${msg.from.username || msg.from.first_name}: ${text}`)

      try {
        // Send "typing" indicator
        await this.bot.sendChatAction(chatId, 'typing')

        const result = await this.router.processCommand(text, chatId)

        if (result.response) {
          // Split long messages (Telegram limit: 4096 chars)
          const chunks = this.splitMessage(result.response, 4000)
          for (const chunk of chunks) {
            await this.bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' })
          }
        } else if (result.error) {
          await this.bot.sendMessage(chatId, `Error: ${result.error}`)
        }
      } catch (error: any) {
        console.error(`[hermes:telegram] Error processing message:`, error.message)
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
      const chunks = this.splitMessage(message, 4000)
      for (const chunk of chunks) {
        await this.bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' })
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
