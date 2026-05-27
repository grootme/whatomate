// ===== CORE TYPES =====

// Event Sourcing
export interface IntelligenceEvent {
  id: string;
  eventType: IntelligenceEventType;
  aggregateId: string;
  aggregateType: AggregateType;
  stream: EventStream;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timestamp: Date;
  processed: boolean;
}

export type IntelligenceEventType =
  | 'ingestion.raw_message'
  | 'ingestion.batch_received'
  | 'analysis.semantic_completed'
  | 'analysis.pattern_detected'
  | 'analysis.risk_scored'
  | 'analysis.correlation_found'
  | 'monitoring.threshold_breached'
  | 'monitoring.anomaly_detected'
  | 'monitoring.alert_generated'
  | 'monitoring.alert_escalated'
  | 'monitoring.alert_acknowledged'
  | 'consensus.vote_cast'
  | 'consensus.decision_made'
  | 'prediction.forecast'
  | 'adaptive.threshold_adjusted'
  | 'adaptive.metric_recorded'
  | 'report.generation_started'
  | 'report.generation_completed'
  | 'agent.heartbeat'
  | 'agent.status_changed';

export type AggregateType = 'message' | 'entity' | 'alert' | 'report' | 'agent' | 'threshold' | 'pattern';

export type EventStream =
  | 'whatomate:whatsapp_messages'
  | 'whatomate:telegram_messages'
  | 'whatomate:osint_events'
  | 'whatomate:analyzed_messages'
  | 'whatomate:intel_events'
  | 'whatomate:threat_assessments'
  | 'whatomate:alerts'
  | 'whatomate:decisions'
  | 'whatomate:patterns'
  | 'whatomate:cognitive_updates'
  | 'whatomate:predictions'
  | 'whatomate:reports';

// Ingestion
export type MessageSource = 'whatsapp' | 'telegram' | 'osint';

export interface RawMessage {
  id: string;
  source: MessageSource;
  sourceId: string;
  channelName?: string;
  channelId?: string;
  senderName?: string;
  senderId?: string;
  content: string;
  contentHash?: string;
  timestamp: Date;
  processed: boolean;
  analyzedAt?: Date;
  metadata?: Record<string, unknown>;
}

// Analysis
export type EntityType = 'person' | 'organization' | 'location' | 'crypto_wallet' | 'event';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  aliases?: string[];
  riskScore: number;
  riskLevel: RiskLevel;
  platformIds?: Record<string, string[]>;
  firstSeen: Date;
  lastSeen: Date;
  mentionCount: number;
  metadata?: Record<string, unknown>;
}

export type RelationType = 'communicates_with' | 'member_of' | 'operates_in' | 'transfers_to' | 'mentions';

export interface EntityRelation {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relationType: RelationType;
  strength: number;
  evidence?: string[];
  firstSeen: Date;
  lastSeen: Date;
}

export type PatternType =
  | 'fraud_multichannel'
  | 'money_laundering'
  | 'disinformation'
  | 'crypto_manipulation'
  | 'irregular_migration';

export interface PatternDetection {
  id: string;
  patternType: PatternType;
  severity: AlertSeverity;
  confidence: number;
  description: string;
  evidenceIds?: string[];
  entityIds?: string[];
  detectionRate?: number;
  occurrences: number;
  status: 'active' | 'confirmed' | 'dismissed' | 'investigating';
  firstDetected: Date;
  lastDetected: Date;
}

export interface RiskAssessment {
  id: string;
  entityId?: string;
  patternId?: string;
  aggregateType: AggregateType;
  aggregateId: string;
  score: number;
  nature: number;
  volume: number;
  connections: number;
  osintContext: number;
  recency: number;
  reasoning?: string;
  strategy: DecisionStrategy;
  createdAt: Date;
}

// Monitoring
export type AlertSeverity = 'CRÍTICA' | 'ALTA' | 'MEDIA' | 'BAJA' | 'INFO';
export type DecisionStrategy = 'threshold' | 'pattern' | 'risk_scoring' | 'consensus' | 'predictive' | 'adaptive';

export interface ThresholdConfig {
  id: string;
  name: string;
  description: string;
  metric: string;
  condition: 'gte' | 'lte' | 'eq' | 'gt' | 'lt';
  value: number;
  unit: string;
  alertSeverity: AlertSeverity;
  alertType: string;
  enabled: boolean;
  currentValue: number;
  lastTriggered?: Date;
  metadata?: {
    adaptiveBounds?: { min: number; max: number };
    [key: string]: unknown;
  };
}

export interface Alert {
  id: string;
  source: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  actionTaken?: string;
  strategy: DecisionStrategy;
  thresholdId?: string;
  patternId?: string;
  riskId?: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  escalated: boolean;
  relatedEvents?: string[];
  timestamp: Date;
}

