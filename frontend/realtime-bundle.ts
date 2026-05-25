/**
 * Whatomate Real-Time Bundle v2 — Event Sourcing con Redis Streams
 *
 * Monitoreo → Análisis → Decisión en tiempo real para WhatsApp
 *
 * Arquitectura v2:
 *   1. MONITOREO: Consume de Redis Stream whatomate:whatsapp_messages
 *   2. ANÁLISIS: Publica a whatomate:analyzed_messages con NLP
 *   3. DECISIÓN: Publica a whatomate:decisions cuando se detectan patrones críticos
 *   4. EVENT SOURCING: Todos los eventos persisten en Redis Streams (replay, audit)
 *
 * Cambios vs v1:
 *   - Redis Streams como event bus principal (reemplaza polling HTTP)
 *   - Event sourcing completo con consumer groups
 *   - Correlation IDs para rastrear flujo de eventos
 *   - Fallback a polling si Redis no está disponible
 *   - Skills/Tools integrados con Shadowbroker
 */

import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'
import path from 'path'
import os from 'os'
import http from 'http'
import { EventBus, Streams, ConsumerGroups, generateEventId, createCorrelationContext, checkRedisHealth } from './lib/redis-streams.js'

// ─── Config ──────────────────────────────────────────────────────────────────

const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:3001'
const COGNITIVE_URL = process.env.COGNITIVE_URL || 'http://localhost:8645'
const BUNDLE_PORT = parseInt(process.env.BUNDLE_PORT || '8650')
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '2000')
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''
const REDIS_ENABLED = process.env.REDIS_ENABLED !== 'false' // default: true

const app = express()
app.use(cors())
app.use(express.json())

// ─── Database (local bundle state) ──────────────────────────────────────────

const DB_PATH = path.join(os.homedir(), '.hermes', 'whatomate_bundle.db')
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS processed_messages (
    message_id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT,
    body TEXT NOT NULL,
    is_group INTEGER DEFAULT 0,
    timestamp INTEGER,
    processed_at TEXT DEFAULT (datetime('now')),
    sentiment_score REAL,
    sentiment_label TEXT,
    urgency REAL DEFAULT 0,
    entities_extracted INTEGER DEFAULT 0,
    decisions_generated INTEGER DEFAULT 0,
    correlation_id TEXT,
    stream_entry_id TEXT
  );

  CREATE TABLE IF NOT EXISTS bundle_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'whatsapp',
    severity TEXT DEFAULT 'info',
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    data TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    correlation_id TEXT
  );

  CREATE TABLE IF NOT EXISTS entity_mentions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_name TEXT NOT NULL,
    entity_type TEXT DEFAULT 'topic',
    message_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    context TEXT DEFAULT '',
    mentioned_at TEXT DEFAULT (datetime('now')),
    correlation_id TEXT
  );

  CREATE TABLE IF NOT EXISTS detected_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_name TEXT NOT NULL,
    pattern_type TEXT DEFAULT 'communication',
    description TEXT DEFAULT '',
    confidence REAL DEFAULT 0.5,
    occurrences INTEGER DEFAULT 1,
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    sample_data TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS auto_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    context TEXT DEFAULT '',
    trigger_pattern TEXT DEFAULT '',
    trigger_entity TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    confidence REAL DEFAULT 0.5,
    auto_executed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    correlation_id TEXT,
    stream_entry_id TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_pm_chat ON processed_messages(chat_id);
  CREATE INDEX IF NOT EXISTS idx_pm_timestamp ON processed_messages(timestamp);
  CREATE INDEX IF NOT EXISTS idx_be_type ON bundle_events(event_type);
  CREATE INDEX IF NOT EXISTS idx_be_severity ON bundle_events(severity);
  CREATE INDEX IF NOT EXISTS idx_em_entity ON entity_mentions(entity_name);
  CREATE INDEX IF NOT EXISTS idx_ad_status ON auto_decisions(status);
  CREATE INDEX IF NOT EXISTS idx_pm_correlation ON processed_messages(correlation_id);
