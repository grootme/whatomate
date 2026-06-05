/**
 * Whatomate Intelligence Platform — Agent Mission Groups System
 *
 * 4 Mission Groups × 4 DNA Layers:
 *   1. Economic Activity, Logistics & Finance
 *   2. Geopolitics, Security, History & Conflicts
 *   3. Science, Technology & Innovation (AI focus)
 *   4. Personal Risk Management, Geographic & Enterprise Risk
 *
 * DNA Layers: Ingestion → Analysis → Monitoring → Reports
 *
 * Risk Score = nature×0.35 + volume×0.25 + connections×0.20 + osint×0.15 + recency×0.05
 *
 * Port: 8680 | Redis: localhost:6379 | OSINT: http://localhost:8000/api/live-data
 */

import http from "http";
import Redis from "ioredis";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface MissionGroupConfig {
  id: string;
  name: string;
  shortName: string;
  description: string;
  categories: string[];
  keywords: string[];
  thresholdConfig: {
    low: number;
    moderate: number;
    high: number;
    critical: number;
  };
}

interface OSINTItem {
  id?: string;
  title?: string;
  content?: string;
  category?: string;
  source?: string;
  timestamp?: string;
  severity?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface AnalysisResult {
  groupId: string;
  timestamp: string;
  riskScore: number;
  riskLevel: "low" | "moderate" | "high" | "critical";
  breakdown: {
    nature: number;
    volume: number;
    connections: number;
    osint: number;
    recency: number;
  };
  findings: string[];
  dataPoints: number;
  categoryDistribution: Record<string, number>;
}

interface Alert {
  id: string;
  groupId: string;
  groupName: string;
  severity: "low" | "moderate" | "high" | "critical";
  title: string;
  description: string;
  timestamp: string;
  category: string;
  riskScore: number;
  acknowledged: boolean;
}

interface MonitoringRule {
  id: string;
  name: string;
  field: string;
  operator: "gt" | "lt" | "eq" | "contains" | "threshold_exceeded";
  value: number | string;
  severity: "low" | "moderate" | "high" | "critical";
  enabled: boolean;
}

interface Report {
  id: string;
  groupId: string;
  groupName: string;
  generatedAt: string;
  period: { from: string; to: string };
  summary: string;
  riskScore: number;
  riskLevel: string;
  keyFindings: string[];
  alertsGenerated: number;
  dataIngested: number;
  recommendations: string[];
  categoryBreakdown: Record<string, number>;
}

interface FeedbackPayload {
  groupId?: string;
  ruleId?: string;
  action: "adjust_threshold" | "enable_rule" | "disable_rule" | "tune_weight";
  parameters: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────
// Mission Group Definitions
// ────────────────────────────────────────────────────────────

const MISSION_GROUPS: MissionGroupConfig[] = [
  {
    id: "economic-logistics-finance",
    name: "Economic Activity, Logistics & Finance",
    shortName: "EconFin",
    description:
      "Monitors economic indicators, supply chains, financial markets, sanctions, and trade flows across global markets.",
    categories: [
      "economic-indicators",
      "supply-chain",
      "financial-markets",
      "sanctions",
      "trade-flows",
      "commodities",
      "currency",
      "banking",
      "ships",
      "tracked_flights",
      "commercial_flights",
    ],
    keywords: [
      "GDP", "inflation", "interest rate", "sanctions", "embargo", "trade war",
      "supply chain", "logistics", "market crash", "bull market", "bear market",
      "commodity", "stock index", "bond yield", "forex", "tariff", "import",
      "export", "deficit", "surplus", "recession", "stimulus", "federal reserve",
      "central bank", "dividend", "IPO", "merger", "acquisition", "bankruptcy",
      "ships", "maritime", "vessel", "cargo", "port", "shipping", "freight",
      "commercial", "flight", "aviation", "airline",
    ],
    thresholdConfig: { low: 25, moderate: 45, high: 70, critical: 85 },
  },
  {
    id: "geopolitics-security-conflicts",
    name: "Geopolitics, Security, History & Conflicts",
    shortName: "GeoSec",
    description:
      "Monitors military movements, conflict zones, diplomatic events, and historical patterns that inform geopolitical risk.",
    categories: [
      "military-movements",
      "conflict-zones",
      "diplomatic-events",
      "historical-patterns",
      "terrorism",
      "border-disputes",
      "alliances",
      "sanctions-policy",
      "military_flights",
      "sigint",
      "liveuamap",
      "gps_jamming",
      "gdelt",
    ],
    keywords: [
      "military", "troop", "deployment", "naval", "airstrike", "ceasefire",
      "diplomacy", "summit", "treaty", "war", "conflict", "invasion",
      "annexation", "sovereignty", "NATO", "UN resolution", "sanctions",
      "embargo", "insurgency", "coup", "border", "territorial", "proxy war",
      "cyber warfare", "espionage", "intelligence", "detente", "armistice",
      "REACH", "RCH", "EVAC", "callsign", "sigint", "jamming", "gps",
      "liveuamap", "missile", "drone", "strike", "offensive", "defense",
    ],
    thresholdConfig: { low: 20, moderate: 40, high: 65, critical: 80 },
  },
  {
    id: "science-tech-innovation",
    name: "Science, Technology & Innovation (AI Focus)",
    shortName: "SciTech",
    description:
      "Monitors tech developments, AI breakthroughs, cyber threats, and research publications shaping the technology landscape.",
    categories: [
      "ai-ml",
      "cyber-threats",
      "research-pubs",
      "emerging-tech",
      "quantum-computing",
      "biotech",
      "space-tech",
      "semiconductors",
      "uavs",
    ],
    keywords: [
      "AI", "machine learning", "deep learning", "LLM", "GPT", "neural network",
      "cyber attack", "zero-day", "ransomware", "data breach", "vulnerability",
      "quantum", "blockchain", "semiconductor", "chip", "research paper",
      "arxiv", "breakthrough", "patent", "startup", "funding round", "IPO tech",
      "regulation AI", "algorithm", "autonomous", "robotics", "IoT", "5G",
      "UAV", "drone", "RPA", "technology", "innovation", "science",
      "openai", "google deepmind", "anthropic", "transformer",
    ],
    thresholdConfig: { low: 30, moderate: 50, high: 72, critical: 88 },
  },
  {
    id: "personal-risk-geographic-enterprise",
    name: "Personal Risk Management, Geographic & Enterprise Risk",
    shortName: "RiskMgmt",
    description:
      "Monitors personal security, geographic hazards, corporate risks, and travel advisories for comprehensive risk management.",
    categories: [
      "personal-security",
      "geographic-hazards",
      "corporate-risk",
      "travel-advisories",
      "natural-disasters",
      "health-risks",
      "regulatory-compliance",
      "reputation-risk",
      "earthquakes",
      "firms_fires",
      "weather_alerts",
    ],
    keywords: [
      "travel advisory", "evacuation", "natural disaster", "earthquake",
      "hurricane", "flood", "wildfire", "pandemic", "epidemic", "compliance",
      "regulatory", "fraud", "embezzlement", "data leak", "privacy violation",
      "kidnapping", "terror threat", "civil unrest", "protest", "riot",
      "infrastructure failure", "power outage", "supply disruption", "recall",
      "litigation", "class action", "fine", "penalty", "breach",
      "fire", "smoke", "detection", "weather", "alert", "severe", "extreme",
      "magnitude", "seismic", "tsunami", "warning", "hazard", "risk",
    ],
    thresholdConfig: { low: 25, moderate: 45, high: 68, critical: 82 },
  },
];

// ────────────────────────────────────────────────────────────
// State Store
// ────────────────────────────────────────────────────────────

interface GroupState {
  config: MissionGroupConfig;
  status: "active" | "degraded" | "offline";
  lastIngestion: string | null;
  lastAnalysis: string | null;
  dataBuffer: OSINTItem[];
  analysisHistory: AnalysisResult[];
  alerts: Alert[];
  monitoringRules: MonitoringRule[];
  reports: Report[];
  totalIngested: number;
  totalAlerts: number;
  weightOverrides: {
    nature: number;
    volume: number;
    connections: number;
    osint: number;
    recency: number;
  };
}

const groupStates: Map<string, GroupState> = new Map();

function initGroupStates(): void {
  for (const config of MISSION_GROUPS) {
    groupStates.set(config.id, {
      config,
      status: "active",
      lastIngestion: null,
      lastAnalysis: null,
      dataBuffer: [],
      analysisHistory: [],
      alerts: [],
      monitoringRules: createDefaultRules(config),
      reports: [],
      totalIngested: 0,
      totalAlerts: 0,
      weightOverrides: {
        nature: 0.35,
        volume: 0.25,
        connections: 0.20,
        osint: 0.15,
        recency: 0.05,
      },
    });
  }
}

function createDefaultRules(config: MissionGroupConfig): MonitoringRule[] {
  return [
    {
      id: `${config.id}-risk-threshold`,
      name: "Risk Threshold Monitor",
      field: "riskScore",
      operator: "threshold_exceeded",
      value: config.thresholdConfig.high,
      severity: "high",
      enabled: true,
    },
    {
      id: `${config.id}-volume-spike`,
      name: "Data Volume Spike Detection",
      field: "dataBuffer.length",
      operator: "gt",
      value: 50,
      severity: "moderate",
      enabled: true,
    },
    {
      id: `${config.id}-critical-keyword`,
      name: "Critical Keyword Alert",
      field: "content",
      operator: "contains",
      value: "critical",
      severity: "critical",
      enabled: true,
    },
    {
      id: `${config.id}-severity-watch`,
      name: "Severity Level Watch",
      field: "severity",
      operator: "eq",
      value: "critical",
      severity: "high",
      enabled: true,
    },
  ];
}

// ────────────────────────────────────────────────────────────
// Redis Client
// ────────────────────────────────────────────────────────────

let redis: Redis;
let redisPublisher: Redis;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const STREAM_EVENTS = "whatomate:mission_events";
const STREAM_ALERTS = "whatomate:mission_alerts";

async function initRedis(): Promise<void> {
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 5000),
    lazyConnect: true,
  });

  redisPublisher = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 5000),
    lazyConnect: true,
  });

  try {
    await redis.connect();
    await redisPublisher.connect();
    log("Redis connected successfully");
  } catch (err) {
    log(`Redis connection failed — running in standalone mode: ${err}`);
  }
}

