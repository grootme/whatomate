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

export interface AgentLayer {
  id: number;
  name: string;
  description: string;
  agents: Agent[];
  color: string;
  icon: string;
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

  // Monitoring
  threatLevel: number;
  setThreatLevel: (level: number) => void;
  totalMessagesProcessed: number;
  incrementMessages: (count: number) => void;
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
  acknowledgeAlert: (alertId) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alertId ? { ...a, acknowledged: true } : a
      ),
    })),
  dismissAlert: (alertId) =>
    set((state) => ({
      alerts: state.alerts.filter((a) => a.id !== alertId),
    })),
  escalateAlert: (alertId) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alertId
          ? { ...a, severity: 'CRÍTICA' as AlertSeverity, escalated: true, actionTaken: 'ESCALADO - ' + (a.actionTaken || '') }
          : a
      ),
    })),

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
  updateThreshold: (id, value) =>
    set((state) => ({
      thresholds: state.thresholds.map((t) =>
        t.id === id ? { ...t, value } : t
      ),
    })),
  patterns: [],
  setPatterns: (patterns) => set({ patterns }),
  riskDimensions: [],
  setRiskDimensions: (dims) => set({ riskDimensions: dims }),
  updateRiskDimension: (id, weight) =>
    set((state) => ({
      riskDimensions: state.riskDimensions.map((d) =>
        d.id === id ? { ...d, weight } : d
      ),
    })),
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

  // Monitoring
  threatLevel: 0,
  setThreatLevel: (level) => set({ threatLevel: level }),
  totalMessagesProcessed: 0,
  incrementMessages: (count) =>
    set((state) => ({
      totalMessagesProcessed: state.totalMessagesProcessed + count,
    })),
}));
