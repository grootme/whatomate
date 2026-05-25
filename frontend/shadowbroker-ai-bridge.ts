/**
 * Shadowbroker AI Bridge v2 — Event Sourcing con Redis Streams
 *
 * Express + TypeScript server that bridges Shadowbroker's real-time OSINT
 * intelligence data with AI analysis via OpenRouter, and integrates with the
 * Whatomate ecosystem (Cognitive API, Hermes, Real-Time Bundle).
 *
 * Port: 8660
 *
 * Capabilities:
 *   1. Data Collection — polls Shadowbroker backend, caches in SQLite
 *   2. AI Analysis — threat landscape, geospatial events, anomalies, reports
 *   3. Knowledge Integration — stores analyzed intel in Cognitive API
 *   4. WhatsApp Intelligence Feed — alerts via Hermes Bridge
 *   5. Real-Time Bundle Integration — forwards events to monitoring pipeline
 *   6. REST API + SSE for real-time intelligence events
 *   7. Auto-Pilot Mode — continuous monitoring, analysis, alerting
 *   8. Redis Streams — Event sourcing, consumer groups, cross-service events
 *   9. Skills System — 10+ declarative skills for OSINT operations
 *  10. Tools System — 5 reactive tools that auto-execute on stream events
 */

import Database from 'better-sqlite3'
import express from 'express'
import cors from 'cors'
import path from 'path'
import os from 'os'
import http from 'http'
import { EventBus, Streams, ConsumerGroups, generateEventId, createCorrelationContext, checkRedisHealth } from './lib/redis-streams.js'
import { skillRegistry } from './lib/shadowbroker/skills/index.js'
import { toolRegistry } from './lib/shadowbroker/tools/index.js'

// ─── Configuration ────────────────────────────────────────────────────────────

const SHADOWBROKER_URL = process.env.SHADOWBROKER_URL || 'http://localhost:8000'
const COGNITIVE_URL = process.env.COGNITIVE_URL || 'http://localhost:8645'
const HERMES_URL = process.env.HERMES_URL || 'http://localhost:3001'
const BUNDLE_URL = process.env.BUNDLE_URL || 'http://localhost:8650'
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '8660')

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''
if (!OPENROUTER_KEY) {
  console.warn('[sb-bridge] WARNING: OPENROUTER_API_KEY not set. AI analysis will not work.')
  console.warn('[sb-bridge] Set OPENROUTER_API_KEY environment variable to enable AI features.')
}
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3-0324'

const POLL_INTERVAL_MS = 30_000          // poll Shadowbroker every 30s
const THREAT_ANALYSIS_INTERVAL_MS = 300_000  // every 5 minutes
const ANOMALY_DETECT_INTERVAL_MS = 120_000   // every 2 minutes

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// ─── Database Setup ───────────────────────────────────────────────────────────

const DB_PATH = path.join(os.homedir(), '.hermes', 'shadowbroker_intel.db')
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS intel_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'shadowbroker',
    severity TEXT NOT NULL DEFAULT 'info',
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    data_json TEXT DEFAULT '{}',
    lat REAL,
    lng REAL,
    analyzed INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ai_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analysis_type TEXT NOT NULL,
    summary TEXT NOT NULL,
    details_json TEXT DEFAULT '{}',
    confidence REAL DEFAULT 0.5,
    model_used TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS threat_assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    threat_level TEXT NOT NULL DEFAULT 'low',
    category TEXT NOT NULL DEFAULT 'general',
    description TEXT DEFAULT '',
    recommendations_json TEXT DEFAULT '[]',
    confidence REAL DEFAULT 0.5,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS intel_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    severity TEXT NOT NULL DEFAULT 'medium',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    whatsapp_sent INTEGER DEFAULT 0,
    bundle_sent INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_ie_type ON intel_events(event_type);
  CREATE INDEX IF NOT EXISTS idx_ie_severity ON intel_events(severity);
  CREATE INDEX IF NOT EXISTS idx_ie_created ON intel_events(created_at);
  CREATE INDEX IF NOT EXISTS idx_aa_type ON ai_analyses(analysis_type);
  CREATE INDEX IF NOT EXISTS idx_ta_level ON threat_assessments(threat_level);
  CREATE INDEX IF NOT EXISTS idx_ia_severity ON intel_alerts(severity);
`)

// ─── Prepared Statements ──────────────────────────────────────────────────────

const stmtInsertEvent = db.prepare(`
  INSERT INTO intel_events (event_type, source, severity, title, description, data_json, lat, lng, analyzed)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
`)

const stmtMarkAnalyzed = db.prepare(`
  UPDATE intel_events SET analyzed = 1 WHERE id = ?
`)

const stmtInsertAnalysis = db.prepare(`
  INSERT INTO ai_analyses (analysis_type, summary, details_json, confidence, model_used)
  VALUES (?, ?, ?, ?, ?)
`)

const stmtInsertThreat = db.prepare(`
  INSERT INTO threat_assessments (threat_level, category, description, recommendations_json, confidence)
  VALUES (?, ?, ?, ?, ?)
`)

const stmtInsertAlert = db.prepare(`
  INSERT INTO intel_alerts (severity, title, message, whatsapp_sent, bundle_sent)
  VALUES (?, ?, ?, 0, 0)
`)

const stmtMarkAlertWhatsapp = db.prepare(`
  UPDATE intel_alerts SET whatsapp_sent = 1 WHERE id = ?
`)

const stmtMarkAlertBundle = db.prepare(`
  UPDATE intel_alerts SET bundle_sent = 1 WHERE id = ?