async function publishEvent(event: Record<string, string>): Promise<void> {
  try {
    if (redisPublisher && redisPublisher.status === "ready") {
      // Flatten to field-value pairs: [field1, val1, field2, val2, ...]
      const args: string[] = [];
      for (const [k, v] of Object.entries(event)) {
        args.push(k, String(v));
      }
      if (args.length > 0) {
        await redisPublisher.xadd(STREAM_EVENTS, "*", ...args);
      }
    }
  } catch (err) {
    log(`Failed to publish event to Redis: ${err}`);
  }
}

async function publishAlert(alert: Alert): Promise<void> {
  try {
    if (redisPublisher && redisPublisher.status === "ready") {
      const fields = [
        "alertId", alert.id,
        "groupId", alert.groupId,
        "groupName", alert.groupName,
        "severity", alert.severity,
        "title", alert.title,
        "description", alert.description.substring(0, 500),
        "timestamp", alert.timestamp,
        "category", alert.category,
        "riskScore", String(alert.riskScore),
      ];
      await redisPublisher.xadd(STREAM_ALERTS, "*", ...fields);
    }
  } catch (err) {
    log(`Failed to publish alert to Redis: ${err}`);
  }
}

// ────────────────────────────────────────────────────────────
// Logging
// ────────────────────────────────────────────────────────────