// Consensus
export type VoteType = 'favor' | 'contra' | 'abstencion';

export interface ConsensusVote {
  id: string;
  alertId: string;
  agentId: string;
  agentName: string;
  vote: VoteType;
  confidence: number;
  reasoning: string;
}

// Reports
export type ReportType = 'diario' | 'semanal' | 'mensual';
export type ReportStatus = 'programado' | 'generando' | 'completado' | 'error';

export interface Report {
  id: string;
  title: string;
  type: ReportType;
  status: ReportStatus;
  pages: number;
  sections: string[];
  dateFrom: Date;
  dateTo: Date;
  alertCount: number;
  eventCount: number;
  entityCount: number;
  generatedAt?: Date;
  content?: string;
  downloadUrl?: string;
}

// Agents
export type AgentStatus = 'active' | 'inactive' | 'warning' | 'error';

export interface AgentState {
  id: string;
  agentId: string;
  name: string;
  layer: number;
  layerName: string;
  status: AgentStatus;
  health: number;
  messagesProcessed: number;
  lastHeartbeat?: Date;
  startedAt?: Date;
  config?: Record<string, unknown>;
}

// Agent — UI-facing type for store & components
export interface Agent {
  id: string;
  name: string;
  layer: number;
  layerName: string;
  status: AgentStatus;
  health: number;
  messagesProcessed: number;
  lastHeartbeat: string;
  uptime: string;
  description: string;
}

// Event Bus — inter-agent communication event
export interface EventBusEvent {
  id: string;
  source: string;
  target: string;
  type: string;
  timestamp: string;
  data: string;
}

// Risk Dimension — weighted dimension for risk scoring
export interface RiskDimension {
  id: string;
  name: string;
  weight: number;
  description: string;
  color: string;
}

// Adaptive
export interface AdaptiveMetric {
  id: string;
  date: Date;
  falsePositiveRate: number;
  sensitivity: number;
  accuracy: number;
  threshold: string;
  adjustment?: Record<string, unknown>;
}

export interface Prediction {
  id: string;
  metric: string;
  period: 'hour' | 'day' | 'week';
  predictedAt: Date;
  targetTime: Date;
  value: number;
  confidence: number;
  actualValue?: number;
}

// ===== RICCO PATTERN TYPES =====

// Specification Pattern (Guarded Lifecycle - ADN 1)
export interface ComposableSpec<T> {
  id: string;
  label: string;
  isSatisfiedBy(ctx: T): boolean;
}

// State Machine (Guarded Lifecycle - ADN 1)
export interface TransitionRule<S extends string, E> {
  from: S;
  to: S;
  guard?: (entity: E) => boolean;
  onTransition?: (entity: E) => void;
}

// Registry (Registry-Driven - ADN 3)
export interface RegistryEntry<T> {
  id: string;
  instance: T;
  priority?: number;
}

// Strategy (Registry-Driven - ADN 3)
export interface DecisionStrategyHandler {
  id: DecisionStrategy;
  name: string;
  description: string;
  evaluate(ctx: StrategyContext): Promise<StrategyResult>;
}

export interface StrategyContext {
  messages: RawMessage[];
  entities: Entity[];
  patterns: PatternDetection[];
  thresholds: ThresholdConfig[];
  alerts: Alert[];
  osintData?: OsintSnapshot;
}

export interface StrategyResult {
  action: 'alert' | 'escalate' | 'dismiss' | 'monitor';
  severity?: AlertSeverity;
  confidence: number;
  reasoning: string;
  data?: Record<string, unknown>;
}

export interface OsintSnapshot {
  earthquakes?: Array<{ location: string; magnitude: number; depth: number; time: string; source: string }>;
  flights?: Array<{ callsign: string; type: string; altitude: number; heading: number; zone: string; time: string }>;
  weather?: { activeAlerts: number; extremeEvents: string[] };
  fires?: Array<{ location: string; confidence: number; lat: number; lon: number }>;
  ships?: Array<{ name: string; type: string; lat: number; lon: number; speed: number }>;
}

// ===== SERVICE ENDPOINTS =====
export const SERVICE_ENDPOINTS = {
  whatsapp: { host: 'localhost', port: 3001, basePath: '/api' },
  telegram: { host: 'localhost', port: 8700, basePath: '' },
  osint: { host: 'localhost', port: 8000, basePath: '' },
  cognitive: { host: 'localhost', port: 8645, basePath: '' },
  hermes: { host: 'localhost', port: 8642, basePath: '' },
  shadowbrokerAi: { host: 'localhost', port: 8660, basePath: '' },
  backend: { host: 'localhost', port: 8080, basePath: '/api' },
} as const;