`)

// ─── State ────────────────────────────────────────────────────────────────────

let autoPilotEnabled = false
let pollTimer: ReturnType<typeof setInterval> | null = null
let threatTimer: ReturnType<typeof setInterval> | null = null
let anomalyTimer: ReturnType<typeof setInterval> | null = null
let bridgeStartTime = Date.now()
let lastLiveData: any = null
let lastHealthData: any = null
let lastPollTime: number = 0
let lastError: string | null = null
let shadowbrokerReachable = false

// Deduplication cache — stores event signatures seen in the last 10 minutes
const eventDedupe = new Map<string, number>()
const DEDUPE_TTL_MS = 10 * 60 * 1000

// SSE clients
const sseClients = new Set<http.ServerResponse>()

// ─── Redis Streams Event Bus ─────────────────────────────────────────────────

let eventBus: EventBus | null = null
let redisAvailable = false
let totalEventsPublished = 0

async function initEventBus(): Promise<void> {
  try {
    eventBus = new EventBus(ConsumerGroups.SHADOWBROKER_WORKERS, `sb-bridge-${process.pid}`)
    await eventBus.connect()
    redisAvailable = true
    console.log('[sb-bridge] Redis Streams Event Bus connected')

    // Register event bus with skills and tools
    skillRegistry.setEventBus(eventBus)

    // Start all reactive tools
    await toolRegistry.startAll(eventBus)

    console.log(`[sb-bridge] ${skillRegistry.listSkills().length} skills registered, ${toolRegistry.listTools().length} tools started`)
  } catch (err: any) {
    console.warn(`[sb-bridge] Redis not available, running without event bus: ${err.message}`)
    redisAvailable = false
    eventBus = null
  }
}

// ─── SSE Broadcast ────────────────────────────────────────────────────────────

function broadcastSSE(event: string, data: any): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of sseClients) {
    try { res.write(payload) } catch { /* client disconnected */ }
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function jsonParse(str: string | null | undefined, fallback: any = {}): any {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

function eventSignature(type: string, title: string, data?: any): string {
  // Create a dedup signature from event type + title + first 100 chars of data
  const dataStr = data ? JSON.stringify(data).substring(0, 100) : ''
  return `${type}::${title}::${dataStr}`
}

function pruneDedupeCache(): void {
  const now = Date.now()
  for (const [key, ts] of eventDedupe) {
    if (now - ts > DEDUPE_TTL_MS) eventDedupe.delete(key)
  }
}

function severityFromThreatLevel(level: string): 'low' | 'medium' | 'high' | 'critical' {
  switch (level) {
    case 'critical': return 'critical'
    case 'high': return 'high'
    case 'elevated': return 'high'
    case 'medium': return 'medium'
    case 'low': return 'low'
    default: return 'low'
  }
}

// ─── Shadowbroker Data Collection ─────────────────────────────────────────────

async function fetchShadowbrokerHealth(): Promise<any> {
  try {
    const resp = await fetch(`${SHADOWBROKER_URL}/api/health`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    shadowbrokerReachable = true
    lastHealthData = await resp.json()
    return lastHealthData
  } catch (err: any) {
    shadowbrokerReachable = false
    lastError = err.message
    return null
  }
}

async function fetchShadowbrokerLiveData(): Promise<any> {
  try {
    const resp = await fetch(`${SHADOWBROKER_URL}/api/live-data`, {
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    shadowbrokerReachable = true
    const data = await resp.json()
    lastLiveData = data
    lastPollTime = Date.now()
    return data
  } catch (err: any) {
    shadowbrokerReachable = false
    lastError = err.message
    return null
  }
}

async function fetchShadowbrokerSummary(): Promise<any> {
  try {
    const resp = await fetch(`${SHADOWBROKER_URL}/api/ai/summary`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return await resp.json()
  } catch {
    return null
  }
}

// Process live data into intel events
function processLiveData(data: any): void {
  if (!data || typeof data !== 'object') return

  pruneDedupeCache()

  const layerMappings: Record<string, { eventType: string; severity: string; nameKey: string; latKey: string; lngKey: string }> = {
    military_flights: { eventType: 'military_flight', severity: 'high', nameKey: 'callsign', latKey: 'lat', lngKey: 'lon' },
    ships:            { eventType: 'ship_tracking',   severity: 'medium', nameKey: 'name', latKey: 'lat', lngKey: 'lng' },
    earthquakes:      { eventType: 'earthquake',      severity: 'high', nameKey: 'title', latKey: 'lat', lngKey: 'lng' },
    gdelt:            { eventType: 'gdelt_event',     severity: 'medium', nameKey: 'name', latKey: '', lngKey: '' },
    news:             { eventType: 'news_article',    severity: 'medium', nameKey: 'title', latKey: 'lat', lngKey: 'lng' },
    firms_fires:      { eventType: 'fire_detection',  severity: 'high', nameKey: '', latKey: 'lat', lngKey: 'lng' },
    gps_jamming:      { eventType: 'gps_jamming',     severity: 'critical', nameKey: '', latKey: 'lat', lngKey: 'lng' },
    weather_alerts:   { eventType: 'weather_alert',   severity: 'high', nameKey: 'event', latKey: 'lat', lngKey: 'lng' },
    uavs:             { eventType: 'uav_detection',   severity: 'high', nameKey: 'callsign', latKey: 'lat', lngKey: 'lng' },
    liveuamap:        { eventType: 'conflict_event',  severity: 'high', nameKey: 'title', latKey: 'lat', lngKey: 'lng' },
    correlations:     { eventType: 'correlation',     severity: 'high', nameKey: 'description', latKey: '', lngKey: '' },
    crowdthreat:      { eventType: 'crowd_threat',    severity: 'high', nameKey: 'title', latKey: 'lat', lngKey: 'lng' },
    sigint:           { eventType: 'sigint_intercept', severity: 'medium', nameKey: 'callsign', latKey: 'lat', lngKey: 'lng' },
  }

  for (const [layerKey, mapping] of Object.entries(layerMappings)) {
    const items = data[layerKey]
    if (!Array.isArray(items)) continue

    // Only process recent/high-severity items to avoid flooding
    const maxItems = Math.min(items.length, 50)
    for (let i = 0; i < maxItems; i++) {
      const item = items[i]
      if (!item || typeof item !== 'object') continue

      const title = String(item[mapping.nameKey] || `${mapping.eventType} ${i}`).substring(0, 200)
      const sig = eventSignature(mapping.eventType, title, item)

      if (eventDedupe.has(sig)) continue
      eventDedupe.set(sig, Date.now())

      const lat = item[mapping.latKey] ?? item.lat ?? null
      const lng = item[mapping.lngKey] ?? item.lon ?? item.lng ?? null

      // Only store items with geospatial data or high severity
      const hasGeo = lat != null && lng != null
      const isHigh = mapping.severity === 'high' || mapping.severity === 'critical'
      if (!hasGeo && !isHigh) continue

      try {
        stmtInsertEvent.run(
          mapping.eventType,
          'shadowbroker',
          mapping.severity,
          title,
          `Auto-ingested from ${layerKey} layer`,
          JSON.stringify(item).substring(0, 4000),
          lat != null ? Number(lat) : null,
          lng != null ? Number(lng) : null,
        )

        // Publish to Redis Stream
        if (eventBus && redisAvailable && (mapping.severity === 'high' || mapping.severity === 'critical')) {
          eventBus.publish(Streams.INTEL_EVENTS, {
            id: generateEventId(),
            type: 'shadowbroker.intel',
            source: 'shadowbroker-ai-bridge',
            timestamp: Date.now(),
            eventType: mapping.eventType,
            severity: mapping.severity,
            title,
            description: `Auto-ingested from ${layerKey} layer`,
            lat: lat != null ? Number(lat) : null,
            lng: lng != null ? Number(lng) : null,
            dataJson: JSON.stringify(item).substring(0, 2000),
          }).then(() => { totalEventsPublished++ }).catch(() => {})
        }
      } catch { /* skip malformed entries */ }
    }
  }
}

// ─── AI Analysis Engine (OpenRouter) ──────────────────────────────────────────

async function analyzeWithAI(prompt: string, context: string): Promise<string> {
  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://whatomate.local',
        'X-Title': 'Shadowbroker-AI-Bridge',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an OSINT intelligence analyst. Analyze the provided data and give concise, structured assessments. Use clear threat levels (low/medium/high/critical). Focus on actionable intelligence. Format your response with clear sections and bullet points where appropriate.`,
          },
          {
            role: 'user',
            content: `${prompt}\n\n---\nINTELLIGENCE DATA:\n${context.substring(0, 6000)}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '')
      throw new Error(`OpenRouter HTTP ${resp.status}: ${errBody.substring(0, 200)}`)
    }

    const result = await resp.json() as any
    const content = result?.choices?.[0]?.message?.content
    if (!content) throw new Error('Empty AI response')
    return content
  } catch (err: any) {
    console.error(`[sb-bridge] AI analysis error: ${err.message}`)
    throw err
  }
}

// ─── Analysis Functions ───────────────────────────────────────────────────────

async function analyzeThreatLandscape(data: any): Promise<any> {
  if (!data) return { error: 'No data available', threat_level: 'unknown' }

  // Build a concise data summary for the AI
  const summary: Record<string, any> = {}
  const countKeys = [
    'military_flights', 'ships', 'earthquakes', 'gdelt', 'news',
    'firms_fires', 'gps_jamming', 'weather_alerts', 'uavs',
    'liveuamap', 'correlations', 'crowdthreat', 'sigint',
    'tracked_flights', 'private_jets', 'commercial_flights',
  ]
  for (const key of countKeys) {
    const items = data[key]
    summary[key] = Array.isArray(items) ? items.length : 0
  }
  summary.threat_level = data.threat_level || 'unknown'
  summary.sigint_totals = data.sigint_totals || {}

  // Sample high-severity items
  const highSeverityItems: any[] = []
  for (const key of ['military_flights', 'gps_jamming', 'earthquakes', 'correlations', 'crowdthreat']) {
    const items = data[key]
    if (Array.isArray(items)) {
      for (const item of items.slice(0, 3)) {
        highSeverityItems.push({ layer: key, ...(typeof item === 'object' ? item : { value: item }) })
      }
    }
  }

  const prompt = `Analyze the current threat landscape from this OSINT data. Provide:
1. Overall Threat Level (low/medium/high/critical)
2. Key Threats (top 3-5 most significant)
3. Geographic Hotspots
4. Recommended Actions
5. Confidence Level (0-1)`

  const context = JSON.stringify({ summary, high_severity_samples: highSeverityItems.slice(0, 15) }, null, 2)

  try {
    const aiResult = await analyzeWithAI(prompt, context)

    // Determine threat level from AI response
    let detectedLevel = 'medium'
    const lowerResult = aiResult.toLowerCase()
    if (lowerResult.includes('critical') && (lowerResult.includes('threat level') || lowerResult.includes('overall'))) {
      detectedLevel = 'critical'
    } else if (lowerResult.includes('high') && (lowerResult.includes('threat level') || lowerResult.includes('overall'))) {
      detectedLevel = 'high'
    } else if (lowerResult.includes('low') && (lowerResult.includes('threat level') || lowerResult.includes('overall'))) {
      detectedLevel = 'low'
    }

    // Extract confidence
    let confidence = 0.7
    const confMatch = lowerResult.match(/confidence[:\s]+(0?\.\d+|1\.0|1)/)
    if (confMatch) confidence = Math.min(1, Math.max(0, parseFloat(confMatch[1])))

    // Store analysis
    stmtInsertAnalysis.run('threat_landscape', aiResult.substring(0, 4000), JSON.stringify({ summary, detectedLevel }), confidence, OPENROUTER_MODEL)

    // Store threat assessment
    stmtInsertThreat.run(detectedLevel, 'general', aiResult.substring(0, 2000), JSON.stringify([
      'Monitor all active threat vectors',
      'Review geographic hotspots for escalation',
      'Cross-reference with previous assessments',
    ]), confidence)

    // Broadcast
    broadcastSSE('threat_analysis', { threat_level: detectedLevel, confidence, summary: aiResult.substring(0, 500) })

    // Publish threat assessment to Redis Stream
    if (eventBus && redisAvailable) {
      eventBus.publish(Streams.THREAT_ASSESSMENTS, {
        id: generateEventId(),
        type: 'shadowbroker.threat',
        source: 'shadowbroker-ai-bridge',
        timestamp: Date.now(),
        threatLevel: detectedLevel,
        category: 'general',
        description: aiResult.substring(0, 2000),
        confidence,
        recommendations: [
          'Monitor all active threat vectors',
          'Review geographic hotspots for escalation',
          'Cross-reference with previous assessments',
        ],
      }).then(() => { totalEventsPublished++ }).catch(() => {})
    }

    return { threat_level: detectedLevel, confidence, analysis: aiResult, data_summary: summary }
  } catch (err: any) {
    // Fallback to basic heuristic analysis
    const heuristicLevel = summary.gps_jamming > 5 ? 'critical'
      : (summary.military_flights > 20 || summary.correlations > 10) ? 'high'
      : summary.gdelt > 50 ? 'medium' : 'low'

    stmtInsertThreat.run(heuristicLevel, 'general', 'Heuristic fallback analysis (AI unavailable)', JSON.stringify(['Review data manually']), 0.3)

    return { threat_level: heuristicLevel, confidence: 0.3, analysis: 'AI unavailable — heuristic assessment', data_summary: summary, error: err.message }
  }
}

async function analyzeGeospatialEvents(events: any[]): Promise<any> {
  if (!events || events.length === 0) return { error: 'No events to analyze' }

  const geoEvents = events.filter((e: any) => e.lat != null && e.lng != null)
  if (geoEvents.length === 0) return { error: 'No geospatial events found' }

  // Cluster events by proximity (simple grid-based)
  const clusters: Record<string, any[]> = {}
  for (const event of geoEvents) {
    const gridKey = `${Math.floor(Number(event.lat) * 2)}_${Math.floor(Number(event.lng) * 2)}`
    if (!clusters[gridKey]) clusters[gridKey] = []
    clusters[gridKey].push(event)
  }

  const topClusters = Object.entries(clusters)
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, 5)
    .map(([key, items]) => ({
      grid: key,
      count: items.length,
      center_lat: items.reduce((s: number, i: any) => s + Number(i.lat), 0) / items.length,
      center_lng: items.reduce((s: number, i: any) => s + Number(i.lng), 0) / items.length,
      types: [...new Set(items.map((i: any) => i.event_type))],
      sample_titles: items.slice(0, 3).map((i: any) => i.title),
    }))

  const prompt = `Analyze these geospatial event clusters from OSINT data. Identify:
1. Patterns across clusters
2. Potential coordinated activity
3. Regional threat concentrations
4. Correlation between event types in same areas`

  const context = JSON.stringify({ total_events: geoEvents.length, cluster_count: Object.keys(clusters).length, top_clusters: topClusters }, null, 2)

  try {
    const aiResult = await analyzeWithAI(prompt, context)
    stmtInsertAnalysis.run('geospatial_events', aiResult.substring(0, 4000), JSON.stringify({ cluster_count: Object.keys(clusters).length, topClusters }), 0.75, OPENROUTER_MODEL)

    broadcastSSE('geospatial_analysis', { clusters: topClusters, analysis: aiResult.substring(0, 500) })

    return { total_events: geoEvents.length, clusters: topClusters, analysis: aiResult }
  } catch (err: any) {
    return { total_events: geoEvents.length, clusters: topClusters, error: err.message }
  }
}

async function generateIntelReport(summary: any): Promise<any> {
  // Try Shadowbroker's own report endpoint first
  try {
    const resp = await fetch(`${SHADOWBROKER_URL}/api/ai/report`, {
      signal: AbortSignal.timeout(10000),
    })
    if (resp.ok) {
      const sbReport = await resp.json()
      // Enhance with AI
      const prompt = `Enhance this intelligence report with strategic analysis and recommendations. The report data is from Shadowbroker OSINT platform.`
      const aiResult = await analyzeWithAI(prompt, JSON.stringify(sbReport).substring(0, 5000))

      stmtInsertAnalysis.run('intel_report', aiResult.substring(0, 4000), JSON.stringify(sbReport).substring(0, 4000), 0.8, OPENROUTER_MODEL)

      return { ...sbReport, ai_enhancement: aiResult }
    }
  } catch { /* fallback to local report generation */ }

  // Generate locally
  const data = summary || lastLiveData
  if (!data) return { error: 'No data available for report generation' }

  const prompt = `Generate a comprehensive intelligence report from this OSINT data. Include:
1. Executive Summary
2. Threat Assessment
3. Geospatial Analysis
4. SIGINT Overview
5. Maritime/Air Activity
6. Notable Events
7. Recommendations`

  const context = JSON.stringify(data).substring(0, 6000)

  try {
    const aiResult = await analyzeWithAI(prompt, context)
    stmtInsertAnalysis.run('intel_report', aiResult.substring(0, 4000), context.substring(0, 2000), 0.8, OPENROUTER_MODEL)

    broadcastSSE('report', { summary: aiResult.substring(0, 300) })

    return { title: `Intelligence Report — ${new Date().toISOString()}`, analysis: aiResult, generated_at: new Date().toISOString() }
  } catch (err: any) {
    return { error: err.message }
  }
}

async function detectAnomalies(data: any): Promise<any> {
  if (!data) return { error: 'No data available' }

  const anomalies: any[] = []

  // Check for unusual spikes in data
  const thresholdMap: Record<string, { key: string; normalMax: number; label: string }> = {
    military_flights: { key: 'military_flights', normalMax: 50, label: 'Military flight activity spike' },
    gps_jamming:      { key: 'gps_jamming', normalMax: 10, label: 'GPS jamming activity spike' },
    earthquakes:      { key: 'earthquakes', normalMax: 30, label: 'Seismic activity spike' },
    correlations:     { key: 'correlations', normalMax: 20, label: 'Intelligence correlation spike' },
    crowdthreat:      { key: 'crowdthreat', normalMax: 15, label: 'Crowd threat activity spike' },
  }

  for (const [, config] of Object.entries(thresholdMap)) {
    const items = data[config.key]
    const count = Array.isArray(items) ? items.length : 0
    if (count > config.normalMax) {
      anomalies.push({
        type: 'spike',
        layer: config.key,
        label: config.label,
        value: count,
        threshold: config.normalMax,
        ratio: (count / config.normalMax).toFixed(2),
      })
    }
  }

  // Check for threat level mismatches
  const currentThreat = data.threat_level
  const highActivityLayers = ['military_flights', 'gps_jamming', 'correlations', 'crowdthreat']
  let highActivityCount = 0
  for (const layer of highActivityLayers) {
    const items = data[layer]
    if (Array.isArray(items) && items.length > 0) highActivityCount++
  }
  if (highActivityCount >= 3 && currentThreat !== 'critical' && currentThreat !== 'high') {
    anomalies.push({
      type: 'threat_mismatch',
      label: 'High activity across multiple threat layers but threat level is not elevated',
      current_threat_level: currentThreat,
      active_threat_layers: highActivityCount,
    })
  }

  // Check for SIGINT anomalies
  const sigintTotals = data.sigint_totals || {}
  if (sigintTotals.meshtastic > 100 || sigintTotals.aprs > 50) {
    anomalies.push({
      type: 'sigint_volume',
      label: 'Unusual SIGINT volume detected',
      details: sigintTotals,
    })
  }

  if (anomalies.length === 0) {
    return { anomalies_detected: 0, status: 'normal' }
  }

  // Use AI to analyze anomalies
  const prompt = `Analyze these detected anomalies from OSINT data. For each anomaly, assess:
1. Severity and urgency
2. Potential causes
3. Recommended immediate actions
4. Whether this represents a developing threat`

  const context = JSON.stringify({ anomalies, data_summary: Object.fromEntries(
    Object.entries(data).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as any[]).length])
  )}, null, 2)

  try {
    const aiResult = await analyzeWithAI(prompt, context)
    stmtInsertAnalysis.run('anomaly_detection', aiResult.substring(0, 4000), JSON.stringify(anomalies).substring(0, 2000), 0.8, OPENROUTER_MODEL)

    // Create alerts for critical anomalies
    for (const anomaly of anomalies) {
      const severity = anomaly.type === 'threat_mismatch' ? 'critical' : 'high'
      stmtInsertAlert.run(severity, anomaly.label, `Anomaly detected: ${JSON.stringify(anomaly)}`)
    }

    broadcastSSE('anomaly', { anomalies, analysis: aiResult.substring(0, 500) })

    return { anomalies_detected: anomalies.length, anomalies, analysis: aiResult }
  } catch (err: any) {
    return { anomalies_detected: anomalies.length, anomalies, error: err.message }
  }
}

async function correlateEvents(events: any[]): Promise<any> {
  if (!events || events.length < 2) return { error: 'Need at least 2 events for correlation' }

  // Group events by proximity and time
  const geoGroups: Record<string, any[]> = {}
  const timeGroups: Record<string, any[]> = {}

  for (const event of events) {
    // Geographic grouping (2-degree grid)
    if (event.lat != null && event.lng != null) {
      const geoKey = `${Math.floor(Number(event.lat))}_${Math.floor(Number(event.lng))}`
      if (!geoGroups[geoKey]) geoGroups[geoKey] = []
      geoGroups[geoKey].push(event)
    }

    // Type grouping
    const typeKey = event.event_type || 'unknown'
    if (!timeGroups[typeKey]) timeGroups[typeKey] = []
    timeGroups[typeKey].push(event)
  }

  // Find cross-source correlations in same geographic area
  const crossSourceCorrelations: any[] = []
  for (const [, groupEvents] of Object.entries(geoGroups)) {
    if (groupEvents.length < 2) continue
    const sources = new Set(groupEvents.map((e: any) => e.source || e.event_type))
    if (sources.size >= 2) {
      crossSourceCorrelations.push({
        location: { lat: groupEvents[0].lat, lng: groupEvents[0].lng },
        event_count: groupEvents.length,
        sources: [...sources],
        events: groupEvents.slice(0, 5).map((e: any) => ({ type: e.event_type, title: e.title })),
      })
    }
  }

  const prompt = `Cross-reference these intelligence events from multiple OSINT sources. Identify:
1. Events that may be causally linked
2. Coordinated activity patterns
3. Supply chain or logistic correlations
4. Temporal sequences that suggest operations`

  const context = JSON.stringify({
    total_events: events.length,
    cross_source_correlations: crossSourceCorrelations.slice(0, 10),
    event_types: Object.fromEntries(Object.entries(timeGroups).map(([k, v]) => [k, v.length])),
  }, null, 2)

  try {
    const aiResult = await analyzeWithAI(prompt, context)
    stmtInsertAnalysis.run('correlation', aiResult.substring(0, 4000), JSON.stringify(crossSourceCorrelations).substring(0, 2000), 0.7, OPENROUTER_MODEL)

    return { correlations_found: crossSourceCorrelations.length, cross_source: crossSourceCorrelations, analysis: aiResult }
  } catch (err: any) {
    return { correlations_found: crossSourceCorrelations.length, cross_source: crossSourceCorrelations, error: err.message }
  }
}

// ─── Knowledge Integration (Cognitive API) ────────────────────────────────────

async function storeEntityInCognitive(name: string, type: string, attributes: Record<string, any>): Promise<void> {
  try {
    await fetch(`${COGNITIVE_URL}/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type, attributes }),
      signal: AbortSignal.timeout(3000),
    })
  } catch { /* Cognitive API may not be running */ }
}