function log(msg: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [AgentMissions] ${msg}`);
}

function logError(msg: string, err?: unknown): void {
  const ts = new Date().toISOString();
  console.error(`[${ts}] [AgentMissions] ERROR: ${msg}`, err || "");
}

// ────────────────────────────────────────────────────────────
// DNA Layer 1: Ingestion
// ────────────────────────────────────────────────────────────

const OSINT_URL = process.env.OSINT_URL || "http://localhost:8000/api/live-data";

async function fetchOSINTData(): Promise<OSINTItem[]> {
  try {
    const response = await fetch(OSINT_URL, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      logError(`OSINT returned status ${response.status}`);
      return [];
    }
    const data = await response.json();
    if (Array.isArray(data)) return data;
    if (data?.data && Array.isArray(data.data)) return data.data;
    if (data?.items && Array.isArray(data.items)) return data.items;
    if (data?.results && Array.isArray(data.results)) return data.results;

    // Shadowbroker OSINT /api/live-data returns a dict of arrays — flatten it
    if (typeof data === "object" && !Array.isArray(data)) {
      const items: OSINTItem[] = [];
      const arrayKeys = [
        "earthquakes", "military_flights", "commercial_flights", "tracked_flights",
        "firms_fires", "weather_alerts", "news", "gdelt", "gps_jamming",
        "uavs", "liveuamap", "sigint", "ships", "correlations", "crowdthreat",
        "private_jets",
      ];
      for (const key of arrayKeys) {
        if (Array.isArray(data[key])) {
          for (const entry of data[key]) {
            items.push({
              ...entry,
              category: key,
              source: entry.source || "shadowbroker-osint",
              timestamp: entry.time || entry.date || entry.publishedAt || new Date().toISOString(),
              severity: entry.severity || (entry.magnitude > 6 ? "high" : entry.magnitude > 4 ? "moderate" : "low"),
              title: entry.title || entry.name || entry.callsign || entry.event || key,
              content: entry.description || entry.content || entry.message || JSON.stringify(entry).slice(0, 200),
            });
          }
        }
      }
      return items;
    }

    return [];
  } catch (err) {
    logError(`Failed to fetch OSINT data from ${OSINT_URL}`, err);
    return [];
  }
}

function categorizeItem(item: OSINTItem): string | null {
  const text = [
    item.title,
    item.content,
    item.category,
    ...(item.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!text) return null;

  for (const group of MISSION_GROUPS) {
    const categoryMatch = group.categories.some((c) =>
      text.includes(c.toLowerCase().replace(/-/g, " "))
    );
    if (categoryMatch) return group.id;

    const keywordMatches = group.keywords.filter((k) =>
      text.includes(k.toLowerCase())
    ).length;
    if (keywordMatches >= 1) return group.id;
  }

  // Default: assign to first group that has any partial match
  for (const group of MISSION_GROUPS) {
    const partial = group.keywords.some((k) => {
      const words = k.toLowerCase().split(/\s+/);
      return words.some((w) => text.includes(w) && w.length > 3);
    });
    if (partial) return group.id;
  }

  return null;
}

async function runIngestionCycle(): Promise<void> {
  log("Starting ingestion cycle…");
  const rawItems = await fetchOSINTData();
  log(`Fetched ${rawItems.length} OSINT items`);

  let categorized = 0;
  for (const item of rawItems) {
    const groupId = categorizeItem(item);
    if (groupId) {
      const state = groupStates.get(groupId);
      if (state) {
        state.dataBuffer.push(item);
        state.totalIngested++;
        categorized++;
      }
    }
  }

  const now = new Date().toISOString();
  for (const [id, state] of groupStates) {
    if (state.dataBuffer.length > 0) {
      state.lastIngestion = now;
    }
  }

  log(`Categorized ${categorized} items across ${MISSION_GROUPS.length} groups`);

  await publishEvent({
    type: "ingestion_complete",
    totalItems: String(rawItems.length),
    categorized: String(categorized),
    timestamp: now,
  });
}

// ────────────────────────────────────────────────────────────
// DNA Layer 2: Analysis
// ────────────────────────────────────────────────────────────

function computeRiskScore(
  items: OSINTItem[],
  config: MissionGroupConfig,
  weights: GroupState["weightOverrides"]
): { score: number; breakdown: AnalysisResult["breakdown"] } {
  // Nature score — based on severity distribution
  const severityMap: Record<string, number> = {
    critical: 95,
    high: 75,
    moderate: 50,
    low: 25,
    info: 10,
  };
  const natureScores = items.map((item) => {
    const sev = String(item.severity || "moderate").toLowerCase();
    return severityMap[sev] ?? 50;
  });
  const nature =
    natureScores.length > 0
      ? natureScores.reduce((a, b) => a + b, 0) / natureScores.length
      : 0;

  // Volume score — logarithmic scale
  const volume = Math.min(100, Math.log2(items.length + 1) * 14.3);

  // Connections score — based on cross-references / tags overlap
  const tagCounts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags || []) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  const sharedTags = [...tagCounts.values()].filter((c) => c > 1).length;
  const connections = Math.min(100, sharedTags * 12);

  // OSINT score — source reliability / diversity
  const sources = new Set(items.map((i) => i.source).filter(Boolean));
  const osint = Math.min(100, sources.size * 15 + items.length * 0.5);

  // Recency score — how fresh is the data
  const now = Date.now();
  const ages = items
    .map((i) => {
      if (!i.timestamp) return 60;
      const age = (now - new Date(i.timestamp).getTime()) / (1000 * 60);
      return Math.max(0, Math.min(100, 100 - age));
    })
    .filter((a) => !isNaN(a));
  const recency =
    ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 50;

  const breakdown = { nature, volume, connections, osint, recency };

  const score =
    nature * weights.nature +
    volume * weights.volume +
    connections * weights.connections +
    osint * weights.osint +
    recency * weights.recency;

  return { score: Math.round(Math.min(100, Math.max(0, score))), breakdown };
}

function determineRiskLevel(
  score: number,
  thresholds: MissionGroupConfig["thresholdConfig"]
): "low" | "moderate" | "high" | "critical" {
  if (score >= thresholds.critical) return "critical";
  if (score >= thresholds.high) return "high";
  if (score >= thresholds.moderate) return "moderate";
  return "low";
}

function generateFindings(
  items: OSINTItem[],
  config: MissionGroupConfig,
  riskLevel: string
): string[] {
  const findings: string[] = [];

  // Severity distribution finding
  const severityCounts: Record<string, number> = {};
  for (const item of items) {
    const sev = String(item.severity || "unknown").toLowerCase();
    severityCounts[sev] = (severityCounts[sev] || 0) + 1;
  }
  const topSeverity = Object.entries(severityCounts).sort(
    ([, a], [, b]) => b - a
  )[0];
  if (topSeverity) {
    findings.push(
      `Dominant severity level: ${topSeverity[0]} (${topSeverity[1]} items)`
    );
  }

  // Category distribution finding
  const catCounts: Record<string, number> = {};
  for (const item of items) {
    const cat = String(item.category || "uncategorized").toLowerCase();
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  }
  const topCats = Object.entries(catCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  for (const [cat, count] of topCats) {
    findings.push(`Category "${cat}": ${count} data points detected`);
  }

  // Keyword presence finding
  const text = items
    .map((i) => [i.title, i.content].filter(Boolean).join(" "))
    .join(" ")
    .toLowerCase();
  const matchedKeywords = config.keywords.filter((k) =>
    text.includes(k.toLowerCase())
  );
  if (matchedKeywords.length > 0) {
    findings.push(
      `Key indicators detected: ${matchedKeywords.slice(0, 8).join(", ")}`
    );
  }

  // Risk level finding
  findings.push(
    `Overall risk assessment: ${riskLevel.toUpperCase()} — ${config.shortName} mission group`
  );

  return findings;
}

async function runAnalysisForGroup(groupId: string): Promise<AnalysisResult | null> {
  const state = groupStates.get(groupId);
  if (!state) return null;

  const items = [...state.dataBuffer];
  if (items.length === 0) {
    // Still generate a baseline analysis
    const result: AnalysisResult = {
      groupId,
      timestamp: new Date().toISOString(),
      riskScore: 0,
      riskLevel: "low",
      breakdown: { nature: 0, volume: 0, connections: 0, osint: 0, recency: 0 },
      findings: ["No data available for analysis — awaiting OSINT ingestion"],
      dataPoints: 0,
      categoryDistribution: {},
    };
    state.analysisHistory.push(result);
    state.lastAnalysis = result.timestamp;
    return result;
  }

  const { score, breakdown } = computeRiskScore(
    items,
    state.config,
    state.weightOverrides
  );
  const riskLevel = determineRiskLevel(score, state.config.thresholdConfig);
  const findings = generateFindings(items, state.config, riskLevel);

  // Category distribution
  const categoryDistribution: Record<string, number> = {};
  for (const item of items) {
    const cat = String(item.category || "uncategorized");
    categoryDistribution[cat] = (categoryDistribution[cat] || 0) + 1;
  }

  const result: AnalysisResult = {
    groupId,
    timestamp: new Date().toISOString(),
    riskScore: score,
    riskLevel,
    breakdown,
    findings,
    dataPoints: items.length,
    categoryDistribution,
  };

  state.analysisHistory.push(result);
  if (state.analysisHistory.length > 100) {
    state.analysisHistory = state.analysisHistory.slice(-100);
  }
  state.lastAnalysis = result.timestamp;

  // Clear buffer after analysis
  state.dataBuffer = [];

  await publishEvent({
    type: "analysis_complete",
    groupId,
    riskScore: String(score),
    riskLevel,
    dataPoints: String(items.length),
    timestamp: result.timestamp,
  });

  return result;
}

async function runAnalysisCycle(): Promise<void> {
  log("Starting analysis cycle across all groups…");
  for (const group of MISSION_GROUPS) {
    await runAnalysisForGroup(group.id);
  }
  log("Analysis cycle complete");
}

// ────────────────────────────────────────────────────────────
// DNA Layer 3: Monitoring
// ────────────────────────────────────────────────────────────

function evaluateRule(
  rule: MonitoringRule,
  state: GroupState,
  latestAnalysis: AnalysisResult | null
): Alert | null {
  if (!rule.enabled) return null;

  let triggered = false;
  const fieldValue = rule.field;

  switch (rule.operator) {
    case "threshold_exceeded": {
      if (
        fieldValue === "riskScore" &&
        latestAnalysis &&
        latestAnalysis.riskScore >= (rule.value as number)
      ) {
        triggered = true;
      }
      break;
    }
    case "gt": {
      if (fieldValue === "dataBuffer.length") {
        triggered = state.dataBuffer.length > (rule.value as number);
      }
      break;
    }
    case "lt": {
      if (fieldValue === "dataBuffer.length") {
        triggered = state.dataBuffer.length < (rule.value as number);
      }
      break;
    }
    case "eq": {
      if (fieldValue === "severity" && latestAnalysis) {
        triggered = latestAnalysis.riskLevel === (rule.value as string);
      }
      break;
    }
    case "contains": {
      const text = state.dataBuffer
        .map((i) => [i.title, i.content].filter(Boolean).join(" "))
        .join(" ")
        .toLowerCase();
      triggered = text.includes(String(rule.value).toLowerCase());
      break;
    }
  }

  if (!triggered) return null;

  const alert: Alert = {
    id: `alert-${state.config.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    groupId: state.config.id,
    groupName: state.config.name,
    severity: rule.severity,
    title: `Rule Triggered: ${rule.name}`,
    description: `Monitoring rule "${rule.name}" triggered for group "${state.config.shortName}". Field: ${rule.field}, Operator: ${rule.operator}, Threshold: ${rule.value}.`,
    timestamp: new Date().toISOString(),
    category: state.config.categories[0] || "general",
    riskScore: latestAnalysis?.riskScore ?? 0,
    acknowledged: false,
  };

  return alert;
}

