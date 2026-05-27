/**
 * Shadowbroker Skills System
 *
 * Skills son capacidades declarativas que el agente Shadowbroker
 * puede ejecutar. Cada skill tiene:
 *   - name: Identificador único
 *   - description: Descripción funcional
 *   - parameters: Esquema de parámetros
 *   - execute: Función de ejecución
 *   - streamTarget: Stream de Redis donde publicar resultados
 *
 * Las skills se registran en el EventBus y se activan por eventos
 * o por comandos directos via REST API.
 */

import { EventBus, Streams, generateEventId } from '../redis-streams.js'

// ─── Skill Definition ─────────────────────────────────────────────────────────

export interface SkillParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  required: boolean
  description: string
  default?: any
}

export interface SkillDefinition {
  name: string
  description: string
  category: 'intelligence' | 'monitoring' | 'analysis' | 'alert' | 'communication' | 'correlation'
  parameters: SkillParameter[]
  streamTarget?: string
  execute: (params: Record<string, any>, eventBus: EventBus) => Promise<SkillResult>
}

export interface SkillResult {
  success: boolean
  data: any
  message?: string
  eventsPublished?: number
  executionTimeMs?: number
}

// ─── Skill Registry ───────────────────────────────────────────────────────────

class SkillRegistry {
  private skills: Map<string, SkillDefinition> = new Map()
  private eventBus: EventBus | null = null

  setEventBus(bus: EventBus): void {
    this.eventBus = bus
  }

  register(skill: SkillDefinition): void {
    this.skills.set(skill.name, skill)
    console.log(`[skills] Registered: ${skill.name} (${skill.category})`)
  }

  async execute(skillName: string, params: Record<string, any> = {}): Promise<SkillResult> {
    const skill = this.skills.get(skillName)
    if (!skill) {
      return { success: false, data: null, message: `Skill not found: ${skillName}` }
    }

    if (!this.eventBus) {
      return { success: false, data: null, message: 'EventBus not initialized' }
    }

    // Validate required parameters
    for (const param of skill.parameters) {
      if (param.required && params[param.name] === undefined) {
        if (param.default !== undefined) {
          params[param.name] = param.default
        } else {
          return { success: false, data: null, message: `Missing required parameter: ${param.name}` }
        }
      }
    }

    const startTime = Date.now()
    try {
      const result = await skill.execute(params, this.eventBus)
      result.executionTimeMs = Date.now() - startTime
      return result
    } catch (err: any) {
      return {
        success: false,
        data: null,
        message: `Skill execution error: ${err.message}`,
        executionTimeMs: Date.now() - startTime,
      }
    }
  }

  listSkills(): { name: string; description: string; category: string; parameters: SkillParameter[] }[] {
    return [...this.skills.values()].map(s => ({
      name: s.name,
      description: s.description,
      category: s.category,
      parameters: s.parameters,
    }))
  }

  getSkill(name: string): SkillDefinition | undefined {
    return this.skills.get(name)
  }
}

export const skillRegistry = new SkillRegistry()

// ─── Intelligence Skills ──────────────────────────────────────────────────────

