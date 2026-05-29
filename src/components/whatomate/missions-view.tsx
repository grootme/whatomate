'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign,
  Shield,
  Cpu,
  AlertTriangle,
  ArrowDown,
  Activity,
  Wifi,
  WifiOff,
  Radio,
  Zap,
  TrendingUp,
  Eye,
  Link2,
  ChevronDown,
  ChevronUp,
  Globe,
  Server,
} from 'lucide-react';

// ===== TYPES (mirror from missions.ts) =====

type MissionId = 'economic' | 'geopolitical' | 'tech' | 'risk';

interface MissionAgent {
  id: string;
  name: string;
  missionId: MissionId;
  layer: number;
  layerName: string;
  description: string;
  capabilities: string[];
  status: 'active' | 'inactive' | 'warning' | 'error';
  health: number;
  messagesProcessed: number;
  lastHeartbeat: string;
  uptime: string;
  keywords: string[];
  sources: string[];
}

interface MissionThreshold {
  id: string;
  missionId: MissionId;
  name: string;
  metric: string;
  condition: string;
  value: number;
  unit: string;
  alertSeverity: string;
  currentValue: number;
  enabled: boolean;
}

interface MissionAlert {
  id: string;
  missionId: MissionId;
  title: string;
  description: string;
  severity: string;
  strategy: string;
  timestamp: string;
  acknowledged: boolean;
}

interface MissionStats {
  totalAgents: number;
  activeAgents: number;
  messagesProcessed: number;
  activeAlerts: number;
  healthAvg: number;
  threatScore: number;
}

interface MissionDataFlowNode {
  layer: number;
  layerName: string;
  agentCount: number;
  messagesIn: number;
  messagesOut: number;
  alertsGenerated: number;
  status: 'active' | 'inactive' | 'degraded';
}

interface MissionGroup {
  id: MissionId;
  name: string;
  description: string;
  icon: string;
  color: string;
  gradient: string;
  agents: MissionAgent[];
  thresholds: MissionThreshold[];
  alerts: MissionAlert[];
  stats: MissionStats;
  domains: string[];
  dataFlow: MissionDataFlowNode[];
}

interface CrossMissionCorrelation {
  id: string;
  missionIds: [MissionId, MissionId];
  entityType: string;
  entityName: string;
  confidence: number;
  description: string;
  timestamp: string;
}

// ===== HELPERS =====

const missionIcons: Record<string, React.ElementType> = {
  DollarSign,
  Shield,
  Cpu,
  AlertTriangle,
};

const layerColors: Record<number, string> = {
  1: '#10B981',
  2: '#F59E0B',
  3: '#EF4444',
  4: '#8B5CF6',
};

const layerLabels: Record<number, string> = {
  1: 'Ingesta',
  2: 'Análisis',
  3: 'Monitoreo',
  4: 'Reportes',
};

function severityColor(severity: string): string {
  switch (severity) {
    case 'CRÍTICA': return 'bg-red-500 text-white';
    case 'ALTA': return 'bg-orange-500 text-white';
    case 'MEDIA': return 'bg-amber-500 text-white';
    case 'BAJA': return 'bg-blue-500 text-white';
    default: return 'bg-gray-400 text-white';
  }
}

function threatScoreColor(score: number): string {
  if (score >= 75) return 'text-red-600';
  if (score >= 50) return 'text-orange-600';
  if (score >= 25) return 'text-amber-600';
  return 'text-emerald-600';
}

// ===== ANIMATED COMPONENTS =====

function AnimatedCounter({ value, duration = 800 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = display;
    const diff = value - start;
    const steps = 20;
    const stepTime = duration / steps;
    let current = 0;
    const timer = setInterval(() => {
      current++;
      setDisplay(Math.round(start + (diff * current) / steps));
      if (current >= steps) clearInterval(timer);
    }, stepTime);
    return () => clearInterval(timer);
  }, [value]);
  return <>{display.toLocaleString()}</>;
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-500',
    inactive: 'bg-gray-400',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
  };
  return (
    <motion.div
      className={cn('w-2 h-2 rounded-full', colors[status] || 'bg-gray-400')}
      animate={status === 'active' ? { scale: [1, 1.3, 1], opacity: [1, 0.7, 1] } : {}}
      transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
    />
  );
}

function DataFlowArrow({ color }: { color: string }) {
  return (
    <div className="flex flex-col items-center py-1">
      {[0, 1].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 4 }}
          transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.4, ease: 'easeInOut' }}
        >
          <ArrowDown className="w-3 h-3" style={{ color }} />
        </motion.div>
      ))}
    </div>
  );
}