`)

// ─── Prepared Statements ─────────────────────────────────────────────────────

const stmtInsertProcessed = db.prepare(`
  INSERT OR IGNORE INTO processed_messages 
    (message_id, chat_id, sender_id, sender_name, body, is_group, timestamp, 
     sentiment_score, sentiment_label, urgency, entities_extracted, decisions_generated, correlation_id, stream_entry_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const stmtInsertEvent = db.prepare(`
  INSERT INTO bundle_events (event_type, source, severity, title, description, data, correlation_id)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`)

const stmtInsertEntityMention = db.prepare(`
  INSERT INTO entity_mentions (entity_name, entity_type, message_id, chat_id, context, correlation_id)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`)

const stmtUpsertPattern = db.prepare(`
  INSERT INTO detected_patterns (pattern_name, pattern_type, description, confidence, occurrences, sample_data)
  VALUES (?, ?, ?, ?, 1, ?)
  ON CONFLICT DO NOTHING
`)

const stmtUpdatePattern = db.prepare(`
  UPDATE detected_patterns 
  SET occurrences = occurrences + 1, last_seen = datetime('now'), confidence = MIN(confidence + 0.02, 1.0)
  WHERE pattern_name = ?
`)

const stmtInsertDecision = db.prepare(`
  INSERT INTO auto_decisions (title, description, context, trigger_pattern, trigger_entity, status, priority, confidence, correlation_id, stream_entry_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

// ─── Redis Streams Event Bus ─────────────────────────────────────────────────

let eventBus: EventBus | null = null
let redisAvailable = false

async function initEventBus(): Promise<void> {
  if (!REDIS_ENABLED) {
    console.log('[bundle] Redis Streams disabled (REDIS_ENABLED=false)')
    return
  }

  try {
    eventBus = new EventBus(ConsumerGroups.BUNDLE_WORKERS, `bundle-${process.pid}`)
    await eventBus.connect()
    redisAvailable = true
    console.log('[bundle] Redis Streams Event Bus connected')

    // Start consuming WhatsApp messages from Redis Stream
    eventBus.on('whatsapp.message', async (event) => {
      // Process messages that come through the event bus
      const msg = {
        messageId: event.messageId,
        chatId: event.chatId,
        senderId: event.senderId,
        senderName: event.senderName,
        body: event.body,
        isGroup: event.isGroup,
        timestamp: event.timestamp,
      }
      processMessage(msg, event._meta?.entryId, event.correlationId)
    })

    // Also consume analyzed messages from other consumers (for cross-referencing)
    eventBus.on('shadowbroker.intel', async (event) => {
      // Store relevant intel events
      stmtInsertEvent.run(
        `sb_${event.eventType || 'intel'}`,
        'shadowbroker',
        event.severity || 'info',
        event.title || 'OSINT Event',
        event.description || '',
        JSON.stringify(event).substring(0, 1000),
        event.correlationId || null,
      )
    })

    // Start consuming in background
    eventBus.startConsuming(
      [Streams.WHATSAPP_MESSAGES, Streams.INTEL_EVENTS],
      { count: 10, block: 3000 },
    ).catch(err => {
      console.warn(`[bundle] Event bus consumer error: ${err.message}`)
    })
  } catch (err: any) {
    console.warn(`[bundle] Redis not available, falling back to HTTP polling: ${err.message}`)
    redisAvailable = false
    eventBus = null
  }
}

// ─── Text Analysis Engine (local, no LLM needed for v1) ─────────────────────

const POSITIVE_WORDS = new Set([
  'bien', 'bueno', 'excelente', 'genial', 'perfecto', 'gracias', 'feliz', 'contento',
  'éxito', 'logro', 'aprobar', 'avanzar', 'mejorar', 'completado', 'funciona',
  'good', 'great', 'excellent', 'perfect', 'thanks', 'happy', 'success', 'approved',
  'done', 'works', 'fixed', 'resolved', 'agreed', 'confirmed', 'approved', 'love',
])

const NEGATIVE_WORDS = new Set([
  'mal', 'error', 'problema', 'fallo', 'urgente', 'crítico', 'falla', 'no funciona',
  'retraso', 'cancelado', 'pendiente', 'bloqueado', 'perdido', 'pérdida', 'riesgo',
  'bad', 'error', 'problem', 'fail', 'urgent', 'critical', 'broken', 'delay',
  'cancelled', 'blocked', 'lost', 'risk', 'issue', 'bug', 'crash', 'down',
  'emergency', 'alert', 'warning', 'danger', 'stuck', 'impossible',
])

const URGENCY_WORDS = new Set([
  'urgente', 'ahora', 'inmediatamente', 'crítico', 'emergencia', 'ya', 'asap',
  'urgent', 'now', 'immediately', 'critical', 'emergency', 'asap', 'today',
  'deadline', 'hoy', 'mañana', 'antes de', 'no later',
])

const ENTITY_PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/g,
  url: /https?:\/\/[^\s<>]+/g,
  money: /[\$€£]\s?\d[\d,.]*|\d[\d,.]*\s?[\$€£]/g,
  date: /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/gi,
  time: /\b\d{1,2}:\d{2}(?:\s?[ap]m)?\b/gi,
}

const DECISION_TRIGGERS = [
  {
    pattern: 'urgency_spike',
    name: 'Pico de Urgencia Detectado',
    check: (stats: any) => stats.recentUrgencyCount >= 3,
    description: 'Se detectaron múltiples mensajes urgentes en un período corto',
    priority: 'high',
  },
  {
    pattern: 'negative_sentiment_trend',
    name: 'Tendencia Negativa de Sentimiento',
    check: (stats: any) => stats.recentNegativeCount >= 5 && stats.recentNegativeRatio > 0.6,
    description: 'El sentimiento de los mensajes recientes es predominantemente negativo',
    priority: 'high',
  },
  {
    pattern: 'recurring_topic',
    name: 'Tema Recurrente Detectado',
    check: (stats: any) => stats.topEntityMentions >= 5,
    description: 'Un tema específico se menciona frecuentemente — requiere atención',
    priority: 'medium',
  },
  {
    pattern: 'action_item_detected',
    name: 'Item de Acción Detectado',
    check: (stats: any) => stats.hasActionItems,
    description: 'Se detectaron items de acción que requieren seguimiento',
    priority: 'medium',
  },
  {
    pattern: 'decision_required',
    name: 'Decisión Requerida',
    check: (stats: any) => stats.hasDecisionKeywords,
    description: 'Se detectó lenguaje que indica una decisión pendiente',
    priority: 'high',
  },
]

// ─── Analysis Functions ──────────────────────────────────────────────────────

interface AnalysisResult {
  sentimentScore: number
  sentimentLabel: 'positive' | 'negative' | 'neutral'
  urgency: number
  entities: { name: string; type: string; context: string }[]
  hasActionItems: boolean
  hasDecisionKeywords: boolean
  keywords: string[]
}

function analyzeText(text: string): AnalysisResult {
  const lower = text.toLowerCase()
  const words = lower.split(/\s+/)

  let positiveCount = 0
  let negativeCount = 0
  for (const word of words) {
    const clean = word.replace(/[^\wáéíóúñü]/gi, '')
    if (POSITIVE_WORDS.has(clean)) positiveCount++
    if (NEGATIVE_WORDS.has(clean)) negativeCount++
  }

  let sentimentScore = 0
  if (positiveCount + negativeCount > 0) {
    sentimentScore = (positiveCount - negativeCount) / (positiveCount + negativeCount)
  }
  const sentimentLabel: AnalysisResult['sentimentLabel'] = 
    sentimentScore > 0.2 ? 'positive' : sentimentScore < -0.2 ? 'negative' : 'neutral'

  let urgencyCount = 0
  for (const word of words) {
    const clean = word.replace(/[^\wáéíóúñü]/gi, '')
    if (URGENCY_WORDS.has(clean)) urgencyCount++
  }
  const urgency = Math.min(urgencyCount / 3, 1)

  const entities: AnalysisResult['entities'] = []
  for (const [type, pattern] of Object.entries(ENTITY_PATTERNS)) {
    const matches = text.match(pattern)
    if (matches) {
      for (const match of matches) {
        entities.push({ name: match, type, context: text.substring(0, 100) })
      }
    }
  }

  const namedEntities = text.match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+)+\b/g)
  if (namedEntities) {
    for (const ne of namedEntities) {
      if (!entities.some(e => e.name === ne)) {
        entities.push({ name: ne, type: 'person_or_org', context: text.substring(0, 100) })
      }
    }
  }

  const stopWords = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'en', 'con', 'por', 'para', 'que', 'se', 'es', 'al', 'lo', 'su', 'le', 'ya', 'no', 'si', 'mi', 'tu', 'yo', 'me', 'te', 'nos', 'les', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'because', 'if', 'when', 'where', 'how', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'it', 'its', 'he', 'she', 'they', 'them', 'their', 'we', 'our', 'you', 'your', 'i', 'my', 'me'])
  const topicWords = words
    .map(w => w.replace(/[^\wáéíóúñü]/gi, '').toLowerCase())
    .filter(w => w.length > 3 && !stopWords.has(w))
  const topicCounts: Record<string, number> = {}
  for (const w of topicWords) {
    topicCounts[w] = (topicCounts[w] || 0) + 1
  }
  const keywords = Object.entries(topicCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([word]) => word)

  const actionPatterns = /(?:necesitamos|tenemos que|hay que|debemos|hay que|to do|need to|must|should|have to|please|por favor|action item|seguimiento|follow.?up)/i
  const hasActionItems = actionPatterns.test(text)

  const decisionPatterns = /(?:decidir|decisión|decido|elegir|opción|alternativa|decide|decision|choose|option|alternative|approve|reject|aprobar|rechazar|votar|vote)/i
  const hasDecisionKeywords = decisionPatterns.test(text)

  for (const kw of keywords.slice(0, 3)) {
    if (!entities.some(e => e.name.toLowerCase() === kw)) {
      entities.push({ name: kw, type: 'topic', context: text.substring(0, 100) })
    }
  }

  return { sentimentScore, sentimentLabel, urgency, entities, hasActionItems, hasDecisionKeywords, keywords }
}

// ─── Cognitive API Integration ───────────────────────────────────────────────

async function storeInCognitiveAPI(message: any, analysis: AnalysisResult, correlationId?: string) {
  try {
    await fetch(`${COGNITIVE_URL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jid: message.chatId,
        sender: message.senderName || message.senderId,
        content: message.body,
        chat_type: message.isGroup ? 'group' : 'individual',
        direction: 'inbound',
        metadata: {
          sentiment_score: analysis.sentimentScore,
          sentiment_label: analysis.sentimentLabel,
          urgency: analysis.urgency,
          keywords: analysis.keywords,
          has_action_items: analysis.hasActionItems,
          has_decision_keywords: analysis.hasDecisionKeywords,
          correlation_id: correlationId,
        },
      }),
    })

    for (const entity of analysis.entities) {
      try {
        await fetch(`${COGNITIVE_URL}/entities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: entity.name,
            type: entity.type,
            attributes: { context: entity.context, source: 'whatsapp_auto', correlation_id: correlationId },
          }),
        })
      } catch {}
    }

    if (analysis.hasActionItems || analysis.hasDecisionKeywords) {
      try {
        await fetch(`${COGNITIVE_URL}/decisions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: analysis.hasDecisionKeywords 
              ? `Decisión pendiente: ${message.body.substring(0, 60)}...`
              : `Acción requerida: ${message.body.substring(0, 60)}...`,
            description: message.body,
            context: `De: ${message.senderName || message.senderId} | Chat: ${message.chatId}`,
            decision_maker: message.senderName || message.senderId,
            status: 'pending',
            confidence: 0.5 + analysis.urgency * 0.3,
          }),
        })
      } catch {}
    }
  } catch (err: any) {
    console.error(`[bundle] Cognitive API error: ${err.message}`)
  }
}

