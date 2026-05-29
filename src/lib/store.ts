import { create } from 'zustand';
import type {
  AgentStatus,
  AlertSeverity,
  Alert,
  ThresholdConfig,
  RiskDimension,
  EventBusEvent,
  Report,
  ConsensusVote,
  PatternDetection,
  AdaptiveMetric,
  Agent,
} from '@/lib/intelligence/types';
import type { MissionGroup, CrossMissionCorrelation } from '@/lib/intelligence/missions';

export interface AgentLayer {
  id: number;
  name: string;
  description: string;
  agents: Agent[];
  color: string;
  icon: string;
}

export interface EcosystemStats {
  whatsappGroups: number;
  telegramChannels: number;
  osintSources: number;
  totalGroups: number;
  telegramMembers: string;
}

// Signals computed from DB
export interface ActiveSignal {
  icon: string;
  label: string;
  value: string;
  trend: string;
  color: string;
}

export interface ConfidenceIndicator {
  label: string;
  value: number;
}

export interface PredictionChartData {
  hour: string;
  activity: number;
  confidence: number;
}

export interface TimelineEntry {
  date: string;
  event: string;
  type: string;
}

export interface CurrentAdaptiveMetrics {
  falsePositiveRate: number;
  accuracy: number;
  sensitivity: number;
  iterations: number;
}

export interface StrategySignals {
  activeSignals: ActiveSignal[];
  confidenceIndicators: ConfidenceIndicator[];
  predictionChartData: PredictionChartData[];
  timelineEntries: TimelineEntry[];
  currentMetrics: CurrentAdaptiveMetrics;
}

interface WhatomateStore {
  // Agents — hydrated from /api/agents
  agentLayers: AgentLayer[];
  setAgentLayers: (layers: AgentLayer[]) => void;
  updateAgentStatus: (agentId: string, status: AgentStatus) => void;
  updateAgentHealth: (agentId: string, health: number) => void;

  // Alerts — hydrated from /api/alerts
  alerts: Alert[];
  setAlerts: (alerts: Alert[]) => void;
  addAlert: (alert: Alert) => void;
  acknowledgeAlert: (alertId: string) => void;
  dismissAlert: (alertId: string) => void;
  escalateAlert: (alertId: string) => void;

  // Event Bus — hydrated from event store
  eventBus: EventBusEvent[];
  addEvent: (event: EventBusEvent) => void;
  setEventBus: (events: EventBusEvent[]) => void;

  // Strategies — hydrated from /api/strategies
  thresholds: ThresholdConfig[];
  setThresholds: (thresholds: ThresholdConfig[]) => void;
  updateThreshold: (id: string, value: number) => void;
  patterns: PatternDetection[];
  setPatterns: (patterns: PatternDetection[]) => void;
  riskDimensions: RiskDimension[];
  setRiskDimensions: (dims: RiskDimension[]) => void;
  updateRiskDimension: (id: string, weight: number) => void;
  consensusVotes: ConsensusVote[];
  setConsensusVotes: (votes: ConsensusVote[]) => void;
  updateVote: (agentId: string, vote: 'favor' | 'contra' | 'abstencion') => void;
  adaptiveHistory: AdaptiveMetric[];
  setAdaptiveHistory: (history: AdaptiveMetric[]) => void;
  learningRate: number;
  setLearningRate: (rate: number) => void;

  // Reports — hydrated from /api/reports
  reports: Report[];
  setReports: (reports: Report[]) => void;
  addReport: (report: Report) => void;
  generatingReport: boolean;
  setGeneratingReport: (val: boolean) => void;

  // Ecosystem stats — computed from /api/agents
  ecosystem: EcosystemStats;
  setEcosystem: (stats: EcosystemStats) => void;

  // Signals — hydrated from /api/strategies/signals
  signals: StrategySignals;
  setSignals: (signals: StrategySignals) => void;

  // Monitoring
  threatLevel: number;
  setThreatLevel: (level: number) => void;
  totalMessagesProcessed: number;
  incrementMessages: (count: number) => void;

  // Missions — specialized agent groups
  missions: MissionGroup[];
  setMissions: (missions: MissionGroup[]) => void;
  crossMissionCorrelations: CrossMissionCorrelation[];
  setCrossMissionCorrelations: (correlations: CrossMissionCorrelation[]) => void;
}

