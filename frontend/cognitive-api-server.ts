/**
 * Cognitive Capital API Server
 * 
 * Lightweight Express server that exposes the Whatomate Knowledge Base
 * (SQLite + FTS5 at ~/.hermes/whatomate_knowledge.db) as REST API
 * for the Vue.js frontend.
 * 
 * Port: 8645 (proxied via Vite /cognitive-api)
 */

import Database from 'better-sqlite3'
import express from 'express'
import cors from 'cors'
import path from 'path'
import os from 'os'

const app = express()
app.use(cors())
app.use(express.json())

// ─── Database Setup ──────────────────────────────────────────────────────────

const DB_PATH = path.join(os.homedir(), '.hermes', 'whatomate_knowledge.db')
let db: Database.Database

try {
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  console.log(`[cognitive-api] Connected to knowledge base: ${DB_PATH}`)
} catch (err) {
  console.error(`[cognitive-api] Failed to open database: ${err}`)
  // Create database if it doesn't exist
  try {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    initializeDatabase()
    console.log(`[cognitive-api] Created new knowledge base: ${DB_PATH}`)
  } catch (err2) {
    console.error(`[cognitive-api] Failed to create database: ${err2}`)
    process.exit(1)
  }
}

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jid TEXT NOT NULL,
      sender TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      chat_type TEXT DEFAULT 'individual',
      direction TEXT DEFAULT 'inbound',
      metadata TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'topic',
      attributes TEXT DEFAULT '{}',
      first_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      mention_count INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      context TEXT DEFAULT '',
      decision_maker TEXT DEFAULT '',
      outcome TEXT,
      status TEXT DEFAULT 'pending',
      confidence REAL DEFAULT 0.5,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pattern_type TEXT NOT NULL DEFAULT 'topic',
      description TEXT DEFAULT '',
      frequency INTEGER DEFAULT 1,
      confidence REAL DEFAULT 0.5,
      first_observed TEXT NOT NULL DEFAULT (datetime('now')),
      last_observed TEXT NOT NULL DEFAULT (datetime('now')),
      data TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS cognitive_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period TEXT NOT NULL DEFAULT 'daily',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      summary TEXT NOT NULL,
      key_topics TEXT DEFAULT '[]',
      key_entities TEXT DEFAULT '[]',
      action_items TEXT DEFAULT '[]',
      sentiment_score REAL DEFAULT 0.5,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- FTS5 virtual tables for full-text search
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, content=messages, content_rowid=id);
    CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(name, content=entities, content_rowid=id);
    CREATE VIRTUAL TABLE IF NOT EXISTS decisions_fts USING fts5(title, description, content=decisions, content_rowid=id);
    CREATE VIRTUAL TABLE IF NOT EXISTS patterns_fts USING fts5(name, description, content=patterns, content_rowid=id);
    CREATE VIRTUAL TABLE IF NOT EXISTS summaries_fts USING fts5(summary, content=cognitive_summaries, content_rowid=id);
  `)
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function jsonParse(str: string | null | undefined, fallback: any = {}) {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

app.get('/dashboard', (req, res) => {
  try {
    const stats = {
      messages: {
        total: (db.prepare('SELECT COUNT(*) as c FROM messages').get() as any)?.c || 0,
        today: (db.prepare("SELECT COUNT(*) as c FROM messages WHERE date(timestamp) = date('now')").get() as any)?.c || 0,
        this_week: (db.prepare("SELECT COUNT(*) as c FROM messages WHERE timestamp >= datetime('now', '-7 days')").get() as any)?.c || 0,
      },
      entities: {
        total: (db.prepare('SELECT COUNT(*) as c FROM entities').get() as any)?.c || 0,
        by_type: {},
      },
      decisions: {
        total: (db.prepare('SELECT COUNT(*) as c FROM decisions').get() as any)?.c || 0,
        pending: (db.prepare("SELECT COUNT(*) as c FROM decisions WHERE status = 'pending'").get() as any)?.c || 0,
        made: (db.prepare("SELECT COUNT(*) as c FROM decisions WHERE status = 'made'").get() as any)?.c || 0,
      },
      patterns: {
        total: (db.prepare('SELECT COUNT(*) as c FROM patterns').get() as any)?.c || 0,
        by_type: {},
      },
      summaries: {
        total: (db.prepare('SELECT COUNT(*) as c FROM cognitive_summaries').get() as any)?.c || 0,
        latest: null as string | null,
      },
      last_updated: new Date().toISOString(),
    }

    // Entity type distribution
    const entityTypes = db.prepare('SELECT type, COUNT(*) as count FROM entities GROUP BY type').all() as any[]
    entityTypes.forEach((r) => { stats.entities.by_type[r.type] = r.count })

    // Pattern type distribution
    const patternTypes = db.prepare('SELECT pattern_type, COUNT(*) as count FROM patterns GROUP BY pattern_type').all() as any[]
    patternTypes.forEach((r) => { stats.patterns.by_type[r.pattern_type] = r.count })

    // Latest summary date
    const latestSummary = db.prepare('SELECT created_at FROM cognitive_summaries ORDER BY created_at DESC LIMIT 1').get() as any
    stats.summaries.latest = latestSummary?.created_at || null

    // Top entities
    const topEntities = db.prepare('SELECT * FROM entities ORDER BY mention_count DESC LIMIT 8').all() as any[]

    // Recent decisions
    const recentDecisions = db.prepare('SELECT * FROM decisions ORDER BY created_at DESC LIMIT 5').all() as any[]

    // Active patterns
    const activePatterns = db.prepare('SELECT * FROM patterns ORDER BY confidence DESC LIMIT 5').all() as any[]

    // Latest summary
    const latestSummaryFull = db.prepare('SELECT * FROM cognitive_summaries ORDER BY created_at DESC LIMIT 1').get() as any

    // Sentiment trend (placeholder)
    const sentimentTrend: any[] = []

    // Topic distribution (from entities of type 'topic')
    const topicDistribution = db.prepare(
      "SELECT name as topic, mention_count as count FROM entities WHERE type = 'topic' ORDER BY mention_count DESC LIMIT 10"
    ).all() as any[]

    res.json({
      stats,
      top_entities: topEntities,
      recent_decisions: recentDecisions,
      active_patterns: activePatterns,
      latest_summary: latestSummaryFull ? {
        ...latestSummaryFull,
        key_topics: jsonParse(latestSummaryFull.key_topics, []),
        key_entities: jsonParse(latestSummaryFull.key_entities, []),
        action_items: jsonParse(latestSummaryFull.action_items, []),
      } : null,
      sentiment_trend: sentimentTrend,
      topic_distribution: topicDistribution,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/stats', (req, res) => {
  try {
    const stats = {
      messages: {
        total: (db.prepare('SELECT COUNT(*) as c FROM messages').get() as any)?.c || 0,
        today: (db.prepare("SELECT COUNT(*) as c FROM messages WHERE date(timestamp) = date('now')").get() as any)?.c || 0,
        this_week: (db.prepare("SELECT COUNT(*) as c FROM messages WHERE timestamp >= datetime('now', '-7 days')").get() as any)?.c || 0,
      },
      entities: {
        total: (db.prepare('SELECT COUNT(*) as c FROM entities').get() as any)?.c || 0,
        by_type: {},
      },
      decisions: {
        total: (db.prepare('SELECT COUNT(*) as c FROM decisions').get() as any)?.c || 0,
        pending: 0,
        made: 0,
      },
      patterns: {
        total: (db.prepare('SELECT COUNT(*) as c FROM patterns').get() as any)?.c || 0,
        by_type: {},
      },
      summaries: {
        total: (db.prepare('SELECT COUNT(*) as c FROM cognitive_summaries').get() as any)?.c || 0,
        latest: null as string | null,
      },
      last_updated: new Date().toISOString(),
    }

    const entityTypes = db.prepare('SELECT type, COUNT(*) as count FROM entities GROUP BY type').all() as any[]
    entityTypes.forEach((r) => { stats.entities.by_type[r.type] = r.count })
    const patternTypes = db.prepare('SELECT pattern_type, COUNT(*) as count FROM patterns GROUP BY pattern_type').all() as any[]
    patternTypes.forEach((r) => { stats.patterns.by_type[r.pattern_type] = r.count })
    stats.decisions.pending = (db.prepare("SELECT COUNT(*) as c FROM decisions WHERE status = 'pending'").get() as any)?.c || 0
    stats.decisions.made = (db.prepare("SELECT COUNT(*) as c FROM decisions WHERE status = 'made'").get() as any)?.c || 0

    res.json(stats)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Messages ────────────────────────────────────────────────────────────────

app.get('/messages', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50
    const offset = parseInt(req.query.offset as string) || 0
    const jid = req.query.jid as string

    let query = 'SELECT * FROM messages'
    const params: any[] = []
    if (jid) {
      query += ' WHERE jid = ?'
      params.push(jid)
    }
    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const messages = db.prepare(query).all(...params) as any[]
    const total = jid
      ? (db.prepare('SELECT COUNT(*) as c FROM messages WHERE jid = ?').get(jid) as any)?.c
      : (db.prepare('SELECT COUNT(*) as c FROM messages').get() as any)?.c

    res.json({ messages, total: total || 0 })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/messages/:id', (req, res) => {
  try {
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id)
    if (!msg) return res.status(404).json({ error: 'Message not found' })
    res.json(msg)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/messages', (req, res) => {
  try {
    const { jid, sender, content, chat_type, direction, metadata } = req.body
    const result = db.prepare(
      'INSERT INTO messages (jid, sender, content, chat_type, direction, metadata) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(jid, sender, content, chat_type || 'individual', direction || 'inbound', JSON.stringify(metadata || {}))
    res.json({ id: result.lastInsertRowid })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Entities ────────────────────────────────────────────────────────────────

app.get('/entities', (req, res) => {
  try {
    const type = req.query.type as string
    const limit = parseInt(req.query.limit as string) || 50
    const offset = parseInt(req.query.offset as string) || 0

    let query = 'SELECT * FROM entities'
    const params: any[] = []
    if (type) {
      query += ' WHERE type = ?'
      params.push(type)
    }
    query += ' ORDER BY mention_count DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const entities = db.prepare(query).all(...params) as any[]
    const total = type
      ? (db.prepare('SELECT COUNT(*) as c FROM entities WHERE type = ?').get(type) as any)?.c
      : (db.prepare('SELECT COUNT(*) as c FROM entities').get() as any)?.c

    res.json({ entities, total: total || 0 })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/entities/:id', (req, res) => {
  try {
    const entity = db.prepare('SELECT * FROM entities WHERE id = ?').get(req.params.id)
    if (!entity) return res.status(404).json({ error: 'Entity not found' })
    res.json(entity)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/entities', (req, res) => {
  try {
    const { name, type, attributes } = req.body
    const result = db.prepare(
      'INSERT INTO entities (name, type, attributes) VALUES (?, ?, ?)'
    ).run(name, type || 'topic', JSON.stringify(attributes || {}))
    res.json({ id: result.lastInsertRowid })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/entities/:id', (req, res) => {
  try {
    const { name, type, attributes } = req.body
    db.prepare(
      'UPDATE entities SET name = ?, type = ?, attributes = ?, last_seen = datetime("now") WHERE id = ?'
    ).run(name, type, JSON.stringify(attributes || {}), req.params.id)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/entities/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM entities WHERE id = ?').run(req.params.id)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Decisions ───────────────────────────────────────────────────────────────

app.get('/decisions', (req, res) => {
  try {
    const status = req.query.status as string
    const limit = parseInt(req.query.limit as string) || 50
    const offset = parseInt(req.query.offset as string) || 0

    let query = 'SELECT * FROM decisions'
    const params: any[] = []
    if (status) {
      query += ' WHERE status = ?'
      params.push(status)
    }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const decisions = db.prepare(query).all(...params) as any[]
    const total = status
      ? (db.prepare('SELECT COUNT(*) as c FROM decisions WHERE status = ?').get(status) as any)?.c
      : (db.prepare('SELECT COUNT(*) as c FROM decisions').get() as any)?.c

    res.json({ decisions, total: total || 0 })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/decisions/:id', (req, res) => {
  try {
    const decision = db.prepare('SELECT * FROM decisions WHERE id = ?').get(req.params.id)
    if (!decision) return res.status(404).json({ error: 'Decision not found' })
    res.json(decision)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/decisions', (req, res) => {
  try {
    const { title, description, context, decision_maker, status, confidence } = req.body
    const result = db.prepare(
      'INSERT INTO decisions (title, description, context, decision_maker, status, confidence) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(title, description || '', context || '', decision_maker || '', status || 'pending', confidence || 0.5)
    res.json({ id: result.lastInsertRowid })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/decisions/:id', (req, res) => {
  try {
    const { title, description, context, decision_maker, outcome, status, confidence } = req.body
    db.prepare(
      `UPDATE decisions SET title = ?, description = ?, context = ?, decision_maker = ?, 
       outcome = ?, status = ?, confidence = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(title, description, context, decision_maker, outcome, status, confidence, req.params.id)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Patterns ────────────────────────────────────────────────────────────────