// ─── Message Processing Pipeline ─────────────────────────────────────────────

interface ProcessedMessage {
  messageId: string
  chatId: string
  senderId: string
  senderName: string
  body: string
  isGroup: boolean
  timestamp: number
  analysis?: AnalysisResult
}

const recentMessages: ProcessedMessage[] = []
const MAX_RECENT = 100
let totalProcessed = 0
let totalEntitiesExtracted = 0
let totalDecisionsGenerated = 0
let totalEventsPublished = 0
let bundleStartTime = Date.now()
let isMonitoring = false
let pollTimer: ReturnType<typeof setInterval> | null = null

// SSE clients
const sseClients = new Set<http.ServerResponse>()

function broadcastSSE(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of sseClients) {
    try {
      res.write(payload)
    } catch {}
  }
}

function processMessage(msg: any, streamEntryId?: string, parentCorrelationId?: string): ProcessedMessage | null {
  const messageId = msg.messageId || msg.key?.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const chatId = msg.chatId || msg.key?.remoteJid || ''
  const senderId = msg.senderId || msg.key?.participant || chatId
  const senderName = msg.senderName || msg.pushName || senderId.replace(/@.*/, '')
  const body = msg.body || msg.message?.conversation || ''
  const isGroup = msg.isGroup || chatId.endsWith('@g.us')
  const timestamp = msg.timestamp || Math.floor(Date.now() / 1000)

  if (!body || body.trim().length === 0) return null
  if (body.startsWith('[') && body.endsWith(']') && body.includes('received')) return null

  const existing = db.prepare('SELECT message_id FROM processed_messages WHERE message_id = ?').get(messageId)
  if (existing) return null

  // Create correlation context
  const correlationCtx = createCorrelationContext()
  const correlationId = parentCorrelationId || correlationCtx.correlationId

  // Analyze text
  const analysis = analyzeText(body)

  // Store in local DB
  stmtInsertProcessed.run(
    messageId, chatId, senderId, senderName, body, isGroup ? 1 : 0, timestamp,
    analysis.sentimentScore, analysis.sentimentLabel, analysis.urgency,
    analysis.entities.length, analysis.hasActionItems || analysis.hasDecisionKeywords ? 1 : 0,
    correlationId, streamEntryId || null,
  )

  // Store entities
  for (const entity of analysis.entities) {
    stmtInsertEntityMention.run(entity.name, entity.type, messageId, chatId, entity.context, correlationId)
    totalEntitiesExtracted++
  }

  // Store patterns
  if (analysis.sentimentLabel === 'negative' && analysis.urgency > 0.3) {
    const existingPattern = db.prepare('SELECT id FROM detected_patterns WHERE pattern_name = ?').get('urgent_negative_message')
    if (existingPattern) {
      stmtUpdatePattern.run('urgent_negative_message')
    } else {
      stmtUpsertPattern.run('urgent_negative_message', 'sentiment', 'Mensajes urgentes con sentimiento negativo', 0.6, JSON.stringify([body.substring(0, 50)]))
    }
  }

  if (analysis.hasActionItems) {
    const existingPattern = db.prepare('SELECT id FROM detected_patterns WHERE pattern_name = ?').get('action_item_requests')
    if (existingPattern) {
      stmtUpdatePattern.run('action_item_requests')
    } else {
      stmtUpsertPattern.run('action_item_requests', 'behavioral', 'Mensajes que contienen items de acción', 0.7, JSON.stringify([body.substring(0, 50)]))
    }
  }

  if (analysis.hasDecisionKeywords) {
    const existingPattern = db.prepare('SELECT id FROM detected_patterns WHERE pattern_name = ?').get('decision_requests')
    if (existingPattern) {
      stmtUpdatePattern.run('decision_requests')
    } else {
      stmtUpsertPattern.run('decision_requests', 'behavioral', 'Mensajes que requieren toma de decisión', 0.75, JSON.stringify([body.substring(0, 50)]))
    }
  }

  // ─── Publish to Redis Streams ─────────────────────────────────────────────

  // Publish analyzed message event
  if (eventBus && redisAvailable) {
    eventBus.publish(Streams.ANALYZED_MESSAGES, {
      id: generateEventId(),
      type: 'whatsapp.analyzed',
      source: 'realtime-bundle',
      timestamp: Date.now(),
      correlationId,
      messageId, chatId, senderId, senderName, body, isGroup,
      sentimentScore: analysis.sentimentScore,
      sentimentLabel: analysis.sentimentLabel,
      urgency: analysis.urgency,
      entities: analysis.entities,
      keywords: analysis.keywords,
      hasActionItems: analysis.hasActionItems,
      hasDecisionKeywords: analysis.hasDecisionKeywords,
    }).then(entryId => {
      totalEventsPublished++
    }).catch(err => {
      console.error(`[bundle] Failed to publish analyzed message: ${err.message}`)
    })
  }

  // Check decision triggers
  const recentSlice = recentMessages.slice(-20)
  const stats = {
    recentUrgencyCount: recentSlice.filter(m => (m.analysis?.urgency || 0) > 0.5).length,
    recentNegativeCount: recentSlice.filter(m => m.analysis?.sentimentLabel === 'negative').length,
    recentNegativeRatio: recentSlice.length > 0 
      ? recentSlice.filter(m => m.analysis?.sentimentLabel === 'negative').length / recentSlice.length 
      : 0,
    topEntityMentions: analysis.entities.length,
    hasActionItems: analysis.hasActionItems,
    hasDecisionKeywords: analysis.hasDecisionKeywords,
  }

  for (const trigger of DECISION_TRIGGERS) {
    if (trigger.check(stats)) {
      const recentDuplicate = db.prepare(
        "SELECT id FROM auto_decisions WHERE trigger_pattern = ? AND created_at > datetime('now', '-5 minutes')"
      ).get(trigger.pattern)
      
      if (!recentDuplicate) {
        const topEntity = analysis.entities[0]?.name || ''
        const decisionCorrelationId = correlationCtx.child(generateEventId()).correlationId

        stmtInsertDecision.run(
          trigger.name,
          trigger.description,
          `Detectado en mensaje de ${senderName}: "${body.substring(0, 100)}"`,
          trigger.pattern,
          topEntity,
          'pending',
          trigger.priority,
          0.5 + analysis.urgency * 0.3,
          decisionCorrelationId,
          null,
        )
        totalDecisionsGenerated++

        stmtInsertEvent.run('decision', 'whatsapp', trigger.priority, trigger.name, trigger.description, JSON.stringify({ messageId, chatId, senderId }), correlationId)

        broadcastSSE('decision', {
          trigger: trigger.pattern,
          title: trigger.name,
          description: trigger.description,
          priority: trigger.priority,
          message: body.substring(0, 100),
          sender: senderName,
          timestamp: Date.now(),
          correlationId: decisionCorrelationId,
        })

        // Publish decision event to Redis Stream
        if (eventBus && redisAvailable) {
          eventBus.publish(Streams.DECISIONS, {
            id: generateEventId(),
            type: 'bundle.decision',
            source: 'realtime-bundle',
            timestamp: Date.now(),
            correlationId: decisionCorrelationId,
            causationId: correlationId,
            title: trigger.name,
            description: trigger.description,
            context: `Detectado en mensaje de ${senderName}: "${body.substring(0, 100)}"`,
            triggerPattern: trigger.pattern,
            triggerEntity: topEntity,
            priority: trigger.priority,
            confidence: 0.5 + analysis.urgency * 0.3,
          }).then(() => {
            totalEventsPublished++
          }).catch(err => {
            console.error(`[bundle] Failed to publish decision: ${err.message}`)
          })
        }
      }
    }
  }

  // Store in Cognitive API (async, non-blocking)
  storeInCognitiveAPI({ chatId, senderId, senderName, body, isGroup }, analysis, correlationId)

  // Log event
  stmtInsertEvent.run(
    'message_processed', 'whatsapp',
    analysis.urgency > 0.5 ? 'warning' : 'info',
    `Mensaje procesado: ${senderName}`,
    body.substring(0, 100),
    JSON.stringify({ sentiment: analysis.sentimentLabel, urgency: analysis.urgency, entities: analysis.entities.length }),
    correlationId,
  )

  totalProcessed++

  const processed: ProcessedMessage = {
    messageId, chatId, senderId, senderName, body, isGroup, timestamp, analysis,
  }

  recentMessages.push(processed)
  if (recentMessages.length > MAX_RECENT) recentMessages.shift()

  // Broadcast new message via SSE
  broadcastSSE('message', {
    messageId, chatId, senderName, body: body.substring(0, 200),
    isGroup, sentiment: analysis.sentimentLabel, urgency: analysis.urgency,
    entities: analysis.entities.map(e => e.name),
    hasActionItems: analysis.hasActionItems,
    hasDecisionKeywords: analysis.hasDecisionKeywords,
    timestamp,
    correlationId,
  })

  return processed
}

