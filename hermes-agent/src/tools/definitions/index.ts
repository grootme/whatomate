/**
 * Tool Definitions Index
 * Re-exports all AI-callable tool definitions.
 *
 * Import this to get all tools in one place for registration.
 */

import { ToolDefinition } from '../registry.js'
import { telegramTools } from './telegram-tools.js'
import { shadowbrokerTools } from './shadowbroker-tools.js'
import { cognitiveTools } from './cognitive-tools.js'
import { whatsappTools } from './whatsapp-tools.js'
import { researchTools } from './research-tools.js'
import { systemTools } from './system-tools.js'
import { backendTools } from './backend-tools.js'

/**
 * All AI-callable tools, ready to be registered in the ToolRegistry.
 */
export const allTools: ToolDefinition[] = [
  ...telegramTools,
  ...shadowbrokerTools,
  ...cognitiveTools,
  ...whatsappTools,
  ...researchTools,
  ...systemTools,
  ...backendTools,
]

/**
 * Register all tools into a ToolRegistry instance.
 */
export function registerAllTools(registry: import('../registry.js').ToolRegistry): void {
  registry.registerMany(allTools)
}

// Re-export individual tool arrays for selective registration
export { telegramTools } from './telegram-tools.js'
export { shadowbrokerTools } from './shadowbroker-tools.js'
export { cognitiveTools } from './cognitive-tools.js'
export { whatsappTools } from './whatsapp-tools.js'
export { researchTools } from './research-tools.js'
export { systemTools } from './system-tools.js'
export { backendTools } from './backend-tools.js'