async function runMonitoringCycle(): Promise<void> {
  log("Starting monitoring cycle…");
  let alertCount = 0;

  for (const group of MISSION_GROUPS) {
    const state = groupStates.get(group.id);
    if (!state) continue;

    const latestAnalysis =
      state.analysisHistory.length > 0
        ? state.analysisHistory[state.analysisHistory.length - 1]
        : null;

    for (const rule of state.monitoringRules) {
      const alert = evaluateRule(rule, state, latestAnalysis);
      if (alert) {
        state.alerts.push(alert);
        state.totalAlerts++;
        alertCount++;
        await publishAlert(alert);
      }
    }

    // Anomaly detection — sudden risk score jump
    if (state.analysisHistory.length >= 2) {
      const current = state.analysisHistory[state.analysisHistory.length - 1];
      const previous = state.analysisHistory[state.analysisHistory.length - 2];
      const delta = current.riskScore - previous.riskScore;
      if (delta > 20) {
        const anomalyAlert: Alert = {
          id: `alert-anomaly-${group.id}-${Date.now()}`,
          groupId: group.id,
          groupName: group.name,
          severity: "high",
          title: `Anomaly Detected: Risk Score Spike in ${group.shortName}`,
          description: `Risk score jumped by ${delta} points (from ${previous.riskScore} to ${current.riskScore}) in the last analysis cycle.`,
          timestamp: new Date().toISOString(),
          category: "anomaly-detection",
          riskScore: current.riskScore,
          acknowledged: false,
        };
        state.alerts.push(anomalyAlert);
        state.totalAlerts++;
        alertCount++;
        await publishAlert(anomalyAlert);
      }
    }

    // Keep alerts bounded
    if (state.alerts.length > 500) {
      state.alerts = state.alerts.slice(-500);
    }
  }

  log(`Monitoring cycle complete — ${alertCount} new alerts generated`);
}