skillRegistry.register({
  name: 'sb_threat_landscape',
  description: 'Obtener evaluación actual del panorama de amenazas desde Shadowbroker. Analiza todas las capas OSINT activas y genera una evaluación de amenaza con IA.',
  category: 'intelligence',
  parameters: [
    { name: 'include_details', type: 'boolean', required: false, description: 'Incluir detalles completos de cada capa', default: true },
    { name: 'ai_analysis', type: 'boolean', required: false, description: 'Usar IA para análisis profundo', default: true },
  ],
  streamTarget: Streams.THREAT_ASSESSMENTS,
  async execute(params, eventBus) {
    const sbUrl = process.env.SHADOWBROKER_URL || 'http://localhost:8000'
    const response = await fetch(`${sbUrl}/api/live-data`, { signal: AbortSignal.timeout(15000) })
    const data = await response.json()

    // Publish raw intel event
    await eventBus.publish(Streams.INTEL_EVENTS, {
      id: generateEventId(),
      type: 'shadowbroker.intel',
      source: 'shadowbroker-skill',
      timestamp: Date.now(),
      eventType: 'threat_landscape_query',
      severity: 'medium',
      title: 'Threat landscape query executed',
      description: `Queried ${Object.keys(data).length} data layers`,
      lat: null,
      lng: null,
      dataJson: JSON.stringify(data).substring(0, 2000),
    })

    // If AI analysis requested, call the bridge
    let threatAssessment = null
    if (params.ai_analysis) {
      try {
        const bridgeUrl = process.env.BRIDGE_URL || 'http://localhost:8660'
        const analyzeResp = await fetch(`${bridgeUrl}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'threat_landscape' }),
          signal: AbortSignal.timeout(60000),
        })
        threatAssessment = await analyzeResp.json()
      } catch (err: any) {
        threatAssessment = { error: err.message, fallback: 'Heuristic analysis only' }
      }
    }

    // Build summary
    const summary: Record<string, number> = {}
    for (const [key, val] of Object.entries(data)) {
      if (Array.isArray(val)) summary[key] = val.length
    }

    const result = {
      threat_level: data.threat_level || 'unknown',
      data_layers: summary,
      total_data_points: Object.values(summary).reduce((a: number, b: number) => a + b, 0),
      ai_assessment: threatAssessment,
      timestamp: new Date().toISOString(),
    }

    // Publish threat assessment event
    await eventBus.publish(Streams.THREAT_ASSESSMENTS, {
      id: generateEventId(),
      type: 'shadowbroker.threat',
      source: 'shadowbroker-skill',
      timestamp: Date.now(),
      threatLevel: result.threat_level,
      category: 'general',
      description: `Threat landscape assessment: ${result.threat_level}`,
      confidence: threatAssessment?.confidence || 0.5,
      recommendations: threatAssessment?.recommendations || [],
    })

    return { success: true, data: result, eventsPublished: 2 }
  },
})

skillRegistry.register({
  name: 'sb_geospatial_query',
  description: 'Consultar eventos OSINT por región geográfica. Filtra por coordenadas y radio para obtener actividad en una zona específica.',
  category: 'intelligence',
  parameters: [
    { name: 'lat', type: 'number', required: true, description: 'Latitud del centro de búsqueda' },
    { name: 'lng', type: 'number', required: true, description: 'Longitud del centro de búsqueda' },
    { name: 'radius_km', type: 'number', required: false, description: 'Radio de búsqueda en km', default: 100 },
    { name: 'event_types', type: 'array', required: false, description: 'Tipos de evento a filtrar', default: [] },
  ],
  streamTarget: Streams.INTEL_EVENTS,
  async execute(params, eventBus) {
    const sbUrl = process.env.SHADOWBROKER_URL || 'http://localhost:8000'
    const response = await fetch(`${sbUrl}/api/live-data`, { signal: AbortSignal.timeout(15000) })
    const data = await response.json()

    const radiusDeg = params.radius_km / 111 // Approximate km to degrees
    const events: any[] = []

    const geoLayers = [
      'military_flights', 'ships', 'earthquakes', 'gdelt', 'news',
      'firms_fires', 'gps_jamming', 'weather_alerts', 'uavs',
      'liveuamap', 'crowdthreat', 'sigint',
    ]

    const typeFilter = params.event_types?.length > 0 ? new Set(params.event_types) : null

    for (const layer of geoLayers) {
      if (typeFilter && !typeFilter.has(layer)) continue
      const items = data[layer]
      if (!Array.isArray(items)) continue

      for (const item of items) {
        const itemLat = item.lat ?? item.latitude
        const itemLng = item.lng ?? item.lon ?? item.longitude
        if (itemLat == null || itemLng == null) continue

        const dist = Math.sqrt(
          Math.pow(Number(itemLat) - params.lat, 2) +
          Math.pow(Number(itemLng) - params.lng, 2)
        )

        if (dist <= radiusDeg) {
          events.push({
            layer,
            distance_km: Math.round(dist * 111),
            ...item,
          })
        }
      }
    }

    // Publish query event
    await eventBus.publish(Streams.INTEL_EVENTS, {
      id: generateEventId(),
      type: 'shadowbroker.intel',
      source: 'shadowbroker-skill',
      timestamp: Date.now(),
      eventType: 'geospatial_query',
      severity: 'info',
      title: `Geospatial query: ${params.lat},${params.lng} r=${params.radius_km}km`,
      description: `Found ${events.length} events in region`,
      lat: params.lat,
      lng: params.lng,
      dataJson: JSON.stringify({ query: params, resultCount: events.length }),
    })

    return {
      success: true,
      data: {
        center: { lat: params.lat, lng: params.lng },
        radius_km: params.radius_km,
        events_found: events.length,
        events: events.slice(0, 100),
        by_layer: events.reduce((acc: any, e: any) => {
          acc[e.layer] = (acc[e.layer] || 0) + 1
          return acc
        }, {}),
      },
      eventsPublished: 1,
    }
  },
})

skillRegistry.register({
  name: 'sb_intel_search',
  description: 'Búsqueda full-text a través de toda la inteligencia OSINT almacenada. Busca en eventos, análisis, alertas y evaluaciones de amenazas.',
  category: 'intelligence',
  parameters: [
    { name: 'query', type: 'string', required: true, description: 'Término de búsqueda' },
    { name: 'search_type', type: 'string', required: false, description: 'Tipo de búsqueda: events, analyses, alerts, all', default: 'all' },
    { name: 'limit', type: 'number', required: false, description: 'Máximo resultados', default: 20 },
  ],
  async execute(params, eventBus) {
    // Search in Cognitive API (which has FTS5)
    const cognitiveUrl = process.env.COGNITIVE_URL || 'http://localhost:8645'
    const response = await fetch(
      `${cognitiveUrl}/search?q=${encodeURIComponent(params.query)}&limit=${params.limit}`,
      { signal: AbortSignal.timeout(5000) },
    )
    const cognitiveResults = await response.json()

    // Also search in Shadowbroker bridge's SQLite
    const bridgeUrl = process.env.BRIDGE_URL || 'http://localhost:8660'
    let bridgeResults: any = { events: [] }
    try {
      const bridgeResp = await fetch(
        `${bridgeUrl}/events?limit=${params.limit}`,
        { signal: AbortSignal.timeout(5000) },
      )
      bridgeResults = await bridgeResp.json()
      // Filter events matching query
      if (bridgeResults.events) {
        const q = params.query.toLowerCase()
        bridgeResults.events = bridgeResults.events.filter((e: any) =>
          (e.title || '').toLowerCase().includes(q) ||
          (e.description || '').toLowerCase().includes(q) ||
          (e.event_type || '').toLowerCase().includes(q)
        )
      }
    } catch { /* bridge may not be running */ }

    // Also search in Redis Streams event store
    let streamResults: any[] = []
    try {
      const searchStream = Streams.INTEL_EVENTS
      const redis = new (await import('ioredis')).default(process.env.REDIS_URL || 'redis://localhost:6379')
      const messages = await redis.xrange(searchStream, '-', '+', 'COUNT', 100)
      if (messages) {
        const q = params.query.toLowerCase()
        for (const [, fields] of messages) {
          const fieldMap = Object.fromEntries(fields)
          try {
            const data = JSON.parse(fieldMap.data)
            if (
              (data.title || '').toLowerCase().includes(q) ||
              (data.description || '').toLowerCase().includes(q) ||
              (data.eventType || '').toLowerCase().includes(q)
            ) {
              streamResults.push(data)
            }
          } catch {}
        }
      }
      redis.disconnect()
    } catch {}

    return {
      success: true,
      data: {
        query: params.query,
        cognitive_results: cognitiveResults,
        bridge_events: bridgeResults.events?.slice(0, params.limit) || [],
        stream_events: streamResults.slice(0, params.limit),
        total: (cognitiveResults.results?.length || 0) + (bridgeResults.events?.length || 0) + streamResults.length,
      },
    }
  },
})

skillRegistry.register({
  name: 'sb_correlate',
  description: 'Correlacionar eventos de múltiples fuentes OSINT. Identifica patrones cruzados entre capas de datos geográficamente y temporalmente.',
  category: 'correlation',
  parameters: [
    { name: 'event_types', type: 'array', required: false, description: 'Tipos de evento a correlacionar', default: [] },
    { name: 'min_correlation_score', type: 'number', required: false, description: 'Score mínimo de correlación', default: 0.5 },
    { name: 'use_ai', type: 'boolean', required: false, description: 'Usar IA para análisis de correlación', default: true },
  ],
  streamTarget: Streams.INTEL_EVENTS,
  async execute(params, eventBus) {
    const bridgeUrl = process.env.BRIDGE_URL || 'http://localhost:8660'

    try {
      const response = await fetch(`${bridgeUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'correlation',
          use_ai: params.use_ai,
        }),
        signal: AbortSignal.timeout(60000),
      })
      const result = await response.json()

      // Publish correlation result
      await eventBus.publish(Streams.INTEL_EVENTS, {
        id: generateEventId(),
        type: 'shadowbroker.intel',
        source: 'shadowbroker-skill',
        timestamp: Date.now(),
        eventType: 'correlation_analysis',
        severity: 'medium',
        title: 'Cross-source correlation completed',
        description: `Found ${result.correlations_found || 0} correlations`,
        lat: null,
        lng: null,
        dataJson: JSON.stringify(result).substring(0, 2000),
      })

      return { success: true, data: result, eventsPublished: 1 }
    } catch (err: any) {
      return { success: false, data: null, message: `Correlation failed: ${err.message}` }
    }
  },
})

