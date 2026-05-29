'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useWhatomateStore } from '@/lib/store';
import type {
  AgentLayer,
  Alert,
  ThresholdConfig,
  PatternDetection,
  RiskDimension,
  ConsensusVote,
  AdaptiveMetric,
  Report,
  EventBusEvent,
  ReportTemplate,
} from '@/lib/intelligence/types';
import type { EcosystemStats, StrategySignals } from '@/lib/store';

/**
 * Hook to hydrate the intelligence store from real API routes.
 * Follows RICCO's Event-Driven Consistency ADN:
 * All data comes from real microservices and database.
 */
export function useIntelligenceData() {
  const store = useWhatomateStore();
  const initialized = useRef(false);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents');
      if (res.ok) {
        const data = await res.json();
        store.setAgentLayers((data.layers ?? []) as AgentLayer[]);
        // Store ecosystem stats from the agents API response
        if (data.ecosystem) {
          store.setEcosystem(data.ecosystem as EcosystemStats);
        }
      }
    } catch {
      /* service unavailable */
    }
  }, [store]);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts');
      if (res.ok) {
        const data = await res.json();
        const alerts: Alert[] = (Array.isArray(data) ? data : []).map(
          (a: Record<string, unknown>) => ({
            id: a.id as string,
            source: (a.source as string) || '',
            severity: a.severity as Alert['severity'],
            title: (a.title as string) || '',
            description: (a.description as string) || '',
            actionTaken: (a.actionTaken as string) || '',
            strategy: (a.strategy as Alert['strategy']) || 'threshold',
            thresholdId: a.thresholdId as string | undefined,
            patternId: a.patternId as string | undefined,
            riskId: a.riskId as string | undefined,
            acknowledged: (a.acknowledged as boolean) || false,
            escalated: (a.escalated as boolean) || false,
            timestamp: a.timestamp as string,
          })
        );
        store.setAlerts(alerts);
      }
    } catch {
      /* service unavailable */
    }
  }, [store]);

  const fetchStrategies = useCallback(async () => {
    try {
      const res = await fetch('/api/strategies');
      if (res.ok) {
        const data = await res.json();

        // Thresholds from DB match intelligence ThresholdConfig
        store.setThresholds((data.thresholds ?? []) as ThresholdConfig[]);

        // Patterns from DB match intelligence PatternDetection
        store.setPatterns((data.patterns ?? []) as PatternDetection[]);

        // Risk dimensions (may come from API or be hardcoded)
        store.setRiskDimensions((data.riskDimensions ?? []) as RiskDimension[]);

        // Consensus votes
        store.setConsensusVotes((data.consensusVotes ?? []) as ConsensusVote[]);

        // Adaptive history - transform dates to strings for chart compatibility
        const adaptiveHistory: AdaptiveMetric[] = (
          data.adaptiveHistory ?? []
        ).map((m: Record<string, unknown>) => ({
          id: m.id as string,
          date: typeof m.date === 'string' ? m.date : new Date(m.date as number | string).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' }),
          falsePositiveRate: m.falsePositiveRate as number,
          sensitivity: m.sensitivity as number,
          accuracy: m.accuracy as number,
          threshold: (m.threshold as string) || '',
        }));
        store.setAdaptiveHistory(adaptiveHistory);

        // Compute threat level from threshold current values
        if (data.thresholds?.length > 0) {
          const avgCurrent = data.thresholds.reduce(
            (s: number, t: ThresholdConfig) => s + (t.currentValue / t.value),
            0
          ) / data.thresholds.length;
          store.setThreatLevel(Math.round(avgCurrent * 100));
        }
      }
    } catch {
      /* service unavailable */
    }
  }, [store]);

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/reports');
      if (res.ok) {
        const data = await res.json();
        // Transform API reports to match store Report type
        const reports: Report[] = (data.reports ?? []).map(
          (r: Record<string, unknown>) => {
            // Parse sections from JSON string if needed
            let sections: string[] = [];
            if (Array.isArray(r.sections)) {
              sections = r.sections as string[];
            } else if (typeof r.sections === 'string') {
              try {
                sections = JSON.parse(r.sections as string);
              } catch {
                sections = [];
              }
            }

            return {
              id: r.id as string,
              title: (r.title as string) || '',
              type: r.type as Report['type'],
              status: r.status as Report['status'],
              pages: (r.pages as number) || 0,
              sections,
              dateFrom: r.dateFrom as string,
              dateTo: r.dateTo as string,
              alertCount: (r.alertCount as number) || 0,
              eventCount: (r.eventCount as number) || 0,
              entityCount: (r.entityCount as number) || 0,
              generatedAt: r.generatedAt as string | undefined,
              content: r.content as string | undefined,
              downloadUrl: r.downloadUrl as string | undefined,
            };
          }
        );
        store.setReports(reports);
      }
    } catch {
      /* service unavailable */
    }
  }, [store]);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/events');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          store.setEventBus(data as EventBusEvent[]);
        }
      }
    } catch {
      /* service unavailable */
    }
  }, [store]);

  const fetchOsint = useCallback(async () => {
    try {
      const res = await fetch('/api/osint');
      if (res.ok) {
        const data = await res.json();
        // Use OSINT data to compute threat level
        const threatMap: Record<string, number> = {
          CRITICAL: 95,
          HIGH: 80,
          ELEVATED: 65,
          GUARDED: 45,
          LOW: 20,
          UNKNOWN: 50,
        };
        const level = threatMap[data.threatLevel] ?? 50;
        store.setThreatLevel(level);
      }
    } catch {
      /* service unavailable */
    }
  }, [store]);

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch('/api/strategies/signals');
      if (res.ok) {
        const data: StrategySignals = await res.json();
        store.setSignals(data);
      }
    } catch {
      /* service unavailable */
    }
  }, [store]);

  const fetchMissions = useCallback(async () => {
    try {
      const res = await fetch('/api/missions');
      if (res.ok) {
        const data = await res.json();
        if (data.missions) {
          store.setMissions(data.missions);
        }
        if (data.correlations) {
          store.setCrossMissionCorrelations(data.correlations);
        }
      }
    } catch {
      /* service unavailable */
    }
  }, [store]);

  // Initial hydration
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    Promise.all([
      fetchAgents(),
      fetchAlerts(),
      fetchStrategies(),
      fetchReports(),
      fetchEvents(),
      fetchOsint(),
      fetchSignals(),
      fetchMissions(),
    ]);
  }, [fetchAgents, fetchAlerts, fetchStrategies, fetchReports, fetchEvents, fetchOsint, fetchSignals, fetchMissions]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAgents();
      fetchAlerts();
      fetchStrategies();
      fetchEvents();
      fetchOsint();
      fetchSignals();
      fetchMissions();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchAgents, fetchAlerts, fetchStrategies, fetchEvents, fetchOsint, fetchSignals, fetchMissions]);

  return {
    refresh: useCallback(() => {
      fetchAgents();
      fetchAlerts();
      fetchStrategies();
      fetchReports();
      fetchEvents();
      fetchOsint();
      fetchSignals();
      fetchMissions();
    }, [fetchAgents, fetchAlerts, fetchStrategies, fetchReports, fetchEvents, fetchOsint, fetchSignals, fetchMissions]),
  };
}

