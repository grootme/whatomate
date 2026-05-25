/**
 * Tools Index — Re-exports from the new unified architecture.
 *
 * The old ToolsRegistry (reactive tools) has been moved to /tools/reactive.ts.
 * The new ToolRegistry (AI-callable tools) is at /tools/registry.ts.
 *
 * This file provides backward compatibility re-exports.
 */

// New unified tool registry
export { ToolRegistry } from './registry.js'
export type { ToolDefinition } from './registry.js'

// Reactive tools (event-driven background workers)
export { ReactiveToolsRegistry } from './reactive.js'
export type { ReactiveTool } from './reactive.js'

// All AI-callable tool definitions
export { allTools, registerAllTools } from './definitions/index.js'

// Individual tool arrays
export { telegramTools } from './definitions/telegram-tools.js'
export { shadowbrokerTools } from './definitions/shadowbroker-tools.js'
export { cognitiveTools } from './definitions/cognitive-tools.js'
export { whatsappTools } from './definitions/whatsapp-tools.js'
export { researchTools } from './definitions/research-tools.js'
export { systemTools } from './definitions/system-tools.js'