skillRegistry.register({
  name: 'sb_anomaly_detect',
  description: 'Ejecutar detección de anomalías en los datos OSINT en tiempo real. Identifica spikes de actividad, amenazas no detectadas y patrones inusuales.',
  category: 'analysis',
  parameters: [
    { name: 'layers', type: 'array', required: false, description: 'Capas específicas a analizar', default: [] },
    { name: 'sensitivity', type: 'string', required: false, description: 'Nivel de sensibilidad: low, medium, high', default: 'medium' },
  ],
  streamTarget: Streams.ALERTS,
  async execute(params, eventBus) {
    const bridgeUrl = process.env.BRIDGE_URL || 'http://localhost:8660'

    try {
      const response = await fetch(`${bridgeUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'anomaly' }),
        signal: AbortSignal.timeout(60000),
      })
      const result = await response.json()

      // If anomalies detected, publish alerts
      if (result.anomalies_detected > 0) {
        for (const anomaly of result.anomalies || []) {
          await eventBus.publish(Streams.ALERTS, {
            id: generateEventId(),
            type: 'system.alert',
            source: 'shadowbroker-skill',
            timestamp: Date.now(),
            severity: anomaly.type === 'threat_mismatch' ? 'critical' : 'high',
            title: `Anomaly: ${anomaly.label}`,
            message: JSON.stringify(anomaly),
            sendWhatsApp: anomaly.type === 'threat_mismatch',
            sendBundle: true,
          })
        }
      }

      return {
        success: true,
        data: result,
        eventsPublished: result.anomalies_detected || 0,
      }
    } catch (err: any) {
      return { success: false, data: null, message: `Anomaly detection failed: ${err.message}` }
    }
  },
})

skillRegistry.register({
  name: 'sb_report',
  description: 'Generar informe de inteligencia comprehensivo. Combina datos OSINT con análisis AI para producir un informe ejecutivo.',
  category: 'intelligence',
  parameters: [
    { name: 'report_type', type: 'string', required: false, description: 'Tipo: executive, tactical, full', default: 'executive' },
    { name: 'focus_regions', type: 'array', required: false, description: 'Regiones de enfoque [{lat, lng, name}]', default: [] },
  ],
  streamTarget: Streams.COGNITIVE_UPDATES,
  async execute(params, eventBus) {
    const bridgeUrl = process.env.BRIDGE_URL || 'http://localhost:8660'

    try {
      const response = await fetch(`${bridgeUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'report' }),
        signal: AbortSignal.timeout(60000),
      })
      const result = await response.json()

      // Store in Cognitive API
      const cognitiveUrl = process.env.COGNITIVE_URL || 'http://localhost:8645'
      try {
        await fetch(`${cognitiveUrl}/analysis/summarize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ period: 'adhoc' }),
          signal: AbortSignal.timeout(3000),
        })
      } catch {}

      // Publish cognitive update
      await eventBus.publish(Streams.COGNITIVE_UPDATES, {
        id: generateEventId(),
        type: 'cognitive.update',
        source: 'shadowbroker-skill',
        timestamp: Date.now(),
        entityType: 'summary',
        action: 'created',
        entityId: generateEventId(),
        data: JSON.stringify({ report_type: params.report_type, summary: result.analysis?.substring(0, 500) || '' }),
      })

      return { success: true, data: result, eventsPublished: 1 }
    } catch (err: any) {
      return { success: false, data: null, message: `Report generation failed: ${err.message}` }
    }
  },
})

skillRegistry.register({
  name: 'sb_monitor',
  description: 'Iniciar/detener monitoreo continuo de Shadowbroker. Configura umbrales de alerta y capas a monitorear.',
  category: 'monitoring',
  parameters: [
    { name: 'action', type: 'string', required: true, description: 'Acción: start, stop, status' },
    { name: 'alert_threshold', type: 'string', required: false, description: 'Umbral de alerta: low, medium, high, critical', default: 'high' },
    { name: 'layers', type: 'array', required: false, description: 'Capas a monitorear', default: [] },
    { name: 'poll_interval', type: 'number', required: false, description: 'Intervalo de polling en segundos', default: 30 },
  ],
  async execute(params, eventBus) {
    const bridgeUrl = process.env.BRIDGE_URL || 'http://localhost:8660'

    if (params.action === 'start') {
      try {
        const response = await fetch(`${bridgeUrl}/autopilot/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        })
        const result = await response.json()
        return { success: true, data: { status: 'monitoring_started', ...result } }
      } catch (err: any) {
        return { success: false, data: null, message: `Failed to start monitoring: ${err.message}` }
      }
    } else if (params.action === 'stop') {
      try {
        const response = await fetch(`${bridgeUrl}/autopilot/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        })
        const result = await response.json()
        return { success: true, data: { status: 'monitoring_stopped', ...result } }
      } catch (err: any) {
        return { success: false, data: null, message: `Failed to stop monitoring: ${err.message}` }
      }
    } else {
      // Status
      try {
        const response = await fetch(`${bridgeUrl}/status`, { signal: AbortSignal.timeout(5000) })
        const result = await response.json()
        return { success: true, data: result }
      } catch (err: any) {
        return { success: false, data: null, message: `Failed to get status: ${err.message}` }
      }
    }
  },
})

skillRegistry.register({
  name: 'sb_whatsapp_alert',
  description: 'Enviar alerta de inteligencia por WhatsApp. Formatea y envía información crítica directamente a contactos configurados.',
  category: 'communication',
  parameters: [
    { name: 'message', type: 'string', required: true, description: 'Mensaje de alerta' },
    { name: 'severity', type: 'string', required: false, description: 'Severidad: low, medium, high, critical', default: 'high' },
    { name: 'include_map_link', type: 'boolean', required: false, description: 'Incluir enlace al mapa', default: false },
    { name: 'lat', type: 'number', required: false, description: 'Latitud para enlace de mapa' },
    { name: 'lng', type: 'number', required: false, description: 'Longitud para enlace de mapa' },
  ],
  streamTarget: Streams.ALERTS,
  async execute(params, eventBus) {
    const hermesUrl = process.env.HERMES_URL || 'http://localhost:3001'

    // Format message
    let formattedMessage = `\u26a0\ufe0f *SHADOWBROKER ALERT* [${params.severity.toUpperCase()}]\n\n${params.message}\n\n_${new Date().toISOString()}_`

    if (params.include_map_link && params.lat && params.lng) {
      formattedMessage += `\n\n\ud83d\uddfa\ufe0f Mapa: https://www.openstreetmap.org/?mlat=${params.lat}&mlon=${params.lng}#map=10/${params.lat}/${params.lng}`
    }

    try {
      await fetch(`${hermesUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: formattedMessage, priority: params.severity }),
        signal: AbortSignal.timeout(5000),
      })

      // Publish alert event
      await eventBus.publish(Streams.ALERTS, {
        id: generateEventId(),
        type: 'system.alert',
        source: 'shadowbroker-skill',
        timestamp: Date.now(),
        severity: params.severity,
        title: `WhatsApp alert sent: ${params.severity}`,
        message: params.message,
        sendWhatsApp: true,
        sendBundle: false,
      })

      return { success: true, data: { sent: true, severity: params.severity }, eventsPublished: 1 }
    } catch (err: any) {
      return { success: false, data: null, message: `WhatsApp alert failed: ${err.message}` }
    }
  },
})

skillRegistry.register({
  name: 'sb_entity_track',
  description: 'Rastrear entidad específica a través de todas las capas de datos OSINT. Busca menciones de una persona, organización, lugar o evento.',
  category: 'intelligence',
  parameters: [
    { name: 'entity_name', type: 'string', required: true, description: 'Nombre de la entidad a rastrear' },
    { name: 'entity_type', type: 'string', required: false, description: 'Tipo: person, org, location, event, vessel, aircraft', default: 'any' },
    { name: 'time_range', type: 'string', required: false, description: 'Rango temporal: 1h, 24h, 7d, 30d', default: '24h' },
  ],
  streamTarget: Streams.INTEL_EVENTS,
  async execute(params, eventBus) {
    const sbUrl = process.env.SHADOWBROKER_URL || 'http://localhost:8000'
    const response = await fetch(`${sbUrl}/api/live-data`, { signal: AbortSignal.timeout(15000) })
    const data = await response.json()

    const entityName = params.entity_name.toLowerCase()
    const mentions: any[] = []

    // Search across all data layers
    for (const [layerKey, items] of Object.entries(data)) {
      if (!Array.isArray(items)) continue

      for (const item of items) {
        if (typeof item !== 'object') continue
        const itemStr = JSON.stringify(item).toLowerCase()

        if (itemStr.includes(entityName)) {
          mentions.push({
            layer: layerKey,
            match: item,
            matched_fields: Object.entries(item)
              .filter(([, v]) => typeof v === 'string' && v.toLowerCase().includes(entityName))
              .map(([k]) => k),
          })
        }
      }
    }

    // Also search in Cognitive API
    const cognitiveUrl = process.env.COGNITIVE_URL || 'http://localhost:8645'
    let cognitiveMatches: any[] = []
    try {
      const cogResp = await fetch(
        `${cognitiveUrl}/search?q=${encodeURIComponent(params.entity_name)}&limit=20`,
        { signal: AbortSignal.timeout(5000) },
      )
      const cogData = await cogResp.json()
      cognitiveMatches = cogData.results || []
    } catch {}

    // Publish tracking event
    await eventBus.publish(Streams.INTEL_EVENTS, {
      id: generateEventId(),
      type: 'shadowbroker.intel',
      source: 'shadowbroker-skill',
      timestamp: Date.now(),
      eventType: 'entity_tracking',
      severity: mentions.length > 0 ? 'medium' : 'info',
      title: `Entity tracked: ${params.entity_name}`,
      description: `Found ${mentions.length} OSINT mentions, ${cognitiveMatches.length} cognitive matches`,
      lat: mentions[0]?.match?.lat || null,
      lng: mentions[0]?.match?.lng || mentions[0]?.match?.lon || null,
      dataJson: JSON.stringify({ entity: params.entity_name, osint_mentions: mentions.length, cognitive_matches: cognitiveMatches.length }),
    })

    return {
      success: true,
      data: {
        entity: params.entity_name,
        entity_type: params.entity_type,
        osint_mentions: mentions.slice(0, 50),
        osint_mention_count: mentions.length,
        cognitive_matches: cognitiveMatches,
        by_layer: mentions.reduce((acc: any, m: any) => {
          acc[m.layer] = (acc[m.layer] || 0) + 1
          return acc
        }, {}),
      },
      eventsPublished: 1,
    }
  },
})

skillRegistry.register({
  name: 'sb_live_data',
  description: 'Obtener snapshot de datos en vivo de Shadowbroker. Devuelve todas las capas OSINT activas con sus conteos y datos de muestra.',
  category: 'intelligence',
  parameters: [
    { name: 'layers', type: 'array', required: false, description: 'Capas específicas a obtener', default: [] },
    { name: 'sample_size', type: 'number', required: false, description: 'Cantidad de items muestra por capa', default: 5 },
  ],
  async execute(params, eventBus) {
    const sbUrl = process.env.SHADOWBROKER_URL || 'http://localhost:8000'
    const response = await fetch(`${sbUrl}/api/live-data`, { signal: AbortSignal.timeout(15000) })
    const data = await response.json()

    const result: Record<string, any> = {
      threat_level: data.threat_level || 'unknown',
      timestamp: new Date().toISOString(),
      layers: {},
    }

    const layerFilter = params.layers?.length > 0 ? new Set(params.layers) : null

    for (const [key, val] of Object.entries(data)) {
      if (layerFilter && !layerFilter.has(key)) continue
      if (Array.isArray(val)) {
        result.layers[key] = {
          count: val.length,
          sample: val.slice(0, params.sample_size),
        }
      } else if (typeof val === 'object' && val !== null) {
        result.layers[key] = val
      }
    }

    return { success: true, data: result }
  },
})

skillRegistry.register({
  name: 'sb_nl_query',
  description: 'Consulta en lenguaje natural sobre la situación de inteligencia. La IA interpreta la pregunta y busca en los datos OSINT relevantes.',
  category: 'intelligence',
  parameters: [
    { name: 'question', type: 'string', required: true, description: 'Pregunta en lenguaje natural' },
  ],
  streamTarget: Streams.COGNITIVE_UPDATES,
  async execute(params, eventBus) {
    const bridgeUrl = process.env.BRIDGE_URL || 'http://localhost:8660'
    const openrouterKey = process.env.OPENROUTER_API_KEY || ''

    // First, get current data for context
    const sbUrl = process.env.SHADOWBROKER_URL || 'http://localhost:8000'
    let contextData: any = null
    try {
      const resp = await fetch(`${sbUrl}/api/live-data`, { signal: AbortSignal.timeout(10000) })
      contextData = await resp.json()
    } catch {}

    // Also get cognitive context
    const cognitiveUrl = process.env.COGNITIVE_URL || 'http://localhost:8645'
    let cognitiveContext: any = null
    try {
      const resp = await fetch(`${cognitiveUrl}/dashboard`, { signal: AbortSignal.timeout(3000) })
      cognitiveContext = await resp.json()
    } catch {}

    if (!openrouterKey) {
      return {
        success: false,
        data: null,
        message: 'OPENROUTER_API_KEY not configured. Cannot process natural language queries.',
      }
    }

    // Build context summary for AI
    const dataSummary: Record<string, number> = {}
    if (contextData) {
      for (const [key, val] of Object.entries(contextData)) {
        if (Array.isArray(val)) dataSummary[key] = val.length
      }
    }

    try {
      const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openrouterKey}`,
          'HTTP-Referer': 'https://whatomate.local',
          'X-Title': 'Shadowbroker-NL-Query',
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3-0324',
          messages: [
            {
              role: 'system',
              content: `You are a Shadowbroker OSINT intelligence analyst. Answer questions about the current intelligence situation based on the provided data. Be concise and actionable. Include specific data points when relevant. Respond in the same language as the question.`,
            },
            {
              role: 'user',
              content: `Question: ${params.question}\n\nOSINT DATA: ${JSON.stringify(dataSummary)}\nThreat Level: ${contextData?.threat_level || 'unknown'}\nCognitive Summary: ${cognitiveContext ? JSON.stringify({ entities: cognitiveContext.top_entities?.length, decisions: cognitiveContext.recent_decisions?.length }) : 'unavailable'}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 1500,
        }),
        signal: AbortSignal.timeout(60000),
      })

      const aiResult = await aiResponse.json()
      const answer = aiResult?.choices?.[0]?.message?.content || 'No response from AI'

      // Publish as cognitive update
      await eventBus.publish(Streams.COGNITIVE_UPDATES, {
        id: generateEventId(),
        type: 'cognitive.update',
        source: 'shadowbroker-skill',
        timestamp: Date.now(),
        entityType: 'summary',
        action: 'created',
        entityId: generateEventId(),
        data: JSON.stringify({ question: params.question, answer: answer.substring(0, 500) }),
      })

      return { success: true, data: { question: params.question, answer, data_context: dataSummary }, eventsPublished: 1 }
    } catch (err: any) {
      return { success: false, data: null, message: `NL query failed: ${err.message}` }
    }
  },
})

export default skillRegistry
