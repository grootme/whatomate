/**
 * Whatomate Unified Registries
 *
 * PRINCIPLE: ELIMINAR antes de CREAR, CONSOLIDAR antes de DIVIDIR
 * OCP: Adding a new entity = add an entry, NOT modify code
 *
 * This file is the SINGLE source of truth for:
 * - Severity levels and their visual configs
 * - Threat levels and their boundaries
 * - DNA layers and their configs
 * - Mission groups and their thresholds
 * - Pattern types and their metadata
 * - Agent status configs
 * - Navigation view registry (eliminates page.tsx switch)
 * - Strategy registry
 * - Risk scoring formula
 * - Consensus rules
 */

import {
  LayoutDashboard, MessageSquare, Users, FileText, Megaphone, Bot,
  BarChart3, Settings, Brain, Search, Radio, Cpu, Target, Shield,
  Activity, FileBarChart, AlertTriangle, CheckCircle, XCircle,
  Info, Zap, TrendingUp, Eye, Gauge, Globe, DollarSign,
} from 'lucide-react';

// ─── Severity Registry ───────────────────────────────────────────────
// CONSOLIDATES: severityColors, severityBorders, severityBadgeColors,
//               severityConfig, severityColor(), severityPoints
//               (was in 6 different files)

export type SeverityLevel = 'CRÍTICA' | 'ALTA' | 'MEDIA' | 'BAJA' | 'INFO';

export const SEVERITY: Record<SeverityLevel, {
  label: string;
  badge: string;      // text + bg classes
  border: string;     // border color class
  bg: string;         // background class
  icon: typeof AlertTriangle;
  points: number;
  order: number;      // for sorting
}> = {
  'CRÍTICA': { label: 'Crítica', badge: 'bg-red-500 text-white', border: 'border-red-500', bg: 'bg-red-500/10', icon: AlertTriangle, points: 100, order: 4 },
  'ALTA':    { label: 'Alta',    badge: 'bg-orange-500 text-white', border: 'border-orange-500', bg: 'bg-orange-500/10', icon: XCircle, points: 75, order: 3 },
  'MEDIA':   { label: 'Media',   badge: 'bg-yellow-500 text-white', border: 'border-yellow-500', bg: 'bg-yellow-500/10', icon: Info, points: 50, order: 2 },
  'BAJA':    { label: 'Baja',    badge: 'bg-blue-500 text-white', border: 'border-blue-500', bg: 'bg-blue-500/10', icon: CheckCircle, points: 25, order: 1 },
  'INFO':    { label: 'Info',    badge: 'bg-gray-500 text-white', border: 'border-gray-500', bg: 'bg-gray-500/10', icon: Info, points: 10, order: 0 },
};

export const SEVERITY_ORDER: SeverityLevel[] = ['INFO', 'BAJA', 'MEDIA', 'ALTA', 'CRÍTICA'];
export const severityRank = (s: SeverityLevel): number => SEVERITY[s]?.order ?? 0;

// ─── Risk / Threat Level Registry ────────────────────────────────────
// CONSOLIDATES: 3 different threshold sets from strategies/monitoring/multiagent
// UNIFIED: single set of boundaries

export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';