export const useWhatomateStore = create<WhatomateStore>((set) => ({
  // Agents — start empty, hydrate from API
  agentLayers: [],
  setAgentLayers: (layers) => set({ agentLayers: layers }),
  updateAgentStatus: (agentId, status) =>
    set((state) => ({
      agentLayers: state.agentLayers.map((layer) => ({
        ...layer,
        agents: layer.agents.map((agent) =>
          agent.id === agentId ? { ...agent, status } : agent
        ),
      })),
    })),
  updateAgentHealth: (agentId, health) =>
    set((state) => ({
      agentLayers: state.agentLayers.map((layer) => ({
        ...layer,
        agents: layer.agents.map((agent) =>
          agent.id === agentId ? { ...agent, health } : agent
        ),
      })),
    })),

  // Alerts — start empty, hydrate from API
  alerts: [],
  setAlerts: (alerts) => set({ alerts }),
  addAlert: (alert) =>
    set((state) => ({ alerts: [alert, ...state.alerts] })),
  acknowledgeAlert: (alertId) => {
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alertId ? { ...a, acknowledged: true } : a
      ),
    }));
    fetch(`/api/alerts?id=${alertId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acknowledged: true }) }).catch(() => {});
  },
  dismissAlert: (alertId) => {
    set((state) => ({
      alerts: state.alerts.filter((a) => a.id !== alertId),
    }));
    fetch(`/api/alerts?id=${alertId}`, { method: 'DELETE' }).catch(() => {});
  },
  escalateAlert: (alertId) => {
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alertId
          ? { ...a, severity: 'CRÍTICA' as AlertSeverity, escalated: true, actionTaken: 'ESCALADO - ' + (a.actionTaken || '') }
          : a
      ),
    }));
    fetch(`/api/alerts?id=${alertId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ escalated: true }) }).catch(() => {});
  },

  // Event Bus
  eventBus: [],
  addEvent: (event) =>
    set((state) => ({
      eventBus: [event, ...state.eventBus].slice(0, 50),
    })),
  setEventBus: (events) => set({ eventBus: events }),

  // Strategies — start empty, hydrate from API
  thresholds: [],
  setThresholds: (thresholds) => set({ thresholds }),
  updateThreshold: (id, value) => {
    set((state) => ({
      thresholds: state.thresholds.map((t) =>
        t.id === id ? { ...t, value } : t
      ),
    }));
    fetch('/api/strategies', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'threshold_update', thresholdId: id, value }) }).catch(() => {});
  },
  patterns: [],
  setPatterns: (patterns) => set({ patterns }),
  riskDimensions: [],
  setRiskDimensions: (dims) => set({ riskDimensions: dims }),
  updateRiskDimension: (id, weight) => {
    set((state) => ({
      riskDimensions: state.riskDimensions.map((d) =>
        d.id === id ? { ...d, weight } : d
      ),
    }));
    fetch('/api/strategies', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'risk_dimension_update', dimensionId: id, weight }) }).catch(() => {});
  },
  consensusVotes: [],
  setConsensusVotes: (votes) => set({ consensusVotes: votes }),
  updateVote: (agentId, vote) =>
    set((state) => ({
      consensusVotes: state.consensusVotes.map((v) =>
        v.agentId === agentId ? { ...v, vote } : v
      ),
    })),
  adaptiveHistory: [],
  setAdaptiveHistory: (history) => set({ adaptiveHistory: history }),
  learningRate: 0.15,
  setLearningRate: (rate) => set({ learningRate: rate }),

  // Reports — start empty, hydrate from API
  reports: [],
  setReports: (reports) => set({ reports }),
  addReport: (report) =>
    set((state) => ({ reports: [report, ...state.reports] })),
  generatingReport: false,
  setGeneratingReport: (val) => set({ generatingReport: val }),

  // Ecosystem stats
  ecosystem: { whatsappGroups: 0, telegramChannels: 0, osintSources: 0, totalGroups: 0, telegramMembers: '0' },
  setEcosystem: (stats) => set({ ecosystem: stats }),

  // Signals — start with empty defaults, hydrate from API
  signals: {
    activeSignals: [],
    confidenceIndicators: [],
    predictionChartData: [],
    timelineEntries: [],
    currentMetrics: { falsePositiveRate: 0, accuracy: 0, sensitivity: 0, iterations: 0 },
  },
  setSignals: (signals) => set({ signals }),

  // Monitoring
  threatLevel: 0,
  setThreatLevel: (level) => set({ threatLevel: level }),
  totalMessagesProcessed: 0,
  incrementMessages: (count) =>
    set((state) => ({
      totalMessagesProcessed: state.totalMessagesProcessed + count,
    })),

  // Missions
  missions: [],
  setMissions: (missions) => set({ missions }),
  crossMissionCorrelations: [],
  setCrossMissionCorrelations: (correlations) => set({ crossMissionCorrelations: correlations }),
}));