// ─── WhatsApp Bridge Polling (fallback when Redis not available) ──────────────

async function pollBridgeMessages() {
  try {
    const response = await fetch(`${BRIDGE_URL}/messages`)
    if (!response.ok) return

    const messages = await response.json() as any[]
    if (!Array.isArray(messages) || messages.length === 0) return

    console.log(`[bundle] Polled ${messages.length} messages from bridge`)

    for (const msg of messages) {
      if (msg.hasMedia) continue

      // If Redis is available, publish to stream first (then consumer will process)
      if (eventBus && redisAvailable) {
        const correlationCtx = createCorrelationContext()
        eventBus.publish(Streams.WHATSAPP_MESSAGES, {
          id: generateEventId(),
          type: 'whatsapp.message',
          source: 'whatsapp-bridge',
          timestamp: Date.now(),
          correlationId: correlationCtx.correlationId,
          messageId: msg.messageId || msg.key?.id,
          chatId: msg.chatId || msg.key?.remoteJid,
          senderId: msg.senderId || msg.key?.participant,
          senderName: msg.senderName || msg.pushName,
          body: msg.body || msg.message?.conversation,
          isGroup: msg.isGroup || (msg.chatId || msg.key?.remoteJid || '').endsWith('@g.us'),
          hasMedia: msg.hasMedia || false,
        }).catch(err => {
          console.error(`[bundle] Failed to publish to stream: ${err.message}`)
        })
      } else {
        // Fallback: process directly
        processMessage(msg)
      }
    }
  } catch (err: any) {
    if (!err.message?.includes('ECONNREFUSED')) {
      console.error(`[bundle] Poll error: ${err.message}`)
    }
  }
}