async function storeDecisionInCognitive(title: string, description: string, context: string, confidence: number): Promise<void> {
  try {
    await fetch(`${COGNITIVE_URL}/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, context, decision_maker: 'shadowbroker-ai', status: 'pending', confidence }),
      signal: AbortSignal.timeout(3000),
    })
  } catch { /* Cognitive API may not be running */ }
}

async function storePatternInCognitive(name: string, patternType: string, description: string, data: any): Promise<void> {
  try {
    await fetch(`${COGNITIVE_URL}/patterns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pattern_type: patternType, description, confidence: 0.6, data }),
      signal: AbortSignal.timeout(3000),
    })
  } catch { /* Cognitive API may not be running */ }
}

async function syncAnalysisToCognitive(analysisType: string, summary: string, details: any): Promise<void> {
  // Store key entities extracted from analysis
  const entityTypes: Record<string, string> = {
    threat_landscape: 'threat_assessment',
    geospatial_events: 'geospatial_cluster',
    anomaly_detection: 'anomaly',
    correlation: 'intelligence_correlation',
    intel_report: 'intelligence_report',
  }

  await storeEntityInCognitive(
    `SB-${analysisType}-${new Date().toISOString().split('T')[0]}`,
    entityTypes[analysisType] || 'osint_analysis',
    { summary: summary.substring(0, 500), source: 'shadowbroker', analysis_type: analysisType, details },
  )

  // Store as decision if threat-related
  if (analysisType === 'threat_landscape' || analysisType === 'anomaly_detection') {
    await storeDecisionInCognitive(
      `Shadowbroker ${analysisType}`,
      summary.substring(0, 500),
      JSON.stringify(details).substring(0, 500),
      0.7,
    )
  }

  // Store as pattern for recurring analysis
  await storePatternInCognitive(
    `SB Pattern: ${analysisType}`,
    analysisType,
    summary.substring(0, 300),
    details,
  )
}

