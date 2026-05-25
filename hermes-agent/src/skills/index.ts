/**
 * Skills Registry — Declarative skills that Hermes can execute.
 * Each skill has a trigger pattern, description, and execution handler.
 */

export interface Skill {
  id: string
  name: string
  description: string
  triggers: string[]
  category: string
  execute: (params: any) => Promise<any>
}

export class SkillsRegistry {
  private skills: Map<string, Skill> = new Map()

  constructor() {
    this.registerBuiltins()
  }

  private registerBuiltins(): void {
    // ─── Telegram Group Analysis Skill ──────────────────────────────────────
    this.register({
      id: 'telegram-group-analysis',
      name: 'Análisis de Grupos de Telegram',
      description: 'Analiza todos los grupos de Telegram del usuario con IA',
      triggers: ['analiza grupo', 'analizar grupo', 'analiza mis grupo'],
      category: 'telegram',
      execute: async (params) => {
        const resp = await fetch(`${process.env.TELETHON_URL || 'http://localhost:8700'}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deep: true }),
          signal: AbortSignal.timeout(120000),
        })
        return await resp.json()
      },
    })

    // ─── Telegram Search Skill ──────────────────────────────────────────────
    this.register({
      id: 'telegram-search',
      name: 'Búsqueda en Grupos de Telegram',
      description: 'Busca mensajes en todos los grupos de Telegram',
      triggers: ['busca', 'buscar', 'search'],
      category: 'telegram',
      execute: async (params) => {
        const resp = await fetch(`${process.env.TELETHON_URL || 'http://localhost:8700'}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: params.query, limit_per_group: 5 }),
          signal: AbortSignal.timeout(60000),
        })
        return await resp.json()
      },
    })

    // ─── Shadowbroker OSINT Skill ──────────────────────────────────────────
    this.register({
      id: 'shadowbroker-osint',
      name: 'Análisis OSINT Shadowbroker',
      description: 'Genera reportes de inteligencia OSINT',
      triggers: ['shadowbroker', 'osint', 'inteligencia'],
      category: 'osint',
      execute: async (params) => {
        const resp = await fetch(`${process.env.SHADOWBROKER_URL || 'http://localhost:8660'}/api/ai/report`, {
          signal: AbortSignal.timeout(60000),
        })
        return await resp.json()
      },
    })

    // ─── Threat Assessment Skill ────────────────────────────────────────────
    this.register({
      id: 'threat-assessment',
      name: 'Evaluación de Amenazas',
      description: 'Evalúa el nivel de amenaza actual basado en datos OSINT',
      triggers: ['amenaza', 'threat', 'peligro'],
      category: 'osint',
      execute: async (params) => {
        const resp = await fetch(`${process.env.SHADOWBROKER_URL || 'http://localhost:8660'}/api/threats/latest`, {
          signal: AbortSignal.timeout(30000),
        })
        return await resp.json()
      },
    })

    // ─── Cognitive Knowledge Skill ──────────────────────────────────────────
    this.register({
      id: 'cognitive-search',
      name: 'Búsqueda en Conocimiento',
      description: 'Busca en la base de conocimiento cognitiva',
      triggers: ['conocimiento', 'saber', 'knowledge'],
      category: 'cognitive',
      execute: async (params) => {
        const resp = await fetch(`${process.env.COGNITIVE_URL || 'http://localhost:8645'}/search?q=${encodeURIComponent(params.query)}`, {
          signal: AbortSignal.timeout(10000),
        })
        return await resp.json()
      },
    })

    // ─── DeerFlow Research Skill ────────────────────────────────────────────
    this.register({
      id: 'deep-research',
      name: 'Investigación Profunda',
      description: 'Realiza investigación profunda sobre un tema usando DeerFlow',
      triggers: ['investiga', 'research', 'investigar'],
      category: 'research',
      execute: async (params) => {
        const resp = await fetch(`${process.env.DEERFLOW_URL || 'http://localhost:8000'}/api/research`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: params.query, depth: 'deep' }),
          signal: AbortSignal.timeout(300000),
        })
        return await resp.json()
      },
    })

    // ─── WhatsApp Status Skill ─────────────────────────────────────────────
    this.register({
      id: 'whatsapp-status',
      name: 'Estado de WhatsApp',
      description: 'Verifica el estado de la conexión WhatsApp',
      triggers: ['whatsapp estado', 'wa status'],
      category: 'whatsapp',
      execute: async (params) => {
        const resp = await fetch(`${process.env.WHATSAPP_BRIDGE_URL || 'http://localhost:3001'}/health`, {
          signal: AbortSignal.timeout(5000),
        })
        return await resp.json()
      },
    })

    // ─── Ecosystem Report Skill ────────────────────────────────────────────
    this.register({
      id: 'ecosystem-report',
      name: 'Reporte del Ecosistema',
      description: 'Genera un reporte completo del estado del ecosistema',
      triggers: ['ecosistema reporte', 'ecosystem report'],
      category: 'system',
      execute: async (params) => {
        const services = [
          { name: 'Telethon', url: `${process.env.TELETHON_URL || 'http://localhost:8700'}/health` },
          { name: 'Shadowbroker', url: `${process.env.SHADOWBROKER_URL || 'http://localhost:8660'}/health` },
          { name: 'Cognitive', url: `${process.env.COGNITIVE_URL || 'http://localhost:8645'}/health` },
          { name: 'WhatsApp', url: `${process.env.WHATSAPP_BRIDGE_URL || 'http://localhost:3001'}/health` },
        ]

        const results: Record<string, any> = {}
        for (const svc of services) {
          try {
            const resp = await fetch(svc.url, { signal: AbortSignal.timeout(3000) })
            results[svc.name] = await resp.json()
          } catch {
            results[svc.name] = { status: 'unreachable' }
          }
        }

        return { response: JSON.stringify(results, null, 2), data: results }
      },
    })
  }

  register(skill: Skill): void {
    this.skills.set(skill.id, skill)
  }

  findMatch(text: string): Skill | null {
    const lower = text.toLowerCase()
    for (const skill of this.skills.values()) {
      if (skill.triggers.some(t => lower.includes(t))) {
        return skill
      }
    }
    return null
  }

  async execute(skillId: string, params: any): Promise<any> {
    const skill = this.skills.get(skillId)
    if (!skill) throw new Error(`Skill not found: ${skillId}`)
    return await skill.execute(params)
  }

  list(): Array<{ id: string; name: string; description: string; category: string; triggers: string[] }> {
    return Array.from(this.skills.values()).map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      triggers: s.triggers,
    }))
  }
}