// ────────────────────────────────────────────────────────────
// DNA Layer 4: Reports
// ────────────────────────────────────────────────────────────

function generateReport(groupId: string): Report | null {
  const state = groupStates.get(groupId);
  if (!state) return null;

  const latestAnalysis =
    state.analysisHistory.length > 0
      ? state.analysisHistory[state.analysisHistory.length - 1]
      : null;

  const recentAlerts = state.alerts.filter((a) => {
    const alertTime = new Date(a.timestamp).getTime();
    return Date.now() - alertTime < 24 * 60 * 60 * 1000; // Last 24h
  });

  const riskLevel = latestAnalysis?.riskLevel ?? "low";
  const riskScore = latestAnalysis?.riskScore ?? 0;

  const recommendations = generateRecommendations(
    state.config.id,
    riskLevel,
    riskScore,
    recentAlerts.length
  );

  const report: Report = {
    id: `report-${groupId}-${Date.now()}`,
    groupId,
    groupName: state.config.name,
    generatedAt: new Date().toISOString(),
    period: {
      from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      to: new Date().toISOString(),
    },
    summary: `${state.config.shortName} mission group — Risk Level: ${riskLevel.toUpperCase()}, Score: ${riskScore}/100. ${state.totalIngested} data points ingested, ${recentAlerts.length} alerts in last 24h.`,
    riskScore,
    riskLevel,
    keyFindings: latestAnalysis?.findings ?? [
      "No analysis data available",
    ],
    alertsGenerated: recentAlerts.length,
    dataIngested: state.totalIngested,
    recommendations,
    categoryBreakdown: latestAnalysis?.categoryDistribution ?? {},
  };

  state.reports.push(report);
  if (state.reports.length > 50) {
    state.reports = state.reports.slice(-50);
  }

  return report;
}