function startMonitoring() {
  if (isMonitoring) return
  isMonitoring = true
  bundleStartTime = Date.now()

  stmtInsertEvent.run('monitoring_started', 'system', 'info', 'Monitoreo Iniciado', 'El bundle de monitoreo en tiempo real ha iniciado', '{}', null)

  // Always poll the bridge for raw messages (pushes them to Redis Stream or processes directly)
  pollTimer = setInterval(pollBridgeMessages, POLL_INTERVAL_MS)
  console.log(`[bundle] Monitoring started — polling every ${POLL_INTERVAL_MS}ms (Redis: ${redisAvailable ? 'enabled' : 'disabled'})`)
}

function stopMonitoring() {
  if (!isMonitoring) return
  isMonitoring = false

  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }

  stmtInsertEvent.run('monitoring_stopped', 'system', 'info', 'Monitoreo Detenido', 'El bundle de monitoreo ha sido detenido', '{}', null)
  console.log('[bundle] Monitoring stopped')
}

// ─── REST API ────────────────────────────────────────────────────────────────

app.get('/health', async (req, res) => {
  let redisHealth: any = null
  if (redisAvailable) {
    redisHealth = await checkRedisHealth()
  }

  res.json({
    status: 'ok',
    service: 'whatomate-realtime-bundle',
    version: '2.0.0-event-sourcing',
    monitoring: isMonitoring,
    uptime: Math.floor((Date.now() - bundleStartTime) / 1000),
    stats: {
      totalProcessed,
      totalEntitiesExtracted,
      totalDecisionsGenerated,
      totalEventsPublished,
      recentMessages: recentMessages.length,
    },
    bridge: BRIDGE_URL,
    cognitive: COGNITIVE_URL,
    redis: {
      available: redisAvailable,
      enabled: REDIS_ENABLED,
      health: redisHealth,
    },
  })
})