// ─── WhatsApp Intelligence Feed (Hermes Bridge) ──────────────────────────────

async function sendWhatsAppAlert(message: string, severity: string): Promise<boolean> {
  try {
    // Format message for WhatsApp
    const formattedMessage = `\u26a0\ufe0f *SHADOWBROKER ALERT* [${severity.toUpperCase()}]\n\n${message}\n\n_${new Date().toISOString()}_`

    await fetch(`${HERMES_URL}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: formattedMessage, priority: severity }),
      signal: AbortSignal.timeout(5000),
    })
    return true
  } catch (err: any) {
    console.error(`[sb-bridge] WhatsApp alert failed: ${err.message}`)
    return false
  }
}

async function processAlertQueue(): Promise<void> {
  // Get unsent alerts, sorted by severity
  const alerts = db.prepare(
    `SELECT * FROM intel_alerts WHERE whatsapp_sent = 0 ORDER BY 
     CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
     created_at DESC LIMIT 10`
  ).all() as any[]

  for (const alert of alerts) {
    // Critical: immediate WhatsApp
    // High: queued (send now as batch)
    // Medium: skip WhatsApp, just mark
    if (alert.severity === 'critical' || alert.severity === 'high') {
      const sent = await sendWhatsAppAlert(alert.message, alert.severity)
      if (sent) stmtMarkAlertWhatsapp.run(alert.id)
    } else {
      // Medium — just mark as processed
      stmtMarkAlertWhatsapp.run(alert.id)
    }

    // Publish alert to Redis Stream
    if (eventBus && redisAvailable) {
      eventBus.publish(Streams.ALERTS, {
        id: generateEventId(),
        type: 'system.alert',
        source: 'shadowbroker-ai-bridge',
        timestamp: Date.now(),
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        sendWhatsApp: alert.severity === 'critical' || alert.severity === 'high',
        sendBundle: true,
      }).then(() => { totalEventsPublished++ }).catch(() => {})
    }
  }
}

// ─── Real-Time Bundle Integration ─────────────────────────────────────────────

async function forwardToBundle(eventType: string, data: any, severity: string): Promise<void> {
  try {
    await fetch(`${BUNDLE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: `sb_${eventType}`,
        source: 'shadowbroker-ai-bridge',
        severity,
        title: `Shadowbroker: ${eventType}`,
        description: JSON.stringify(data).substring(0, 500),
        data: JSON.stringify(data),
      }),
      signal: AbortSignal.timeout(3000),
    })
  } catch { /* Bundle may not be running */ }
}

