/**
 * Unified Tool Registry — Single source of truth for all AI-callable tools.
 *
 * Replaces the duplicated definitions in:
 *   - agent-executor.ts (toolDefinitions + toolExecutors)
 *   - skills/index.ts (SkillsRegistry with triggers)
 *   - mcp/index.ts (mcpTools)
 *
 * Every tool is a self-contained ToolDefinition with its own execute handler.
 * The registry provides:
 *   - OpenAI function calling format for the LLM
 *   - Direct execution by name
 *   - Category-based filtering
 *   - MCP-compatible tool listing
 */

export interface ToolDefinition {
  name: string
  description: string
  category: 'telegram' | 'osint' | 'cognitive' | 'whatsapp' | 'research' | 'system' | 'mcp'
  parameters: Record<string, any> // OpenAI function calling format
  execute: (params: Record<string, any>) => Promise<any>
  // For event-driven/reactive tools (background workers, not AI-callable)
  eventType?: string
  eventHandler?: (event: any) => Promise<void>
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map()

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[hermes:registry] Tool "${tool.name}" already registered, overwriting`)
    }
    this.tools.set(tool.name, tool)
  }

  registerMany(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool)
    }
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  getByCategory(category: string): ToolDefinition[] {
    return this.getAll().filter(t => t.category === category)
  }

  /**
   * Get tool definitions in OpenAI function calling format.
   * Only includes tools that have execute handlers (AI-callable tools).
   */
  getOpenAITools(): Array<{ type: 'function'; function: any }> {
    return this.getAll()
      .filter(t => !!t.execute)
      .map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))
  }

  /**
   * Get reactive tools (event-driven background workers).
   */
  getReactiveTools(): ToolDefinition[] {
    return this.getAll().filter(t => t.eventType && t.eventHandler)
  }

  /**
   * Execute a tool by name with the given parameters.
   */
  async execute(name: string, params: Record<string, any>): Promise<any> {
    const tool = this.tools.get(name)
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`)
    }
    if (!tool.execute) {
      throw new Error(`Tool "${name}" has no execute handler`)
    }
    return await tool.execute(params)
  }

  /**
   * Execute multiple tool calls in parallel.
   */
  async executeMany(calls: Array<{ name: string; params: Record<string, any> }>): Promise<Array<{ name: string; result: any; error?: string }>> {
    const results = await Promise.allSettled(
      calls.map(async (call) => {
        const result = await this.execute(call.name, call.params)
        return { name: call.name, result }
      })
    )

    return results.map((r, i) => {
      if (r.status === 'fulfilled') {
        return r.value
      }
      return { name: calls[i].name, result: null, error: r.reason?.message || 'Unknown error' }
    })
  }

  /**
   * List all tools with metadata (for API responses).
   */
  list(): Array<{
    name: string
    description: string
    category: string
    hasExecute: boolean
    eventType?: string
  }> {
    return this.getAll().map(t => ({
      name: t.name,
      description: t.description,
      category: t.category,
      hasExecute: !!t.execute,
      eventType: t.eventType,
    }))
  }

  /**
   * Get count of registered tools.
   */
  get count(): number {
    return this.tools.size
  }

  /**
   * Check if a tool is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name)
  }
}