// ===== MISSION CARD =====

function MissionCard({ mission, isExpanded, onToggle }: {
  mission: MissionGroup;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const MissionIcon = missionIcons[mission.icon] || Server;
  const triggeredThresholds = mission.thresholds.filter(t => t.enabled && t.currentValue >= t.value);

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      {/* Mission Header */}
      <div
        className="p-4 cursor-pointer hover:opacity-90 transition-opacity"
        style={{ background: `linear-gradient(135deg, ${mission.color}15, ${mission.color}05)` }}
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg"
              style={{ backgroundColor: mission.color }}
            >
              <MissionIcon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold truncate">{mission.name}</h3>
              <p className="text-xs text-muted-foreground line-clamp-1">{mission.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Threat Score */}
            <div className="text-center">
              <div className={cn('text-lg font-bold', threatScoreColor(mission.stats.threatScore))}>
                {mission.stats.threatScore}
              </div>
              <div className="text-[10px] text-muted-foreground">AMENAZA</div>
            </div>

            {/* Active Agents */}
            <div className="text-center">
              <div className="text-lg font-bold text-emerald-600">
                {mission.stats.activeAgents}/{mission.stats.totalAgents}
              </div>
              <div className="text-[10px] text-muted-foreground">AGENTES</div>
            </div>

            {/* Active Alerts */}
            {mission.stats.activeAlerts > 0 && (
              <Badge className={cn('text-xs', severityColor('CRÍTICA'))}>
                {mission.stats.activeAlerts} ALERTAS
              </Badge>
            )}

            {/* Expand Toggle */}
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Mini Stats Row */}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Salud: <span className="font-semibold">{mission.stats.healthAvg}%</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Procesados: <span className="font-semibold">{mission.stats.messagesProcessed.toLocaleString()}</span></span>
          </div>
          <div className="flex-1" />
          {/* Domain Tags */}
          <div className="hidden md:flex items-center gap-1 flex-wrap">
            {mission.domains.slice(0, 4).map(d => (
              <Badge key={d} variant="outline" className="text-[9px] py-0 px-1.5" style={{ borderColor: mission.color + '40', color: mission.color }}>
                {d}
              </Badge>
            ))}
            {mission.domains.length > 4 && (
              <span className="text-[9px] text-muted-foreground">+{mission.domains.length - 4}</span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <CardContent className="pt-4 space-y-4">
              {/* DNA Layer Data Flow */}
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4" style={{ color: mission.color }} />
                  Flujo de Datos — Capas DNA
                </h4>
                <div className="space-y-0">
                  {mission.dataFlow.map((node, idx) => (
                    <React.Fragment key={node.layer}>
                      <div
                        className="flex items-center gap-3 p-2.5 rounded-lg"
                        style={{ backgroundColor: layerColors[node.layer] + '08' }}
                      >
                        {/* Layer Badge */}
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ backgroundColor: layerColors[node.layer] }}
                        >
                          L{node.layer}
                        </div>

                        {/* Layer Name */}
                        <div className="min-w-0 flex-shrink-0">
                          <div className="text-sm font-semibold">{node.layerName}</div>
                          <div className="text-[10px] text-muted-foreground">{node.agentCount} agentes</div>
                        </div>

                        {/* Flow Metrics */}
                        <div className="flex-1 flex items-center gap-3 justify-end">
                          <div className="text-center">
                            <div className="text-xs font-semibold">{node.messagesIn.toLocaleString()}</div>
                            <div className="text-[9px] text-muted-foreground">IN</div>
                          </div>
                          <ArrowDown className="w-3 h-3 rotate-[-90deg] text-muted-foreground" />
                          <div className="text-center">
                            <div className="text-xs font-semibold">{node.messagesOut.toLocaleString()}</div>
                            <div className="text-[9px] text-muted-foreground">OUT</div>
                          </div>
                          {node.alertsGenerated > 0 && (
                            <>
                              <ArrowDown className="w-3 h-3 rotate-[-90deg] text-red-400" />
                              <div className="text-center">
                                <div className="text-xs font-semibold text-red-600">{node.alertsGenerated}</div>
                                <div className="text-[9px] text-red-400">ALERTAS</div>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Status */}
                        <StatusDot status={node.status} />
                      </div>
                      {idx < mission.dataFlow.length - 1 && (
                        <div className="flex justify-center py-0.5">
                          <DataFlowArrow color={layerColors[node.layer]} />
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Agents Grid */}
              <div>
                <h4 className="text-sm font-semibold mb-3">Agentes de la Misión</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {mission.agents.map(agent => (
                    <motion.div
                      key={agent.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className={cn(
                        'p-2.5 rounded-lg border text-xs',
                        agent.status === 'active'
                          ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20'
                          : agent.status === 'warning'
                          ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20'
                          : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20'
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <StatusDot status={agent.status} />
                        <span className="font-semibold text-[11px] truncate">{agent.name}</span>
                        <Badge
                          variant="outline"
                          className="text-[8px] py-0 px-1 ml-auto shrink-0"
                          style={{ borderColor: layerColors[agent.layer] + '60', color: layerColors[agent.layer] }}
                        >
                          L{agent.layer}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground line-clamp-1">{agent.description}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[9px] text-muted-foreground">Salud: {agent.health}%</span>
                        <div className="flex-1 h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              agent.health >= 80 ? 'bg-emerald-500' : agent.health >= 50 ? 'bg-amber-500' : 'bg-red-500'
                            )}
                            style={{ width: `${agent.health}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-muted-foreground">{agent.messagesProcessed}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Thresholds */}
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" style={{ color: mission.color }} />
                  Umbrales de la Misión
                </h4>
                <div className="space-y-2">
                  {mission.thresholds.map(threshold => {
                    const isTriggered = threshold.enabled && threshold.currentValue >= threshold.value;
                    const pct = threshold.value > 0 ? Math.min(100, (threshold.currentValue / threshold.value) * 100) : 0;
                    return (
                      <div
                        key={threshold.id}
                        className={cn(
                          'flex items-center gap-3 p-2 rounded-lg border',
                          isTriggered
                            ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20'
                            : 'border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-900/20'
                        )}
                      >
                        <div className={cn('w-2 h-2 rounded-full', isTriggered ? 'bg-red-500 animate-pulse' : 'bg-gray-300')} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{threshold.name}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all',
                                  pct >= 100 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {threshold.currentValue}/{threshold.value} {threshold.unit}
                            </span>
                          </div>
                        </div>
                        {isTriggered && (
                          <Badge className={cn('text-[9px] py-0 px-1.5', severityColor(threshold.alertSeverity))}>
                            {threshold.alertSeverity}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Active Alerts */}
              {mission.alerts.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      Alertas Activas ({mission.alerts.length})
                    </h4>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {mission.alerts.slice(-5).reverse().map(alert => (
                        <div
                          key={alert.id}
                          className="flex items-center gap-2 p-2 rounded-lg bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900"
                        >
                          <Badge className={cn('text-[8px] py-0 px-1', severityColor(alert.severity))}>
                            {alert.severity}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{alert.title}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{alert.description}</div>
                          </div>
                          <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                            {new Date(alert.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// ===== CROSS-MISSION CORRELATIONS =====

function CrossMissionCorrelations({ correlations, missions }: {
  correlations: CrossMissionCorrelation[];
  missions: MissionGroup[];
}) {
  if (correlations.length === 0) return null;

  const missionMap = new Map(missions.map(m => [m.id, m]));

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-50 dark:bg-violet-950/30 rounded-lg flex items-center justify-center">
            <Link2 className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <CardTitle className="text-base">Correlaciones Inter-Misión</CardTitle>
            <p className="text-xs text-muted-foreground">Eventos detectados en múltiples dominios simultáneamente</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {correlations.map(corr => {
            const [m1, m2] = corr.missionIds;
            const mission1 = missionMap.get(m1);
            const mission2 = missionMap.get(m2);
            return (
              <motion.div
                key={corr.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/40"
              >
                {/* Mission 1 Badge */}
                <Badge
                  variant="outline"
                  className="text-[10px] shrink-0"
                  style={{ borderColor: mission1?.color, color: mission1?.color }}
                >
                  {mission1?.name.split(',')[0] || m1}
                </Badge>

                <Link2 className="w-4 h-4 text-violet-500 shrink-0" />

                {/* Mission 2 Badge */}
                <Badge
                  variant="outline"
                  className="text-[10px] shrink-0"
                  style={{ borderColor: mission2?.color, color: mission2?.color }}
                >
                  {mission2?.name.split(',')[0] || m2}
                </Badge>

                {/* Correlation Details */}
                <div className="flex-1 min-w-0 ml-2">
                  <div className="text-xs font-semibold truncate">{corr.entityName}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{corr.description}</div>
                </div>

                {/* Confidence */}
                <div className="text-center shrink-0">
                  <div className={cn('text-sm font-bold', corr.confidence >= 70 ? 'text-red-600' : corr.confidence >= 50 ? 'text-amber-600' : 'text-blue-600')}>
                    {corr.confidence}%
                  </div>
                  <div className="text-[9px] text-muted-foreground">CONF</div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ===== MAIN VIEW =====

export function MissionsView() {
  const [missions, setMissions] = useState<MissionGroup[]>([]);
  const [correlations, setCorrelations] = useState<CrossMissionCorrelation[]>([]);
  const [expandedMission, setExpandedMission] = useState<MissionId | null>('economic');
  const [services, setServices] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const fetchMissions = useCallback(async () => {
    try {
      const res = await fetch('/api/missions');
      if (res.ok) {
        const data = await res.json();
        setMissions(data.missions ?? []);
        setCorrelations(data.correlations ?? []);
        setServices(data.services ?? {});
      }
    } catch {
      /* service unavailable */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMissions();
  }, [fetchMissions]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchMissions, 30000);
    return () => clearInterval(interval);
  }, [fetchMissions]);

  const toggleMission = (id: MissionId) => {
    setExpandedMission(prev => prev === id ? null : id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  // Compute aggregate stats
  const totalAgents = missions.reduce((s, m) => s + m.stats.totalAgents, 0);
  const activeAgents = missions.reduce((s, m) => s + m.stats.activeAgents, 0);
  const totalMessages = missions.reduce((s, m) => s + m.stats.messagesProcessed, 0);
  const totalAlerts = missions.reduce((s, m) => s + m.stats.activeAlerts, 0);
  const avgThreat = missions.length > 0 ? Math.round(missions.reduce((s, m) => s + m.stats.threatScore, 0) / missions.length) : 0;

  return (
    <div className="space-y-6">
      {/* Overview Header */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Misiones Activas', value: missions.filter(m => m.stats.activeAgents > 0).length, icon: Globe, color: 'text-violet-600 bg-violet-50 dark:bg-violet-950/30' },
          { label: 'Agentes Totales', value: totalAgents, icon: Server, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Agentes Activos', value: activeAgents, icon: Wifi, color: 'text-green-600 bg-green-50 dark:bg-green-950/30' },
          { label: 'Mensajes Procesados', value: totalMessages, icon: Radio, color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/30' },
          { label: 'Alertas Activas', value: totalAlerts, icon: AlertTriangle, color: 'text-red-600 bg-red-50 dark:bg-red-950/30' },
        ].map((stat) => (
          <Card key={stat.label} className="border-0 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', stat.color)}>
                  <stat.icon className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">{stat.label}</span>
              </div>
              <div className="text-lg font-bold">
                {typeof stat.value === 'number' ? <AnimatedCounter value={stat.value} /> : stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Global Threat Score */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-red-50 dark:bg-red-950/30">
                <Eye className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <div className="text-sm font-semibold">Amenaza Global — Todas las Misiones</div>
                <div className="text-xs text-muted-foreground">Puntuación agregada de las 4 misiones especializadas</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className={cn('text-3xl font-bold', threatScoreColor(avgThreat))}>
                {avgThreat}
              </div>
              <div className="text-xs text-muted-foreground">/100</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {missions.map(m => {
              const MissionIcon = missionIcons[m.icon] || Server;
              return (
                <div key={m.id} className="flex items-center gap-2">
                  <MissionIcon className="w-3.5 h-3.5" style={{ color: m.color }} />
                  <span className="text-[10px] text-muted-foreground truncate">{m.name.split(',')[0]}</span>
                  <span className={cn('text-xs font-bold ml-auto', threatScoreColor(m.stats.threatScore))}>
                    {m.stats.threatScore}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Service Status Bar */}
      <div className="flex items-center gap-4 px-1">
        {Object.entries(services).map(([service, online]) => (
          <div key={service} className="flex items-center gap-1.5">
            {online ? (
              <Wifi className="w-3 h-3 text-emerald-500" />
            ) : (
              <WifiOff className="w-3 h-3 text-gray-400" />
            )}
            <span className={cn('text-xs', online ? 'text-emerald-600' : 'text-gray-400')}>
              {service.charAt(0).toUpperCase() + service.slice(1)}
            </span>
          </div>
        ))}
      </div>

      {/* Mission Cards */}
      <div className="space-y-4">
        {missions.map(mission => (
          <MissionCard
            key={mission.id}
            mission={mission}
            isExpanded={expandedMission === mission.id}
            onToggle={() => toggleMission(mission.id)}
          />
        ))}
      </div>

      {/* Cross-Mission Correlations */}
      <CrossMissionCorrelations correlations={correlations} missions={missions} />
    </div>
  );
}