async function forwardUnsentToBundle(): Promise<void> {
  const alerts = db.prepare(
    "SELECT * FROM intel_alerts WHERE bundle_sent = 0 AND severity IN ('critical', 'high') ORDER BY created_at DESC LIMIT 10"
  ).all() as any[]

  for (const alert of alerts) {
    await forwardToBundle(alert.title, { message: alert.message, severity: alert.severity }, alert.severity)
    stmtMarkAlertBundle.run(alert.id)
  }
}

// ─── Auto-Pilot Mode ─────────────────────────────────────────────────────────

async function autopilotPoll(): Promise<void> {
  const data = await fetchShadowbrokerLiveData()
  if (!data) return

  processLiveData(data)

  // Quick health check
  await fetchShadowbrokerHealth()

  // Forward key events to bundle
  await forwardUnsentToBundle()

  broadcastSSE('poll', { timestamp: Date.now(), reachable: shadowbrokerReachable })
}

async function autopilotThreatAnalysis(): Promise<void> {
  if (!lastLiveData) return

  console.log('[sb-bridge] Auto-pilot: running threat analysis...')
  const result = await analyzeThreatLandscape(lastLiveData)

  // Check if threat level changed
  const latestThreat = db.prepare(
    "SELECT threat_level FROM threat_assessments ORDER BY created_at DESC LIMIT 1"
  ).get() as any
  const previousThreat = db.prepare(
    "SELECT threat_level FROM threat_assessments ORDER BY created_at DESC LIMIT 1 OFFSET 1"
  ).get() as any

  if (latestThreat && previousThreat && latestThreat.threat_level !== previousThreat.threat_level) {
    const severity = severityFromThreatLevel(latestThreat.threat_level)
    stmtInsertAlert.run(
      severity,
      `Threat Level Changed: ${previousThreat.threat_level} → ${latestThreat.threat_level}`,
      `Threat assessment updated. New level: ${latestThreat.threat_level}. ${result.analysis?.substring(0, 200) || ''}`,
    )
  }

  // Sync to Cognitive API
  await syncAnalysisToCognitive('threat_landscape', result.analysis || '', result)
}