// Redis Streams info
app.get('/streams', async (req, res) => {
  if (!eventBus || !redisAvailable) {
    return res.json({ available: false, streams: {} })
  }

  const info = await eventBus.getAllStreamInfo()
  res.json({ available: true, streams: info })
})

// Event replay
app.post('/replay', async (req, res) => {
  if (!eventBus || !redisAvailable) {
    return res.status(503).json({ error: 'Redis Streams not available' })
  }

  const { stream, from, to, count } = req.body
  const streamName = stream as keyof typeof Streams

  if (!Streams[streamName]) {
    return res.status(400).json({ error: 'Invalid stream name', available: Object.keys(Streams) })
  }

  let replayed = 0
  const replayedEvents: any[] = []

  const processed = await eventBus.replay(Streams[streamName], {
    from: from || '-',
    to: to || '+',
    count: count || 100,
    handler: async (event) => {
      replayedEvents.push(event)
      replayed++
    },
  })

  res.json({ stream: Streams[streamName], replayed, events: replayedEvents.slice(0, 50) })
})

app.post('/monitoring/start', (req, res) => {
  startMonitoring()
  res.json({ status: 'monitoring', message: 'Monitoreo en tiempo real iniciado', redis: redisAvailable })
})

app.post('/monitoring/stop', (req, res) => {
  stopMonitoring()
  res.json({ status: 'stopped', message: 'Monitoreo detenido' })
})