function generateRecommendations(
  groupId: string,
  riskLevel: string,
  riskScore: number,
  alertCount: number
): string[] {
  const recs: string[] = [];

  if (riskLevel === "critical") {
    recs.push(
      "IMMEDIATE ACTION REQUIRED: Critical risk level detected. Escalate to decision-makers."
    );
    recs.push(
      "Activate crisis response protocols and increase monitoring frequency."
    );
  }

  if (riskLevel === "high") {
    recs.push(
      "Heightened vigilance recommended. Review latest data points for emerging threats."
    );
    recs.push(
      "Consider increasing OSINT source coverage for this mission group."
    );
  }

  if (alertCount > 10) {
    recs.push(
      `High alert volume (${alertCount}). Review and tune monitoring rules to reduce noise.`
    );
  }

  switch (groupId) {
    case "economic-logistics-finance":
      if (riskScore > 60) {
        recs.push(
          "Monitor financial market exposure and review supply chain dependencies."
        );
        recs.push(
          "Assess sanctions impact on current trade routes and financial instruments."
        );
      }
      break;
    case "geopolitics-security-conflicts":
      if (riskScore > 60) {
        recs.push(
          "Review diplomatic channels and conflict zone proximity to assets."
        );
        recs.push(
          "Cross-reference historical conflict patterns with current indicators."
        );
      }
      break;
    case "science-tech-innovation":
      if (riskScore > 60) {
        recs.push(
          "Assess cyber vulnerability exposure and patch critical systems."
        );
        recs.push(
          "Monitor AI regulatory developments that may impact operations."
        );
      }
      break;
    case "personal-risk-geographic-enterprise":
      if (riskScore > 60) {
        recs.push(
          "Update travel advisories and personal security protocols."
        );
        recs.push(
          "Review enterprise risk mitigation strategies and insurance coverage."
        );
      }
      break;
  }

  if (riskLevel === "low") {
    recs.push(
      "Risk levels nominal. Continue standard monitoring and data collection."
    );
  }

  recs.push(
    "Submit feedback via /api/feedback to tune analysis strategies and thresholds."
  );

  return recs;
}

// ────────────────────────────────────────────────────────────
// Feedback / Adaptive Tuning
// ────────────────────────────────────────────────────────────

function applyFeedback(payload: FeedbackPayload): {
  success: boolean;
  message: string;
} {
  if (payload.groupId) {
    const state = groupStates.get(payload.groupId);
    if (!state) {
      return { success: false, message: `Group ${payload.groupId} not found` };
    }

    switch (payload.action) {
      case "adjust_threshold": {
        const { level, value } = payload.parameters;
        if (level && value !== undefined && state.config.thresholdConfig[level as keyof typeof state.config.thresholdConfig] !== undefined) {
          (state.config.thresholdConfig as Record<string, number>)[level as string] = Number(value);
          return {
            success: true,
            message: `Threshold "${level}" adjusted to ${value} for ${state.config.shortName}`,
          };
        }
        return { success: false, message: "Invalid threshold parameters" };
      }

      case "tune_weight": {
        const { weight, value } = payload.parameters;
        if (
          weight &&
          value !== undefined &&
          weight in state.weightOverrides
        ) {
          const newWeight = Number(value);
          (state.weightOverrides as Record<string, number>)[weight as string] = newWeight;
          return {
            success: true,
            message: `Weight "${weight}" adjusted to ${newWeight} for ${state.config.shortName}`,
          };
        }
        return { success: false, message: "Invalid weight parameters" };
      }

      case "enable_rule":
      case "disable_rule": {
        const rule = state.monitoringRules.find(
          (r) => r.id === payload.ruleId
        );
        if (rule) {
          rule.enabled = payload.action === "enable_rule";
          return {
            success: true,
            message: `Rule "${rule.name}" ${payload.action === "enable_rule" ? "enabled" : "disabled"} for ${state.config.shortName}`,
          };
        }
        return { success: false, message: `Rule ${payload.ruleId} not found` };
      }

      default:
        return { success: false, message: `Unknown action: ${payload.action}` };
    }
  }

  return { success: false, message: "groupId is required" };
}

