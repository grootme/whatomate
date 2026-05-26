import { create } from 'zustand';
import {
  Agent,
  Alert,
  ThresholdConfig,
  RiskDimension,
  EventBusEvent,
  Report,
  type AgentStatus,
  type AlertSeverity,
} from '@/lib/mock-data';
import {
  mockAgentLayers,
  mockAlerts,
  mockThresholds,
  mockRiskDimensions,
  mockEventBusEvents,
  mockReports,
  mockAdaptiveHistory,
  mockConsensusVotes,
  mockPatterns,
} from '@/lib/mock-data';

interface WhatomateStore {
  // Agents
  agentLayers: typeof mockAgentLayers;
  updateAgentStatus: (agentId: string, status: AgentStatus) => void;
  updateAgentHealth: (agentId: string, health: number) => void;

  // Alerts
  alerts: Alert[];
  addAlert: (alert: Alert) => void;
  acknowledgeAlert: (alertId: string) => void;
  dismissAlert: (alertId: string) => void;
  escalateAlert: (alertId: string) => void;

  // Event Bus
  eventBus: EventBusEvent[];
  addEvent: (event: EventBusEvent) => void;

  // Strategies
  thresholds: ThresholdConfig[];
  updateThreshold: (id: string, value: number) => void;
  patterns: typeof mockPatterns;
  riskDimensions: RiskDimension[];
  updateRiskDimension: (id: string, weight: number) => void;
  consensusVotes: typeof mockConsensusVotes;
  updateVote: (agentId: string, vote: 'favor' | 'contra' | 'abstencion') => void;
  adaptiveHistory: typeof mockAdaptiveHistory;
  learningRate: number;
  setLearningRate: (rate: number) => void;

  // Reports
  reports: Report[];
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
  // Agents
  agentLayers: mockAgentLayers,
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

  // Alerts
  alerts: mockAlerts,
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
          ? { ...a, severity: 'CRÍTICA' as AlertSeverity, actionTaken: 'ESCALADO - ' + a.actionTaken }
          : a
      ),
    })),

  // Event Bus
  eventBus: mockEventBusEvents,
  addEvent: (event) =>
    set((state) => ({
      eventBus: [event, ...state.eventBus].slice(0, 20),
    })),

  // Strategies
  thresholds: mockThresholds,
  updateThreshold: (id, value) =>
    set((state) => ({
      thresholds: state.thresholds.map((t) =>
        t.id === id ? { ...t, value } : t
      ),
    })),
  patterns: mockPatterns,
  riskDimensions: mockRiskDimensions,
  updateRiskDimension: (id, weight) =>
    set((state) => ({
      riskDimensions: state.riskDimensions.map((d) =>
        d.id === id ? { ...d, weight } : d
      ),
    })),
  consensusVotes: mockConsensusVotes,
  updateVote: (agentId, vote) =>
    set((state) => ({
      consensusVotes: state.consensusVotes.map((v) =>
        v.agentId === agentId ? { ...v, vote } : v
      ),
    })),
  adaptiveHistory: mockAdaptiveHistory,
  learningRate: 0.15,
  setLearningRate: (rate) => set({ learningRate: rate }),

  // Reports
  reports: mockReports,
  addReport: (report) =>
    set((state) => ({ reports: [report, ...state.reports] })),
  generatingReport: false,
  setGeneratingReport: (val) => set({ generatingReport: val }),

  // Monitoring
  threatLevel: 78,
  setThreatLevel: (level) => set({ threatLevel: level }),
  totalMessagesProcessed: 2345678,
  incrementMessages: (count) =>
    set((state) => ({
      totalMessagesProcessed: state.totalMessagesProcessed + count,
    })),
}));