/**
 * Report templates - these are configuration, not dynamic data.
 * Kept locally since they define report structure, not runtime data.
 */
export const reportTemplates: ReportTemplate[] = [
  {
    id: 'tmpl1',
    name: 'Reporte Diario de Inteligencia',
    type: 'diario',
    description:
      'Resumen diario de alertas, métricas de agentes y eventos detectados en las últimas 24 horas',
    sections: [
      'Resumen ejecutivo',
      'Alertas activas',
      'Métricas de agentes',
      'Eventos destacados',
      'Recomendaciones',
    ],
    schedule: '0 8 * * *',
  },
  {
    id: 'tmpl2',
    name: 'Reporte Semanal de Análisis',
    type: 'semanal',
    description:
      'Análisis semanal de tendencias, patrones detectados y evolución del nivel de amenaza',
    sections: [
      'Tendencias semanales',
      'Patrones detectados',
      'Evolución amenazas',
      'Estadísticas de agentes',
      'Plan de acción',
    ],
    schedule: '0 9 * * 1',
  },
  {
    id: 'tmpl3',
    name: 'Reporte Mensual Estratégico',
    type: 'mensual',
    description:
      'Informe mensual estratégico con análisis profundo, métricas de rendimiento y planificación',
    sections: [
      'Análisis estratégico',
      'Métricas KPI',
      'Rendimiento del sistema',
      'Casos destacados',
      'Planificación mensual',
      'Evolución adaptativa',
    ],
    schedule: '0 10 1 * *',
  },
];