app.get('/dashboard', (req, res) => {
  const recentCount5min = (db.prepare(
    "SELECT COUNT(*) as c FROM processed_messages WHERE processed_at > datetime('now', '-5 minutes')"
  ).get() as any)?.c || 0

  const sentimentDistribution = db.prepare(
    "SELECT sentiment_label, COUNT(*) as count FROM processed_messages GROUP BY sentiment_label"
  ).all() as any[]

  const topEntities = db.prepare(
    "SELECT entity_name, entity_type, COUNT(*) as mentions FROM entity_mentions GROUP BY entity_name ORDER BY mentions DESC LIMIT 10"
  ).all() as any[]

  const recentEvents = db.prepare(
    "SELECT * FROM bundle_events ORDER BY created_at DESC LIMIT 20"
  ).all() as any[]

  const pendingDecisions = db.prepare(
    "SELECT * FROM auto_decisions WHERE status = 'pending' ORDER BY created_at DESC LIMIT 10"
  ).all() as any[]

  const activePatterns = db.prepare(
    "SELECT * FROM detected_patterns ORDER BY confidence DESC LIMIT 10"
  ).all() as any[]

  const urgencyTrend = db.prepare(
    "SELECT strftime('%Y-%m-%d %H:%M', processed_at) as minute, AVG(urgency) as avg_urgency FROM processed_messages WHERE processed_at > datetime('now', '-1 hour') GROUP BY minute ORDER BY minute"
  ).all() as any[]

  res.json({
    isMonitoring,
    uptime: Math.floor((Date.now() - bundleStartTime) / 1000),
    stats: {
      totalProcessed,
      totalEntitiesExtracted,
      totalDecisionsGenerated,
      totalEventsPublished,
      recentMessages: recentMessages.length,
      messagesLast5Min: recentCount5min,
    },
    sentimentDistribution: Object.fromEntries(sentimentDistribution.map(r => [r.sentiment_label, r.count])),
    topEntities,
    recentEvents,
    pendingDecisions,
    activePatterns,
    urgencyTrend,
    redisAvailable,
    lastMessages: recentMessages.slice(-10).map(m => ({
      messageId: m.messageId,
      sender: m.senderName,
      body: m.body.substring(0, 150),
      sentiment: m.analysis?.sentimentLabel,
      urgency: m.analysis?.urgency,
      entities: m.analysis?.entities.map(e => e.name) || [],
      timestamp: m.timestamp,
    })),
  })
})

app.get('/messages', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50
  const offset = parseInt(req.query.offset as string) || 0
  const messages = db.prepare(
    'SELECT * FROM processed_messages ORDER BY timestamp DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as any[]
  const total = (db.prepare('SELECT COUNT(*) as c FROM processed_messages').get() as any)?.c || 0
  res.json({ messages, total })
})