async function autopilotAnomalyDetection(): Promise<void> {
  if (!lastLiveData) return

  console.log('[sb-bridge] Auto-pilot: running anomaly detection...')
  const result = await detectAnomalies(lastLiveData)

  if (result.anomalies_detected > 0) {
    // Sync anomalies to Cognitive API
    await syncAnalysisToCognitive('anomaly_detection', result.analysis || JSON.stringify(result.anomalies), result)

    // Process alert queue (send WhatsApp for critical/high)
    await processAlertQueue()
  }
}

function startAutoPilot(): void {
  if (autoPilotEnabled) return
  autoPilotEnabled = true

  console.log('[sb-bridge] Auto-pilot mode activated')

  // Initial poll
  autopilotPoll()

  // Poll Shadowbroker every 30s
  pollTimer = setInterval(autopilotPoll, POLL_INTERVAL_MS)

  // Threat analysis every 5 minutes
  threatTimer = setInterval(autopilotThreatAnalysis, THREAT_ANALYSIS_INTERVAL_MS)

  // Anomaly detection every 2 minutes
  anomalyTimer = setInterval(autopilotAnomalyDetection, ANOMALY_DETECT_INTERVAL_MS)

  broadcastSSE('autopilot', { enabled: true, timestamp: Date.now() })
}

function stopAutoPilot(): void {
  if (!autoPilotEnabled) return
  autoPilotEnabled = false

  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  if (threatTimer) { clearInterval(threatTimer); threatTimer = null }
  if (anomalyTimer) { clearInterval(anomalyTimer); anomalyTimer = null }

  console.log('[sb-bridge] Auto-pilot mode deactivated')
  broadcastSSE('autopilot', { enabled: false, timestamp: Date.now() })
}

// ─── REST API Endpoints ──────────────────────────────────────────────────────

// GET /health
app.get('/health', async (_req, res) => {
  const sbHealth = await fetchShadowbrokerHealth()

  res.json({
    status: 'ok',
    service: 'shadowbroker-ai-bridge',
    port: BRIDGE_PORT,
    uptime_seconds: Math.floor((Date.now() - bridgeStartTime) / 1000),
    autopilot: autoPilotEnabled,
    shadowbroker: {
      url: SHADOWBROKER_URL,
      reachable: shadowbrokerReachable,
      last_poll: lastPollTime ? new Date(lastPollTime).toISOString() : null,
      health: sbHealth ? { status: sbHealth.status, version: sbHealth.version } : null,
      last_error: lastError,
    },
    database: DB_PATH,
    integrations: {
      cognitive_api: COGNITIVE_URL,
      hermes: HERMES_URL,
      realtime_bundle: BUNDLE_URL,
      openrouter: OPENROUTER_MODEL,
    },
  })
})

