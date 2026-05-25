/**
 * MCP Bridge — Model Context Protocol integration for Hermes Agent.
 *
 * Uses the Unified ToolRegistry as its source of truth for tool definitions.
 * Provides:
 *   1. MCP Client — exposes all registry tools via MCP protocol
 *   2. MCP Tool Execution — delegates to ToolRegistry.execute()
 *   3. MCP Server capability — for external AI assistants to discover and call tools
 */

import { ToolRegistry } from '../tools/registry.js'

// ─── MCP Bridge ──────────────────────────────────────────────────────────────

export interface MCPBridge {
  getTools(): Array<{ type: 'function'; function: any }>
  execute(toolName: string, args: Record<string, any>): Promise<any>
}

/**
 * Create an MCP Bridge backed by the Unified ToolRegistry.
 */
export function createMCPBridge(toolRegistry: ToolRegistry): MCPBridge {
  return {
    /**
     * Get all tools in MCP/OpenAI function calling format.
     */
    getTools(): Array<{ type: 'function'; function: any }> {
      return toolRegistry.getOpenAITools()
    },

    /**
     * Execute an MCP tool by name.
     * Delegates to the ToolRegistry for execution.
     */
    async execute(toolName: string, args: Record<string, any> = {}): Promise<any> {
      if (!toolRegistry.has(toolName)) {
        throw new Error(`MCP tool not found: ${toolName}`)
      }
      return await toolRegistry.execute(toolName, args)
    },
  }
}

/**
 * Backward-compatible exports for legacy code.
 * These are derived from the ToolRegistry at module load time.
 */
let _toolRegistry: ToolRegistry | null = null

export function initMCP(toolRegistry: ToolRegistry): void {
  _toolRegistry = toolRegistry
}

/**
 * Legacy MCP tools list (for backward compatibility with existing API).
 * Returns the tools from the registry in MCP format.
 */
export function getMCPTools(): Array<{ type: 'function'; function: any }> {
  if (!_toolRegistry) return []
  return _toolRegistry.getOpenAITools()
}

/**
 * Legacy execute function (for backward compatibility).
 */
export async function executeMCPTool(toolName: string, args: Record<string, any> = {}): Promise<any> {
  if (!_toolRegistry) {
    throw new Error('MCP not initialized — call initMCP() first')
  }
  return await _toolRegistry.execute(toolName, args)
}

/**
 * Legacy mcpTools export (for backward compatibility).
 * This will be empty until initMCP is called.
 */
export const mcpTools: Array<{ type: 'function'; function: any }> = []