app.get('/events', (req, res) => {
  const severity = req.query.severity as string
  const limit = parseInt(req.query.limit as string) || 50
  let query = 'SELECT * FROM bundle_events'
  const params: any[] = []
  if (severity) {
    query += ' WHERE severity = ?'
    params.push(severity)
  }
  query += ' ORDER BY created_at DESC LIMIT ?'
  params.push(limit)
  const events = db.prepare(query).all(...params) as any[]
  res.json({ events })
})

// POST /events — accept events from external sources (e.g., Shadowbroker bridge)
app.post('/events', (req, res) => {
  const { event_type, source, severity, title, description, data } = req.body
  const correlationId = req.body.correlation_id || generateEventId()

  stmtInsertEvent.run(
    event_type || 'external',
    source || 'external',
    severity || 'info',
    title || 'External event',
    description || '',
    typeof data === 'string' ? data : JSON.stringify(data || {}),
    correlationId,
  )

  // If Redis is available, also publish to the appropriate stream
  if (eventBus && redisAvailable) {
    const targetStream = severity === 'critical' || severity === 'high' ? Streams.ALERTS : Streams.INTEL_EVENTS
    eventBus.publish(targetStream, {
      id: generateEventId(),
      type: event_type || 'external.event',
      source: source || 'external',
      timestamp: Date.now(),
      correlationId,
      severity: severity || 'info',
      title: title || 'External event',
      message: description || '',
    }).catch(() => {})
  }

  broadcastSSE('external_event', { event_type, source, severity, title, correlationId })

  res.json({ success: true, correlation_id: correlationId })
})

app.get('/decisions', (req, res) => {
  const status = req.query.status as string
  let query = 'SELECT * FROM auto_decisions'
  const params: any[] = []
  if (status) {
    query += ' WHERE status = ?'
    params.push(status)
  }
  query += ' ORDER BY created_at DESC LIMIT 50'
  const decisions = db.prepare(query).all(...params) as any[]
  res.json({ decisions })
})

app.put('/decisions/:id', (req, res) => {
  const { status, priority } = req.body
  db.prepare(
    "UPDATE auto_decisions SET status = ?, priority = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(status || 'pending', priority || 'medium', req.params.id)

  // Publish decision update to Redis
  if (eventBus && redisAvailable) {
    eventBus.publish(Streams.DECISIONS, {
      id: generateEventId(),
      type: 'bundle.decision_updated',
      source: 'realtime-bundle',
      timestamp: Date.now(),
      decisionId: req.params.id,
      newStatus: status,
      newPriority: priority,
    }).catch(() => {})
  }

  res.json({ success: true })
})

app.get('/patterns', (req, res) => {
  const patterns = db.prepare(
    'SELECT * FROM detected_patterns ORDER BY confidence DESC LIMIT 50'
  ).all() as any[]
  res.json({ patterns })
})

app.get('/entities', (req, res) => {
  const type = req.query.type as string
  let query = 'SELECT entity_name, entity_type, COUNT(*) as mentions, MAX(mentioned_at) as last_mentioned FROM entity_mentions'
  const params: any[] = []
  if (type) {
    query += ' WHERE entity_type = ?'
    params.push(type)
  }
  query += ' GROUP BY entity_name ORDER BY mentions DESC LIMIT 50'
  const entities = db.prepare(query).all(...params) as any[]
  res.json({ entities })
})

app.post('/analyze', (req, res) => {
  const { text } = req.body
  if (!text) return res.status(400).json({ error: 'text is required' })
  const result = analyzeText(text)
  res.json(result)
})

app.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()

  sseClients.add(res)
  res.write(`event: connected\ndata: ${JSON.stringify({ isMonitoring, totalProcessed, redisAvailable })}\n\n`)

  req.on('close', () => {
    sseClients.delete(res)
  })
})

// ─── Start Server ────────────────────────────────────────────────────────────

async function main() {
  // Initialize Redis Event Bus
  await initEventBus()

  app.listen(BUNDLE_PORT, '0.0.0.0', () => {
    console.log(`[bundle] Whatomate Real-Time Bundle v2 running on http://0.0.0.0:${BUNDLE_PORT}`)
    console.log(`[bundle] Bridge: ${BRIDGE_URL} | Cognitive: ${COGNITIVE_URL}`)
    console.log(`[bundle] Redis Streams: ${redisAvailable ? 'ENABLED' : 'DISABLED (fallback to polling)'}`)
    console.log(`[bundle] Poll interval: ${POLL_INTERVAL_MS}ms`)
    console.log(`[bundle] Use POST /monitoring/start to begin monitoring`)

    startMonitoring()
  })
}

main().catch(err => {
  console.error(`[bundle] Fatal error: ${err}`)
  process.exit(1)
})