// ────────────────────────────────────────────────────────────
// REST API Server
// ────────────────────────────────────────────────────────────

function jsonResponse(
  res: http.ServerResponse,
  data: unknown,
  statusCode = 200
): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function readBody(req: http.ServerRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

async function handleRequest(
  req: http.ServerRequest,
  res: http.ServerResponse
): Promise<void> {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method?.toUpperCase() || "GET";

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  try {
    // ── Health ──
    if (path === "/health" && method === "GET") {
      const redisStatus =
        redis && redis.status === "ready" ? "connected" : "disconnected";
      const groupStatuses = [...groupStates.values()].map((s) => ({
        id: s.config.id,
        status: s.status,
        lastAnalysis: s.lastAnalysis,
      }));
      jsonResponse(res, {
        status: "operational",
        service: "whatomate-agent-missions",
        version: "1.0.0",
        uptime: process.uptime(),
        redis: redisStatus,
        groups: groupStatuses,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // ── List Groups ──
    if (path === "/api/groups" && method === "GET") {
      const groups = [...groupStates.values()].map((state) => ({
        id: state.config.id,
        name: state.config.name,
        shortName: state.config.shortName,
        description: state.config.description,
        status: state.status,
        categories: state.config.categories,
        lastIngestion: state.lastIngestion,
        lastAnalysis: state.lastAnalysis,
        totalIngested: state.totalIngested,
        totalAlerts: state.totalAlerts,
        activeAlerts: state.alerts.filter((a) => !a.acknowledged).length,
        latestRiskScore:
          state.analysisHistory.length > 0
            ? state.analysisHistory[state.analysisHistory.length - 1].riskScore
            : null,
        latestRiskLevel:
          state.analysisHistory.length > 0
            ? state.analysisHistory[state.analysisHistory.length - 1].riskLevel
            : null,
        monitoringRules: state.monitoringRules.length,
        weightConfig: state.weightOverrides,
        thresholds: state.config.thresholdConfig,
      }));
      jsonResponse(res, { groups, totalGroups: groups.length });
      return;
    }

    // ── Group Details ──
    const groupMatch = path.match(/^\/api\/groups\/([^/]+)$/);
    if (groupMatch && method === "GET") {
      const groupId = groupMatch[1];
      const state = groupStates.get(groupId);
      if (!state) {
        jsonResponse(res, { error: "Group not found" }, 404);
        return;
      }
      const latestAnalysis =
        state.analysisHistory.length > 0
          ? state.analysisHistory[state.analysisHistory.length - 1]
          : null;
      jsonResponse(res, {
        id: state.config.id,
        name: state.config.name,
        shortName: state.config.shortName,
        description: state.config.description,
        status: state.status,
        categories: state.config.categories,
        keywords: state.config.keywords,
        lastIngestion: state.lastIngestion,
        lastAnalysis: state.lastAnalysis,
        totalIngested: state.totalIngested,
        totalAlerts: state.totalAlerts,
        thresholds: state.config.thresholdConfig,
        weightConfig: state.weightOverrides,
        monitoringRules: state.monitoringRules,
        latestAnalysis,
        recentAnalyses: state.analysisHistory.slice(-10),
        activeAlerts: state.alerts.filter((a) => !a.acknowledged),
        reportsGenerated: state.reports.length,
      });
      return;
    }

    // ── Group Report ──
    const reportMatch = path.match(/^\/api\/groups\/([^/]+)\/report$/);
    if (reportMatch && method === "GET") {
      const groupId = reportMatch[1];
      const report = generateReport(groupId);
      if (!report) {
        jsonResponse(res, { error: "Group not found" }, 404);
        return;
      }
      await publishEvent({
        type: "report_generated",
        groupId,
        reportId: report.id,
        riskScore: String(report.riskScore),
        timestamp: report.generatedAt,
      });
      jsonResponse(res, report);
      return;
    }

    // ── Trigger Analysis ──
    const analyzeMatch = path.match(/^\/api\/groups\/([^/]+)\/analyze$/);
    if (analyzeMatch && method === "POST") {
      const groupId = analyzeMatch[1];
      const result = await runAnalysisForGroup(groupId);
      if (!result) {
        jsonResponse(res, { error: "Group not found" }, 404);
        return;
      }

      // Also run monitoring for this group after analysis
      const state = groupStates.get(groupId)!;
      for (const rule of state.monitoringRules) {
        const alert = evaluateRule(rule, state, result);
        if (alert) {
          state.alerts.push(alert);
          state.totalAlerts++;
          await publishAlert(alert);
        }
      }

      jsonResponse(res, {
        message: "Analysis triggered successfully",
        groupId,
        result,
      });
      return;
    }

    // ── All Alerts ──
    if (path === "/api/alerts" && method === "GET") {
      const allAlerts: Alert[] = [];
      for (const state of groupStates.values()) {
        allAlerts.push(...state.alerts);
      }
      allAlerts.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      const unacknowledged = allAlerts.filter((a) => !a.acknowledged);
      jsonResponse(res, {
        totalAlerts: allAlerts.length,
        activeAlerts: unacknowledged.length,
        alerts: allAlerts.slice(0, 200),
        bySeverity: {
          critical: allAlerts.filter((a) => a.severity === "critical").length,
          high: allAlerts.filter((a) => a.severity === "high").length,
          moderate: allAlerts.filter((a) => a.severity === "moderate").length,
          low: allAlerts.filter((a) => a.severity === "low").length,
        },
      });
      return;
    }

    // ── Dashboard ──
    if (path === "/api/dashboard" && method === "GET") {
      const dashboard = {
        timestamp: new Date().toISOString(),
        service: "Whatomate Agent Missions",
        version: "1.0.0",
        uptime: process.uptime(),
        redis: redis && redis.status === "ready" ? "connected" : "disconnected",
        groups: [...groupStates.values()].map((state) => {
          const latestAnalysis =
            state.analysisHistory.length > 0
              ? state.analysisHistory[state.analysisHistory.length - 1]
              : null;
          return {
            id: state.config.id,
            name: state.config.shortName,
            riskScore: latestAnalysis?.riskScore ?? 0,
            riskLevel: latestAnalysis?.riskLevel ?? "low",
            status: state.status,
            dataPoints: state.totalIngested,
            activeAlerts: state.alerts.filter((a) => !a.acknowledged).length,
            lastAnalysis: state.lastAnalysis,
          };
        }),
        overallRiskScore: Math.round(
          [...groupStates.values()].reduce((sum, state) => {
            const latest =
              state.analysisHistory.length > 0
                ? state.analysisHistory[state.analysisHistory.length - 1]
                : null;
            return sum + (latest?.riskScore ?? 0);
          }, 0) / MISSION_GROUPS.length
        ),
        totalAlerts: [...groupStates.values()].reduce(
          (sum, s) => sum + s.totalAlerts,
          0
        ),
        totalIngested: [...groupStates.values()].reduce(
          (sum, s) => sum + s.totalIngested,
          0
        ),
        recentAlerts: [...groupStates.values()]
          .flatMap((s) => s.alerts)
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() -
              new Date(a.timestamp).getTime()
          )
          .slice(0, 20),
      };
      jsonResponse(res, dashboard);
      return;
    }

    // ── Feedback ──
    if (path === "/api/feedback" && method === "POST") {
      const body = await readBody(req);
      let payload: FeedbackPayload;
      try {
        payload = JSON.parse(body);
      } catch {
        jsonResponse(res, { error: "Invalid JSON body" }, 400);
        return;
      }
      const result = applyFeedback(payload);
      if (result.success) {
        await publishEvent({
          type: "feedback_applied",
          groupId: payload.groupId || "unknown",
          action: payload.action,
          timestamp: new Date().toISOString(),
        });
      }
      jsonResponse(res, result, result.success ? 200 : 400);
      return;
    }

    // ── 404 ──
    jsonResponse(res, { error: "Endpoint not found", path }, 404);
  } catch (err) {
    logError("Request handler error", err);
    jsonResponse(res, { error: "Internal server error" }, 500);
  }
}

// ────────────────────────────────────────────────────────────
// Main Orchestration Loop
// ────────────────────────────────────────────────────────────

const PORT = 8680;
const POLL_INTERVAL_MS = 60_000; // 60 seconds
let cycleCount = 0;

async function runCycle(): Promise<void> {
  cycleCount++;
  log(`── Cycle #${cycleCount} started ──`);

  try {
    // DNA Layer 1: Ingestion
    await runIngestionCycle();

    // DNA Layer 2: Analysis
    await runAnalysisCycle();

    // DNA Layer 3: Monitoring
    await runMonitoringCycle();

    log(`── Cycle #${cycleCount} complete ──`);
  } catch (err) {
    logError(`Cycle #${cycleCount} failed`, err);
  }
}

async function start(): Promise<void> {
  log("Whatomate Agent Missions System starting…");

  // Initialize state
  initGroupStates();

  // Connect Redis
  await initRedis();

  // Create HTTP server
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    log(`HTTP server listening on port ${PORT}`);
    log(`REST API available at http://localhost:${PORT}`);
    log(`Endpoints:`);
    log(`  GET  /health`);
    log(`  GET  /api/groups`);
    log(`  GET  /api/groups/:id`);
    log(`  GET  /api/groups/:id/report`);
    log(`  POST /api/groups/:id/analyze`);
    log(`  GET  /api/alerts`);
    log(`  GET  /api/dashboard`);
    log(`  POST /api/feedback`);
  });

  // Initial cycle
  await runCycle();

  // Schedule recurring cycles
  setInterval(runCycle, POLL_INTERVAL_MS);

  log(`Polling OSINT every ${POLL_INTERVAL_MS / 1000}s from ${OSINT_URL}`);
  log("System ready — all mission groups active");
}

start().catch((err) => {
  logError("Fatal startup error", err);
  process.exit(1);
});