export const RISK_LEVELS: Record<RiskLevel, {
  label: string; labelEs: string; color: string; bg: string;
  border: string; icon: typeof CheckCircle; minScore: number;
}> = {
  low:       { label: 'Low',       labelEs: 'Bajo',      color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500', icon: CheckCircle, minScore: 0 },
  moderate:  { label: 'Moderate',  labelEs: 'Moderado',   color: 'text-amber-500',   bg: 'bg-amber-500/10',   border: 'border-amber-500',   icon: Info,        minScore: 40 },
  high:      { label: 'High',      labelEs: 'Alto',       color: 'text-orange-500',  bg: 'bg-orange-500/10',  border: 'border-orange-500',  icon: AlertTriangle, minScore: 60 },
  critical:  { label: 'Critical',  labelEs: 'Crítico',    color: 'text-red-500',     bg: 'bg-red-500/10',     border: 'border-red-500',     icon: XCircle,     minScore: 80 },
};

export const scoreToRiskLevel = (score: number): RiskLevel => {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'moderate';
  return 'low';
};

// ─── DNA Layer Registry ──────────────────────────────────────────────
// CONSOLIDATES: layerColors, layerLabels from missions/multiagent views

export type DNALayerId = 1 | 2 | 3 | 4;

export const DNA_LAYERS: Record<DNALayerId, {
  name: string; nameEs: string; color: string; bg: string;
  icon: typeof Eye; description: string;
}> = {
  1: { name: 'Ingestion',  nameEs: 'Ingesta',     color: 'text-blue-500',   bg: 'bg-blue-500/10',   icon: Eye,          description: 'Data collection from OSINT, Telegram, WhatsApp' },
  2: { name: 'Analysis',   nameEs: 'Análisis',     color: 'text-purple-500', bg: 'bg-purple-500/10', icon: Brain,        description: 'Strategy-based analysis and risk scoring' },
  3: { name: 'Monitoring', nameEs: 'Monitoreo',    color: 'text-amber-500',  bg: 'bg-amber-500/10',  icon: Activity,     description: 'Threshold monitoring and alert generation' },
  4: { name: 'Reports',    nameEs: 'Reportes',     color: 'text-emerald-500',bg: 'bg-emerald-500/10', icon: FileBarChart, description: 'Intelligence report generation' },
};

// ─── Mission Group Registry ──────────────────────────────────────────
// CONSOLIDATES: MISSION_GROUPS from agent-missions + intelligence-engine + views

export type MissionGroupId = 'economic-logistics-finance' | 'geopolitics-security-conflicts' | 'science-tech-innovation' | 'personal-risk-geographic-enterprise';

export const MISSION_GROUPS: Record<MissionGroupId, {
  name: string; shortName: string; icon: typeof DollarSign;
  description: string; categories: string[];
  thresholds: Record<RiskLevel, number>;
  weights: { nature: number; volume: number; connections: number; osint: number; recency: number };
}> = {
  'economic-logistics-finance': {
    name: 'Economic Activity, Logistics & Finance', shortName: 'EconFin', icon: DollarSign,
    description: 'Monitors economic indicators, supply chains, financial markets, sanctions, and trade flows.',
    categories: ['economic-indicators', 'supply-chain', 'financial-markets', 'sanctions', 'trade-flows', 'commodities', 'ships', 'commercial_flights'],
    thresholds: { low: 25, moderate: 45, high: 70, critical: 85 },
    weights: { nature: 0.35, volume: 0.25, connections: 0.20, osint: 0.15, recency: 0.05 },
  },
  'geopolitics-security-conflicts': {
    name: 'Geopolitics, Security, History & Conflicts', shortName: 'GeoSec', icon: Shield,
    description: 'Monitors military movements, conflict zones, diplomatic events, and geopolitical risk.',
    categories: ['military-movements', 'conflict-zones', 'diplomatic-events', 'military_flights', 'sigint', 'uavs'],
    thresholds: { low: 25, moderate: 45, high: 70, critical: 85 },
    weights: { nature: 0.35, volume: 0.25, connections: 0.20, osint: 0.15, recency: 0.05 },
  },
  'science-tech-innovation': {
    name: 'Science, Technology & Innovation', shortName: 'SciTech', icon: Cpu,
    description: 'AI research, cybersecurity, space, innovation trends with special AI focus.',
    categories: ['research', 'ai-development', 'cybersecurity', 'space', 'innovation', 'weather'],
    thresholds: { low: 20, moderate: 40, high: 65, critical: 80 },
    weights: { nature: 0.35, volume: 0.25, connections: 0.20, osint: 0.15, recency: 0.05 },
  },
  'personal-risk-geographic-enterprise': {
    name: 'Personal Risk, Geographic & Enterprise Risk', shortName: 'RiskMgmt', icon: Globe,
    description: 'Natural disasters, earthquakes, fires, GPS jamming, health and enterprise risk.',
    categories: ['natural-disasters', 'earthquakes', 'fires', 'gps_jamming', 'health', 'geopolitical-risk'],
    thresholds: { low: 25, moderate: 45, high: 70, critical: 85 },
    weights: { nature: 0.35, volume: 0.25, connections: 0.20, osint: 0.15, recency: 0.05 },
  },
};

// ─── Pattern Type Registry ───────────────────────────────────────────
// CONSOLIDATES: patternTypeLabels, patternTypeSequences from use-intelligence-data + analysis keywords

export type PatternType = 'frequency_spike' | 'geographic_cluster' | 'temporal_pattern' | 'correlation_chain' | 'anomalous_behavior';

export const PATTERN_TYPES: Record<PatternType, {
  label: string; labelEs: string; sequence: string[];
  keywords: string[]; icon: typeof TrendingUp;
}> = {
  frequency_spike: {
    label: 'Frequency Spike', labelEs: 'Pico de Frecuencia',
    sequence: ['Detect', 'Count', 'Compare', 'Alert'],
    keywords: ['spike', 'surge', 'increase', 'unusual volume'],
    icon: TrendingUp,
  },
  geographic_cluster: {
    label: 'Geographic Cluster', labelEs: 'Cluster Geográfico',
    sequence: ['Locate', 'Group', 'Analyze', 'Map'],
    keywords: ['cluster', 'proximity', 'concentration', 'hotspot'],
    icon: Globe,
  },
  temporal_pattern: {
    label: 'Temporal Pattern', labelEs: 'Patrón Temporal',
    sequence: ['Timestamp', 'Sequence', 'Interval', 'Predict'],
    keywords: ['periodic', 'cycle', 'recurring', 'rhythm'],
    icon: Zap,
  },
  correlation_chain: {
    label: 'Correlation Chain', labelEs: 'Cadena de Correlación',
    sequence: ['Link', 'Chain', 'Verify', 'Score'],
    keywords: ['correlated', 'linked', 'connected', 'associated'],
    icon: Target,
  },
  anomalous_behavior: {
    label: 'Anomalous Behavior', labelEs: 'Comportamiento Anómalo',
    sequence: ['Baseline', 'Deviation', 'Significance', 'Flag'],
    keywords: ['anomaly', 'outlier', 'deviation', 'abnormal'],
    icon: Gauge,
  },
};

// ─── Navigation View Registry ────────────────────────────────────────
// CONSOLIDATES: navItems (nav-config.ts), iconMap (sidebar.tsx), viewTitles (header.tsx)
// ELIMINATES: page.tsx switch/case OCP violation

export type ViewId =
  | 'dashboard' | 'chat' | 'contacts' | 'templates' | 'campaigns' | 'chatbot'
  | 'analytics' | 'settings' | 'cognitive' | 'research' | 'hermes'
  | 'multiagent' | 'missions' | 'strategies' | 'monitoring' | 'reports';

export const VIEW_REGISTRY: Record<ViewId, {
  label: string; icon: typeof LayoutDashboard; group: string;
}> = {
  dashboard:   { label: 'Dashboard',   icon: LayoutDashboard, group: 'main' },
  chat:        { label: 'Chat',        icon: MessageSquare,   group: 'main' },
  contacts:    { label: 'Contactos',   icon: Users,           group: 'main' },
  templates:   { label: 'Plantillas',  icon: FileText,        group: 'main' },
  campaigns:   { label: 'Campañas',    icon: Megaphone,       group: 'main' },
  chatbot:     { label: 'Chatbot',     icon: Bot,             group: 'main' },
  analytics:   { label: 'Analítica',   icon: BarChart3,       group: 'tools' },
  settings:    { label: 'Ajustes',     icon: Settings,        group: 'tools' },
  cognitive:   { label: 'Cognitive',   icon: Brain,           group: 'intelligence' },
  research:    { label: 'Research',    icon: Search,          group: 'intelligence' },
  hermes:      { label: 'Hermes',      icon: Radio,           group: 'intelligence' },
  multiagent:  { label: 'Multi-Agent', icon: Cpu,             group: 'intelligence' },
  missions:    { label: 'Misiones',    icon: Target,          group: 'intelligence' },
  strategies:  { label: 'Estrategias', icon: Shield,          group: 'intelligence' },
  monitoring:  { label: 'Monitoreo',   icon: Activity,        group: 'intelligence' },
  reports:     { label: 'Reportes',    icon: FileBarChart,    group: 'intelligence' },
};

export const VIEW_GROUPS = [
  { id: 'main', label: 'Principal' },
  { id: 'tools', label: 'Herramientas' },
  { id: 'intelligence', label: 'Inteligencia' },
] as const;

// ─── Strategy Registry ───────────────────────────────────────────────
// CONSOLIDATES: strategy configs from strategies-view + intelligence strategies

export type StrategyId = 'threshold' | 'pattern' | 'risk_scoring' | 'consensus' | 'predictive' | 'adaptive';

export const STRATEGY_REGISTRY: Record<StrategyId, {
  name: string; nameEs: string; icon: typeof Gauge;
  description: string; color: string;
}> = {
  threshold:   { name: 'Threshold',      nameEs: 'Umbral',                  icon: Gauge,      description: 'Compare data against configurable thresholds',     color: 'text-blue-500' },
  pattern:     { name: 'Pattern',        nameEs: 'Patrón',                  icon: Eye,        description: 'Detect patterns in time-series data',              color: 'text-purple-500' },
  risk_scoring:{ name: 'Risk Scoring',   nameEs: 'Puntuación de Riesgo',    icon: BarChart3,  description: 'Weighted 0-100 scoring (N35 V25 C20 O15 R5)',     color: 'text-amber-500' },
  consensus:   { name: 'Consensus',      nameEs: 'Consenso',                icon: Users,      description: 'Multi-agent voting (4/4→auto, 3/4→notify, 2/4→human)', color: 'text-emerald-500' },
  predictive:  { name: 'Predictive',     nameEs: 'Predictivo',              icon: TrendingUp, description: 'Trend detection and prediction',                  color: 'text-orange-500' },
  adaptive:    { name: 'Adaptive',       nameEs: 'Adaptativo',              icon: Zap,        description: 'Self-adjusting thresholds with feedback',          color: 'text-pink-500' },
};

// ─── Agent Status Registry ───────────────────────────────────────────
// CONSOLIDATES: StatusDot, StatusIndicator, statusColorMap from multiple views

export type AgentStatus = 'active' | 'inactive' | 'warning' | 'error';

export const AGENT_STATUS: Record<AgentStatus, {
  label: string; color: string; bg: string; icon: typeof CheckCircle;
}> = {
  active:   { label: 'Activo',      color: 'text-emerald-500', bg: 'bg-emerald-500', icon: CheckCircle },
  inactive: { label: 'Inactivo',    color: 'text-gray-400',    bg: 'bg-gray-400',    icon: XCircle },
  warning:  { label: 'Advertencia', color: 'text-amber-500',   bg: 'bg-amber-500',   icon: AlertTriangle },
  error:    { label: 'Error',       color: 'text-red-500',     bg: 'bg-red-500',     icon: XCircle },
};

// ─── Utility: Risk scoring formula ───────────────────────────────────
// CONSOLIDATES: duplicated in strategies.py, main_lite.py, index.ts, analysis-engine.ts

export const RISK_WEIGHTS = { nature: 0.35, volume: 0.25, connections: 0.20, osint: 0.15, recency: 0.05 } as const;

export const computeRiskScore = (components: {
  nature: number; volume: number; connections: number; osint: number; recency: number;
}): number => {
  return Math.round(
    components.nature * RISK_WEIGHTS.nature +
    components.volume * RISK_WEIGHTS.volume +
    components.connections * RISK_WEIGHTS.connections +
    components.osint * RISK_WEIGHTS.osint +
    components.recency * RISK_WEIGHTS.recency
  );
};

// ─── Consensus Rules ─────────────────────────────────────────────────
export const CONSENSUS_RULES = {
  unanimous:    { votes: 4, verdict: 'auto_execute',         labelEs: 'Auto-ejecutar' },
  super:        { votes: 3, verdict: 'auto_execute_notify',  labelEs: 'Auto-ejecutar + Notificar' },
  majority:     { votes: 2, verdict: 'human_review',          labelEs: 'Revisión Humana' },
  minority:     { votes: 1, verdict: 'likely_false_positive', labelEs: 'Posible Falso Positivo' },
  none:         { votes: 0, verdict: 'normal_operations',     labelEs: 'Operación Normal' },
} as const;