// GET /dashboard
app.get('/dashboard', (_req, res) => {
  try {
    const currentThreat = db.prepare(
      "SELECT * FROM threat_assessments ORDER BY created_at DESC LIMIT 1"
    ).get() as any

    const recentAlerts = db.prepare(
      "SELECT * FROM intel_alerts ORDER BY created_at DESC LIMIT 10"
    ).all() as any[]

    const recentAnalyses = db.prepare(
      "SELECT * FROM ai_analyses ORDER BY created_at DESC LIMIT 10"
    ).all() as any[]

    const eventStats = db.prepare(
      "SELECT event_type, COUNT(*) as count, MAX(created_at) as latest FROM intel_events GROUP BY event_type ORDER BY count DESC"
    ).all() as any[]

    const severityStats = db.prepare(
      "SELECT severity, COUNT(*) as count FROM intel_alerts GROUP BY severity"
    ).all() as any[]

    const totalEvents = (db.prepare('SELECT COUNT(*) as c FROM intel_events').get() as any)?.c || 0
    const unanalyzed = (db.prepare('SELECT COUNT(*) as c FROM intel_events WHERE analyzed = 0').get() as any)?.c || 0
    const totalAnalyses = (db.prepare('SELECT COUNT(*) as c FROM ai_analyses').get() as any)?.c || 0
    const totalAlerts = (db.prepare('SELECT COUNT(*) as c FROM intel_alerts').get() as any)?.c || 0

    const eventsLastHour = (db.prepare(
      "SELECT COUNT(*) as c FROM intel_events WHERE created_at > datetime('now', '-1 hour')"
    ).get() as any)?.c || 0

    res.json({
      autopilot: autoPilotEnabled,
      uptime_seconds: Math.floor((Date.now() - bridgeStartTime) / 1000),
      threat_level: currentThreat ? {
        level: currentThreat.threat_level,
        category: currentThreat.category,
        confidence: currentThreat.confidence,
        assessed_at: currentThreat.created_at,
      } : null,
      shadowbroker: {
        reachable: shadowbrokerReachable,
        last_poll: lastPollTime ? new Date(lastPollTime).toISOString() : null,
        health_status: lastHealthData?.status,
      },
      stats: {
        total_events: totalEvents,
        unanalyzed_events: unanalyzed,
        total_analyses: totalAnalyses,
        total_alerts: totalAlerts,
        events_last_hour: eventsLastHour,
      },
      severity_distribution: Object.fromEntries(severityStats.map(s => [s.severity, s.count])),
      event_type_distribution: eventStats,
      recent_alerts: recentAlerts,
      recent_analyses: recentAnalyses.map(a => ({
        ...a,
        details_json: jsonParse(a.details_json, {}),
      })),
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /status
app.get('/status', async (_req, res) => {
  const sbHealth = await fetchShadowbrokerHealth()
  res.json({
    shadowbroker_url: SHADOWBROKER_URL,
    reachable: shadowbrokerReachable,
    health: sbHealth,
    last_poll: lastPollTime ? new Date(lastPollTime).toISOString() : null,
    last_error: lastError,
    data_available: !!lastLiveData,
    data_layers: lastLiveData ? Object.keys(lastLiveData).filter(k => Array.isArray(lastLiveData[k]) && lastLiveData[k].length > 0) : [],
  })
})

// POST /analyze
app.post('/analyze', async (req, res) => {
  try {
    const { type, data: overrideData, prompt: customPrompt } = req.body
    const analysisData = overrideData || lastLiveData

    if (!analysisData) {
      return res.status(400).json({ error: 'No data available. Ensure Shadowbroker backend is running.' })
    }

    let result: any
    switch (type || 'threat') {
      case 'threat':
        result = await analyzeThreatLandscape(analysisData)
        break
      case 'geospatial': {
        const events = db.prepare(
          "SELECT * FROM intel_events WHERE lat IS NOT NULL AND lng IS NOT NULL ORDER BY created_at DESC LIMIT 200"
        ).all() as any[]
        result = await analyzeGeospatialEvents(events)
        break
      }
      case 'anomaly':
        result = await detectAnomalies(analysisData)
        break
      case 'correlate': {
        const events = db.prepare(
          "SELECT * FROM intel_events ORDER BY created_at DESC LIMIT 200"
        ).all() as any[]
        result = await correlateEvents(events)
        break
      }
      case 'custom': {
        if (!customPrompt) return res.status(400).json({ error: 'custom prompt required for type=custom' })
        const aiResult = await analyzeWithAI(customPrompt, JSON.stringify(analysisData).substring(0, 6000))
        stmtInsertAnalysis.run('custom', aiResult.substring(0, 4000), '{}', 0.6, OPENROUTER_MODEL)
        result = { type: 'custom', analysis: aiResult }
        break
      }
      default:
        return res.status(400).json({ error: `Unknown analysis type: ${type}. Use: threat, geospatial, anomaly, correlate, custom` })
    }

    // Sync to Cognitive API
    await syncAnalysisToCognitive(type || 'threat', result.analysis || JSON.stringify(result), result)

    // Process alerts
    await processAlertQueue()

    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /report
app.post('/report', async (req, res) => {
  try {
    const { data: overrideData } = req.body
    const reportData = overrideData || lastLiveData

    if (!reportData) {
      return res.status(400).json({ error: 'No data available for report generation.' })
    }

    const result = await generateIntelReport(reportData)

    // Sync to Cognitive API
    await syncAnalysisToCognitive('intel_report', result.analysis || JSON.stringify(result), result)

    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /alerts
app.get('/alerts', (req, res) => {
  try {
    const severity = req.query.severity as string
    const limit = parseInt(req.query.limit as string) || 50

    let query = 'SELECT * FROM intel_alerts'
    const params: any[] = []
    if (severity) {
      query += ' WHERE severity = ?'
      params.push(severity)
    }
    query += ' ORDER BY created_at DESC LIMIT ?'
    params.push(limit)

    const alerts = db.prepare(query).all(...params) as any[]
    const total = severity
      ? (db.prepare('SELECT COUNT(*) as c FROM intel_alerts WHERE severity = ?').get(severity) as any)?.c
      : (db.prepare('SELECT COUNT(*) as c FROM intel_alerts').get() as any)?.c

    res.json({ alerts, total: total || 0 })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /entities
app.get('/entities', async (_req, res) => {
  try {
    // Proxy to Cognitive API
    const resp = await fetch(`${COGNITIVE_URL}/entities?limit=50`, {
      signal: AbortSignal.timeout(5000),
    })
    if (resp.ok) {
      const data = await resp.json()
      return res.json(data)
    }
  } catch { /* fallback */ }

  // Fallback: return entities from local intel events
  try {
    const entities = db.prepare(
      "SELECT event_type, source, COUNT(*) as mention_count, MAX(created_at) as last_seen FROM intel_events GROUP BY event_type ORDER BY mention_count DESC LIMIT 50"
    ).all() as any[]
    res.json({ entities, source: 'local_fallback' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /threat-level
app.get('/threat-level', (_req, res) => {
  try {
    const latest = db.prepare(
      "SELECT * FROM threat_assessments ORDER BY created_at DESC LIMIT 1"
    ).get() as any

    const history = db.prepare(
      "SELECT threat_level, category, confidence, created_at FROM threat_assessments ORDER BY created_at DESC LIMIT 10"
    ).all() as any[]

    res.json({
      current: latest ? {
        level: latest.threat_level,
        category: latest.category,
        description: latest.description,
        recommendations: jsonParse(latest.recommendations_json, []),
        confidence: latest.confidence,
        assessed_at: latest.created_at,
      } : null,
      history,
      shadowbroker_reported: lastLiveData?.threat_level || null,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /query — natural language query about current intelligence
app.post('/query', async (req, res) => {
  try {
    const { question } = req.body
    if (!question) return res.status(400).json({ error: 'question is required' })

    // Gather context from local DB and current data
    const recentEvents = db.prepare(
      "SELECT * FROM intel_events ORDER BY created_at DESC LIMIT 50"
    ).all() as any[]

    const latestThreat = db.prepare(
      "SELECT * FROM threat_assessments ORDER BY created_at DESC LIMIT 1"
    ).get() as any

    const recentAnalyses = db.prepare(
      "SELECT analysis_type, summary, created_at FROM ai_analyses ORDER BY created_at DESC LIMIT 5"
    ).all() as any[]

    const contextData = {
      shadowbroker_status: { reachable: shadowbrokerReachable, last_poll: lastPollTime },
      current_data_summary: lastLiveData ? Object.fromEntries(
        Object.entries(lastLiveData).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as any[]).length])
      ) : null,
      recent_events: recentEvents.map(e => ({ type: e.event_type, title: e.title, severity: e.severity, lat: e.lat, lng: e.lng })),
      current_threat: latestThreat ? { level: latestThreat.threat_level, category: latestThreat.category, confidence: latestThreat.confidence } : null,
      recent_analyses: recentAnalyses,
    }

    const aiResult = await analyzeWithAI(
      `Answer this question about current intelligence: "${question}"`,
      JSON.stringify(contextData),
    )

    stmtInsertAnalysis.run('query', aiResult.substring(0, 4000), JSON.stringify({ question }).substring(0, 500), 0.6, OPENROUTER_MODEL)

    res.json({ question, answer: aiResult, context_timestamp: new Date().toISOString() })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /stream — SSE endpoint for real-time intelligence events
app.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()

  sseClients.add(res)

  // Send initial state
  res.write(`event: connected\ndata: ${JSON.stringify({
    autopilot: autoPilotEnabled,
    shadowbroker_reachable: shadowbrokerReachable,
    last_poll: lastPollTime,
  })}\n\n`)

  req.on('close', () => { sseClients.delete(res) })
})

// ─── Auto-Pilot Control Endpoints ────────────────────────────────────────────

app.post('/autopilot/start', (_req, res) => {
  startAutoPilot()
  res.json({ status: 'active', message: 'Auto-pilot mode activated' })
})

app.post('/autopilot/stop', (_req, res) => {
  stopAutoPilot()
  res.json({ status: 'inactive', message: 'Auto-pilot mode deactivated' })
})

app.get('/autopilot/status', (_req, res) => {
  res.json({
    enabled: autoPilotEnabled,
    poll_interval_ms: POLL_INTERVAL_MS,
    threat_analysis_interval_ms: THREAT_ANALYSIS_INTERVAL_MS,
    anomaly_detection_interval_ms: ANOMALY_DETECT_INTERVAL_MS,
    uptime_seconds: Math.floor((Date.now() - bridgeStartTime) / 1000),
  })
})

// ─── Manual Data Ingestion Endpoints ─────────────────────────────────────────

app.post('/events', (req, res) => {
  try {
    const { event_type, source, severity, title, description, data: eventData, lat, lng } = req.body
    if (!event_type || !title) {
      return res.status(400).json({ error: 'event_type and title are required' })
    }

    const sig = eventSignature(event_type, title, eventData)
    if (eventDedupe.has(sig)) {
      return res.json({ status: 'duplicate', message: 'Event already processed' })
    }
    eventDedupe.set(sig, Date.now())

    const result = stmtInsertEvent.run(
      event_type,
      source || 'manual',
      severity || 'info',
      title,
      description || '',
      JSON.stringify(eventData || {}).substring(0, 4000),
      lat ?? null,
      lng ?? null,
    )

    broadcastSSE('event', { id: result.lastInsertRowid, event_type, title, severity })

    res.json({ id: result.lastInsertRowid, status: 'created' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/events', (req, res) => {
  try {
    const eventType = req.query.type as string
    const severity = req.query.severity as string
    const limit = parseInt(req.query.limit as string) || 50
    const offset = parseInt(req.query.offset as string) || 0

    let query = 'SELECT * FROM intel_events'
    const params: any[] = []
    const conditions: string[] = []

    if (eventType) { conditions.push('event_type = ?'); params.push(eventType) }
    if (severity) { conditions.push('severity = ?'); params.push(severity) }

    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ')
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const events = db.prepare(query).all(...params) as any[]
    const total = (db.prepare('SELECT COUNT(*) as c FROM intel_events').get() as any)?.c || 0

    res.json({ events: events.map(e => ({ ...e, data_json: jsonParse(e.data_json, {}) })), total })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/analyses', (req, res) => {
  try {
    const type = req.query.type as string
    const limit = parseInt(req.query.limit as string) || 50

    let query = 'SELECT * FROM ai_analyses'
    const params: any[] = []
    if (type) { query += ' WHERE analysis_type = ?'; params.push(type) }
    query += ' ORDER BY created_at DESC LIMIT ?'
    params.push(limit)

    const analyses = db.prepare(query).all(...params) as any[]
    res.json({ analyses: analyses.map(a => ({ ...a, details_json: jsonParse(a.details_json, {}) })) })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/threats', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20
    const threats = db.prepare(
      'SELECT * FROM threat_assessments ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as any[]
    res.json({ threats: threats.map(t => ({ ...t, recommendations_json: jsonParse(t.recommendations_json, []) })) })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Shadowbroker Proxy Endpoints ────────────────────────────────────────────

app.get('/sb/live-data', async (_req, res) => {
  const data = await fetchShadowbrokerLiveData()
  if (!data) return res.status(502).json({ error: 'Shadowbroker backend unreachable' })
  res.json(data)
})

app.get('/sb/health', async (_req, res) => {
  const health = await fetchShadowbrokerHealth()
  if (!health) return res.status(502).json({ error: 'Shadowbroker backend unreachable' })
  res.json(health)
})

app.get('/sb/summary', async (_req, res) => {
  const summary = await fetchShadowbrokerSummary()
  if (!summary) return res.status(502).json({ error: 'Shadowbroker backend unreachable' })
  res.json(summary)
})

// ─── Skills API ──────────────────────────────────────────────────────────────

// GET /skills — List all available skills
app.get('/skills', (_req, res) => {
  res.json({
    skills: skillRegistry.listSkills(),
    total: skillRegistry.listSkills().length,
  })
})

// POST /skills/:name/execute — Execute a skill
app.post('/skills/:name/execute', async (req, res) => {
  const { name } = req.params
  const params = req.body || {}
  const result = await skillRegistry.execute(name, params)
  res.json(result)
})

// GET /tools — List all reactive tools
app.get('/tools', (_req, res) => {
  res.json({
    tools: toolRegistry.listTools(),
    total: toolRegistry.listTools().length,
    redis_available: redisAvailable,
  })
})

// GET /streams — Redis Streams info
app.get('/streams', async (_req, res) => {
  if (!eventBus || !redisAvailable) {
    return res.json({ available: false, streams: {} })
  }
  const info = await eventBus.getAllStreamInfo()
  res.json({ available: true, streams: info })
})

// ─── Start Server ─────────────────────────────────────────────────────────────

async function main() {
  // Initialize Redis Event Bus
  await initEventBus()

  const server = app.listen(BRIDGE_PORT, '0.0.0.0', () => {
    console.log(`[sb-bridge] Shadowbroker AI Bridge v2 running on http://0.0.0.0:${BRIDGE_PORT}`)
    console.log(`[sb-bridge] Shadowbroker: ${SHADOWBROKER_URL}`)
    console.log(`[sb-bridge] Cognitive API: ${COGNITIVE_URL}`)
    console.log(`[sb-bridge] Hermes Bridge: ${HERMES_URL}`)
    console.log(`[sb-bridge] Bundle: ${BUNDLE_URL}`)
    console.log(`[sb-bridge] Redis Streams: ${redisAvailable ? 'ENABLED' : 'DISABLED'}`)
    console.log(`[sb-bridge] Skills: ${skillRegistry.listSkills().length} | Tools: ${toolRegistry.listTools().length}`)
  })
}

main().catch(err => {
  console.error(`[sb-bridge] Fatal error: ${err}`)
  process.exit(1)
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[sb-bridge] Shutting down...')
  stopAutoPilot()
  server.close()
  db.close()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('[sb-bridge] SIGTERM received, shutting down...')
  stopAutoPilot()
  server.close()
  db.close()
  process.exit(0)
})