/**
 * Mapping from PatternType enum to human-readable Spanish names
 */
export const patternTypeLabels: Record<string, string> = {
  fraud_multichannel: 'Fraude multi-canal',
  money_laundering: 'Lavado de divisas',
  disinformation: 'Desinformación coordinada',
  crypto_manipulation: 'Manipulación cripto',
  irregular_migration: 'Migración irregular',
};

/**
 * Default sequence steps for each pattern type
 */
export const patternTypeSequences: Record<string, string[]> = {
  fraud_multichannel: [
    'Detección WhatsApp',
    'Correlación Telegram',
    'Verificación OSINT',
    'Confirmación multi-fuente',
  ],
  money_laundering: [
    'Transacción inusual',
    'Patrón fragmentación',
    'Conexión cripto',
    'Flujo offshore',
  ],
  disinformation: [
    'Narrativa emergente',
    'Coordinación temporal',
    'Amplificación bots',
    'Verificación factual',
  ],
  crypto_manipulation: [
    'Señal compra coordinada',
    'Volumen anómalo',
    'Venta masiva',
    'Caída precio',
  ],
  irregular_migration: [
    'Agrupamiento geográfico',
    'Patrones comunicación',
    'Rutas identificadas',
    'Cruce fronterizo',
  ],
};

/**
 * Format a date/timestamp for display in the monitoring view.
 * Accepts ISO strings, epoch numbers, or Date objects.
 */
export function formatTimestamp(ts: string | number | Date | undefined): string {
  if (!ts) return '';
  try {
    const d = typeof ts === 'string' || typeof ts === 'number' ? new Date(ts) : ts;
    if (isNaN(d.getTime())) return String(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  } catch {
    return String(ts);
  }
}

/**
 * Format a date as a relative time string (e.g. "Hace 2h")
 */
export function formatRelativeTime(ts: string | number | Date | undefined): string {
  if (!ts) return '';
  try {
    const d = typeof ts === 'string' || typeof ts === 'number' ? new Date(ts) : ts;
    if (isNaN(d.getTime())) return String(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Hace ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `Hace ${diffDays}d`;
  } catch {
    return String(ts);
  }
}

/**
 * Format a date as a short date string (e.g. "2026-05-25")
 */
export function formatDateString(ts: string | number | Date | undefined): string {
  if (!ts) return '';
  try {
    const d = typeof ts === 'string' || typeof ts === 'number' ? new Date(ts) : ts;
    if (isNaN(d.getTime())) return String(ts);
    return d.toISOString().split('T')[0];
  } catch {
    return String(ts);
  }
}

/**
 * Map condition operator to display string
 */
export function conditionLabel(condition: string): string {
  const map: Record<string, string> = {
    gte: '≥',
    lte: '≤',
    gt: '>',
    lt: '<',
    eq: '=',
  };
  return map[condition] || condition;
}