app.get('/patterns', (req, res) => {
  try {
    const patternType = req.query.pattern_type as string
    const limit = parseInt(req.query.limit as string) || 50
    const offset = parseInt(req.query.offset as string) || 0

    let query = 'SELECT * FROM patterns'
    const params: any[] = []
    if (patternType) {
      query += ' WHERE pattern_type = ?'
      params.push(patternType)
    }
    query += ' ORDER BY confidence DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const patterns = db.prepare(query).all(...params) as any[]
    const total = patternType
      ? (db.prepare('SELECT COUNT(*) as c FROM patterns WHERE pattern_type = ?').get(patternType) as any)?.c
      : (db.prepare('SELECT COUNT(*) as c FROM patterns').get() as any)?.c

    res.json({ patterns, total: total || 0 })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/patterns/:id', (req, res) => {
  try {
    const pattern = db.prepare('SELECT * FROM patterns WHERE id = ?').get(req.params.id)
    if (!pattern) return res.status(404).json({ error: 'Pattern not found' })
    res.json(pattern)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Summaries ───────────────────────────────────────────────────────────────

app.get('/summaries', (req, res) => {
  try {
    const period = req.query.period as string
    const limit = parseInt(req.query.limit as string) || 10
    const offset = parseInt(req.query.offset as string) || 0

    let query = 'SELECT * FROM cognitive_summaries'
    const params: any[] = []
    if (period) {
      query += ' WHERE period = ?'
      params.push(period)
    }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const summaries = db.prepare(query).all(...params) as any[]
    const total = period
      ? (db.prepare('SELECT COUNT(*) as c FROM cognitive_summaries WHERE period = ?').get(period) as any)?.c
      : (db.prepare('SELECT COUNT(*) as c FROM cognitive_summaries').get() as any)?.c

    res.json({ summaries, total: total || 0 })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/summaries/:id', (req, res) => {
  try {
    const summary = db.prepare('SELECT * FROM cognitive_summaries WHERE id = ?').get(req.params.id)
    if (!summary) return res.status(404).json({ error: 'Summary not found' })
    res.json({
      ...summary,
      key_topics: jsonParse((summary as any).key_topics, []),
      key_entities: jsonParse((summary as any).key_entities, []),
      action_items: jsonParse((summary as any).action_items, []),
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Search (FTS5) ──────────────────────────────────────────────────────────

app.get('/search', (req, res) => {
  try {
    const query = req.query.q as string
    const type = req.query.type as string
    const limit = parseInt(req.query.limit as string) || 20

    if (!query || query.trim().length === 0) {
      return res.json({ results: [], total: 0, query: '' })
    }

    const results: any[] = []

    if (!type || type === 'message') {
      try {
        const rows = db.prepare(
          `SELECT m.id, m.content, rank FROM messages_fts f
           JOIN messages m ON m.id = f.rowid
           WHERE messages_fts MATCH ? ORDER BY rank LIMIT ?`
        ).all(query, limit) as any[]
        rows.forEach((r) => results.push({ type: 'message', id: r.id, content: r.content, rank: -r.rank }))
      } catch {}
    }

    if (!type || type === 'entity') {
      try {
        const rows = db.prepare(
          `SELECT e.id, e.name as content, rank FROM entities_fts f
           JOIN entities e ON e.id = f.rowid
           WHERE entities_fts MATCH ? ORDER BY rank LIMIT ?`
        ).all(query, limit) as any[]
        rows.forEach((r) => results.push({ type: 'entity', id: r.id, content: r.content, rank: -r.rank }))
      } catch {}
    }

    if (!type || type === 'decision') {
      try {
        const rows = db.prepare(
          `SELECT d.id, d.title || ': ' || d.description as content, rank FROM decisions_fts f
           JOIN decisions d ON d.id = f.rowid
           WHERE decisions_fts MATCH ? ORDER BY rank LIMIT ?`
        ).all(query, limit) as any[]
        rows.forEach((r) => results.push({ type: 'decision', id: r.id, content: r.content, rank: -r.rank }))
      } catch {}
    }

    if (!type || type === 'pattern') {
      try {
        const rows = db.prepare(
          `SELECT p.id, p.name || ': ' || p.description as content, rank FROM patterns_fts f
           JOIN patterns p ON p.id = f.rowid
           WHERE patterns_fts MATCH ? ORDER BY rank LIMIT ?`
        ).all(query, limit) as any[]
        rows.forEach((r) => results.push({ type: 'pattern', id: r.id, content: r.content, rank: -r.rank }))
      } catch {}
    }

    if (!type || type === 'summary') {
      try {
        const rows = db.prepare(
          `SELECT s.id, s.summary as content, rank FROM summaries_fts f
           JOIN cognitive_summaries s ON s.id = f.rowid
           WHERE summaries_fts MATCH ? ORDER BY rank LIMIT ?`
        ).all(query, limit) as any[]
        rows.forEach((r) => results.push({ type: 'summary', id: r.id, content: r.content, rank: -r.rank }))
      } catch {}
    }

    // Sort by rank descending
    results.sort((a, b) => b.rank - a.rank)

    res.json({ results: results.slice(0, limit), total: results.length, query })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Analysis Endpoints ─────────────────────────────────────────────────────

app.post('/analysis/summarize', (req, res) => {
  try {
    const { period } = req.body
    // For now, return a simple summary placeholder
    // In production, this would call Hermes/DeerFlow to generate the summary
    const now = new Date()
    const startDate = new Date(now)
    if (period === 'daily') startDate.setDate(startDate.getDate() - 1)
    else if (period === 'weekly') startDate.setDate(startDate.getDate() - 7)
    else startDate.setMonth(startDate.getMonth() - 1)

    const messageCount = (db.prepare(
      'SELECT COUNT(*) as c FROM messages WHERE timestamp >= ?'
    ).get(startDate.toISOString()) as any)?.c || 0

    const result = db.prepare(
      `INSERT INTO cognitive_summaries (period, start_date, end_date, summary, key_topics, key_entities, action_items, sentiment_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      period || 'daily',
      startDate.toISOString(),
      now.toISOString(),
      `Auto-generated ${period} summary: ${messageCount} messages processed.`,
      JSON.stringify(['whatsapp', 'communication']),
      JSON.stringify([]),
      JSON.stringify([]),
      0.5
    )

    res.json({ id: result.lastInsertRowid, message: 'Summary generated' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/analysis/extract-entities', (req, res) => {
  res.json({ message: 'Entity extraction queued. Use Hermes Agent for full NLP extraction.' })
})

app.post('/analysis/detect-patterns', (req, res) => {
  res.json({ message: 'Pattern detection queued. Use Hermes Agent for full analysis.' })
})

app.post('/analysis/sentiment', (req, res) => {
  res.json({ message: 'Sentiment analysis queued. Use DeerFlow for deep analysis.' })
})

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'cognitive-capital-api', db: DB_PATH })
})

// ─── Start Server ────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.COGNITIVE_API_PORT || '8645')
app.listen(PORT, () => {
  console.log(`[cognitive-api] Cognitive Capital API running on http://localhost:${PORT}`)
})
