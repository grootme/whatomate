/**
 * Skills Registry — Thin wrapper over the Unified ToolRegistry.
 *
 * Skills are now just tools with metadata — the AI handles intent understanding
 * through the agent loop, so there's no more trigger pattern matching.
 *
 * This module provides backward compatibility for the Skills API endpoints
 * while delegating to the ToolRegistry.
 */

import { ToolRegistry, ToolDefinition } from '../tools/registry.js'

export interface SkillInfo {
  id: string
  name: string
  description: string
  category: string
}

export class SkillsRegistry {
  private toolRegistry: ToolRegistry | null = null

  constructor(toolRegistry?: ToolRegistry) {
    if (toolRegistry) {
      this.toolRegistry = toolRegistry
    }
  }

  /**
   * Set the ToolRegistry instance (for deferred initialization)
   */
  setToolRegistry(toolRegistry: ToolRegistry): void {
    this.toolRegistry = toolRegistry
  }

  /**
   * List all skills (derived from tool registry)
   */
  list(): SkillInfo[] {
    if (!this.toolRegistry) return []

    return this.toolRegistry.getAll().map(tool => ({
      id: tool.name,
      name: this.humanizeName(tool.name),
      description: tool.description,
      category: tool.category,
    }))
  }

  /**
   * Execute a skill by name (delegates to ToolRegistry)
   */
  async execute(skillId: string, params: any): Promise<any> {
    if (!this.toolRegistry) {
      throw new Error('ToolRegistry not initialized')
    }

    // The skillId maps directly to a tool name
    if (this.toolRegistry.has(skillId)) {
      return await this.toolRegistry.execute(skillId, params)
    }

    // Try legacy skill IDs → tool name mapping
    const legacyMap: Record<string, string> = {
      'telegram-group-analysis': 'telegram_analyze_groups',
      'telegram-search': 'telegram_search',
      'shadowbroker-osint': 'shadowbroker_report',
      'threat-assessment': 'shadowbroker_threat',
      'cognitive-search': 'cognitive_search',
      'deep-research': 'deerflow_research',
      'whatsapp-status': 'whatsapp_status',
      'ecosystem-report': 'ecosystem_status',
    }

    const toolName = legacyMap[skillId]
    if (toolName && this.toolRegistry.has(toolName)) {
      return await this.toolRegistry.execute(toolName, params)
    }

    throw new Error(`Skill not found: ${skillId}`)
  }

  /**
   * Find a matching skill for the given text (backward compat)
   * NOTE: The AI agent no longer uses this — it's kept for API compatibility only.
   */
  findMatch(text: string): SkillInfo | null {
    // The AI handles intent matching now, this is just for backward compat
    return null
  }

  /**
   * Convert tool_name to Human Name
   */
  private humanizeName(name: string): string {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }
}
