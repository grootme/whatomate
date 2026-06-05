'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { SEVERITY, type SeverityLevel, type AgentStatus, DNA_LAYERS, type DNALayerId, scoreToRiskLevel } from '@/lib/registries';
import { AnimatedCounter, StatusDot, DataFlowArrow, HealthBar } from '@/components/whatomate/shared';
import { motion, AnimatePresence } from 'framer-motion';
import { useWhatomateStore } from '@/lib/store';
import { useIntelligenceData } from '@/hooks/use-intelligence-data';
import {
  Download,
  Brain,
  Shield,
  FileOutput,
  ArrowDown,
  Activity,
  Radio,
  Server,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Database,
  Cpu,
  Globe,
  Users,
  MessageSquare,
  Zap,
} from 'lucide-react';
// Layer icons + DNA_LAYERS registry companion data
const layerIcons: Record<string, React.ElementType> = {
  Download,
  Brain,
  Shield,
  FileOutput,
};
const layerColorHex: Record<number, string> = { 1: '#3B82F6', 2: '#A855F7', 3: '#F59E0B', 4: '#10B981' };

// ===== SHARED COMPONENTS (imported from shared/) =====

export function MultiagentView() {
  const { agentLayers, eventBus, ecosystem, threatLevel } = useWhatomateStore();
  useIntelligenceData();

  // Compute ecosystem stats from real store data (populated by /api/agents)
  const stats = {
    monitoredGroups: ecosystem.totalGroups,
    telegramMembers: ecosystem.telegramMembers,
    whatsappGroups: ecosystem.whatsappGroups,
    osintSources: ecosystem.osintSources,
    intelligenceTools: agentLayers.reduce((sum, l) => sum + l.agents.length, 0),
    threatLevel: (() => { const r = scoreToRiskLevel(threatLevel); return r === 'critical' ? 'CRÍTICO' : r === 'high' ? 'ALTO' : r === 'moderate' ? 'MEDIO' : 'BAJO'; })(),
  };

  const totalAgents = agentLayers.reduce((sum, l) => sum + l.agents.length, 0);
  const activeAgents = agentLayers.reduce((sum, l) => sum + l.agents.filter((a) => a.status === 'active').length, 0);
  const totalProcessed = agentLayers.reduce((sum, l) => sum + l.agents.reduce((s, a) => s + a.messagesProcessed, 0), 0);
  const activeAgentsList = agentLayers.flatMap((l) => l.agents).filter((a) => a.status !== 'inactive');
  const avgHealth = activeAgentsList.length > 0 ? Math.round(activeAgentsList.reduce((sum, a) => sum + a.health, 0) / activeAgentsList.length) : 0;

  return (
    <div className="space-y-6">
      {/* Ecosystem Stats Header */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Grupos/Canales', value: stats.monitoredGroups, icon: Users, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Miembros Telegram', value: stats.telegramMembers, icon: MessageSquare, color: 'text-teal-600 bg-teal-50 dark:bg-teal-950/30' },
          { label: 'Grupos WhatsApp', value: stats.whatsappGroups, icon: Radio, color: 'text-green-600 bg-green-50 dark:bg-green-950/30' },
          { label: 'Fuentes OSINT', value: stats.osintSources, icon: Globe, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Herramientas Intel.', value: stats.intelligenceTools, icon: Cpu, color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/30' },
          { label: 'Nivel Amenaza', value: stats.threatLevel, icon: AlertTriangle, color: 'text-red-600 bg-red-50 dark:bg-red-950/30', isThreat: true },
        ].map((stat) => (
          <Card key={stat.label} className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', stat.color)}>
                  <stat.icon className="w-4 h-4" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold">
                  {typeof stat.value === 'number' ? <AnimatedCounter value={stat.value} /> : stat.value}
                </span>
                {stat.isThreat && (
                  <motion.div
                    className="w-3 h-3 bg-red-500 rounded-full"
                    animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Agent Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl flex items-center justify-center">
              <Server className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Agentes Totales</p>
              <p className="text-2xl font-bold"><AnimatedCounter value={totalAgents} /></p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-green-50 dark:bg-green-950/30 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Agentes Activos</p>
              <p className="text-2xl font-bold"><AnimatedCounter value={activeAgents} /></p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-teal-50 dark:bg-teal-950/30 rounded-xl flex items-center justify-center">
              <Activity className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Salud Promedio</p>
              <p className="text-2xl font-bold">{avgHealth}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-50 dark:bg-orange-950/30 rounded-xl flex items-center justify-center">
              <Database className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Mensajes Procesados</p>
              <p className="text-2xl font-bold"><AnimatedCounter value={totalProcessed} /></p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent Layers Pipeline */}
      <div className="space-y-0">
        <h3 className="text-lg font-semibold mb-4">Arquitectura de 4 Capas - Pipeline de Procesamiento</h3>
        {agentLayers.map((layer, layerIdx) => {
          const LayerIcon = layerIcons[layer.icon] || Server;
          return (
            <React.Fragment key={layer.id}>
              <Card className="border-0 shadow-sm overflow-hidden">
                <CardHeader className="pb-3" style={{ borderBottom: `3px solid ${layer.color}` }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                        style={{ backgroundColor: layer.color }}
                      >
                        <LayerIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          Capa {layer.id}: {layer.name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">{layer.description}</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-xs font-semibold"
                      style={{ borderColor: layer.color, color: layer.color }}
                    >
                      {layer.agents.filter((a) => a.status === 'active').length}/{layer.agents.length} activos
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {layer.agents.map((agent) => (
                      <motion.div
                        key={agent.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        whileHover={{ scale: 1.02 }}
                        className="relative"
                      >
                        <div className={cn(
                          'p-3 rounded-xl border transition-all',
                          agent.status === 'active' ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20' :
                          agent.status === 'warning' ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20' :
                          agent.status === 'inactive' ? 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20' :
                          'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20'
                        )}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <StatusDot status={agent.status as AgentStatus} />
                              <span className="text-sm font-semibold">{agent.name}</span>
                            </div>
                            {agent.status === 'active' ? (
                              <Wifi className="w-4 h-4 text-emerald-500" />
                            ) : agent.status === 'warning' ? (
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                            ) : (
                              <WifiOff className="w-4 h-4 text-gray-400" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{agent.description}</p>
                          <HealthBar value={agent.health} />
                          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                            <span>Salud: {agent.health}%</span>
                            <span>Uptime: {agent.uptime}</span>
                          </div>
                          <div className="flex items-center justify-between mt-1 text-xs">
                            <span className="text-muted-foreground">Procesados:</span>
                            <span className="font-semibold" style={{ color: layer.color }}>
                              {agent.messagesProcessed.toLocaleString()}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Último latido: {agent.lastHeartbeat}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              {layerIdx < agentLayers.length - 1 && (
                <div className="flex justify-center py-2">
                  <DataFlowArrow direction="down" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Event Bus Section */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 dark:bg-red-950/30 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <CardTitle className="text-base">Event Bus - Redis Streams</CardTitle>
                <p className="text-xs text-muted-foreground">Flujo de datos en tiempo real entre agentes</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs border-red-300 text-red-600">
              <motion.div
                className="w-2 h-2 bg-red-500 rounded-full mr-1.5"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
              />
              EN VIVO
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-2">
            <AnimatePresence>
              {eventBus.slice(0, 15).map((event, idx) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3, delay: idx * 0.05 }}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors text-sm"
                >
                  <span className="text-xs font-mono text-muted-foreground w-16 shrink-0">{event.timestamp}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0 border-emerald-300 text-emerald-700 dark:text-emerald-400">
                    {event.type}
                  </Badge>
                  <div className="flex items-center gap-1 text-xs min-w-0">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400 truncate">{event.source}</span>
                    <ArrowDown className="w-3 h-3 text-muted-foreground rotate-[-90deg] shrink-0" />
                    <span className="font-semibold text-orange-700 dark:text-orange-400 truncate">{event.target}</span>
                  </div>
                  <span className="text-xs text-muted-foreground truncate ml-auto">{event.data}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <Separator className="my-3" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Mostrando últimos 15 eventos</span>
            <span>Total eventos: {eventBus.length}</span>
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Visualization */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Visualización del Pipeline de Datos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
            {agentLayers.map((layer, idx) => {
              const LayerIcon = layerIcons[layer.icon] || Server;
              return (
                <React.Fragment key={layer.id}>
                  <motion.div
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 w-full lg:w-auto lg:min-w-[180px]"
                    style={{ borderColor: layer.color + '60', backgroundColor: layer.color + '10' }}
                    whileHover={{ scale: 1.05, borderColor: layer.color }}
                    transition={{ duration: 0.2 }}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white"
                      style={{ backgroundColor: layer.color }}
                    >
                      <LayerIcon className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-bold">{layer.name}</span>
                    <span className="text-xs text-muted-foreground text-center">{layer.agents.length} agentes</span>
                    <div className="flex gap-1">
                      {layer.agents.map((agent) => (
                        <StatusDot key={agent.id} status={agent.status as AgentStatus} />
                      ))}
                    </div>
                    <div className="w-full mt-1">
                      <HealthBar
                        value={Math.round(layer.agents.reduce((s, a) => s + a.health, 0) / layer.agents.length)}
                      />
                    </div>
                  </motion.div>
                  {idx < agentLayers.length - 1 && (
                    <div className="hidden lg:flex flex-col items-center">
                      <motion.div
                        animate={{ x: [0, 5, 0] }}
                        transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                      >
                        <ArrowDown className="w-6 h-6 rotate-[-90deg]" style={{ color: layer.color }} />
                      </motion.div>
                    </div>
                  )}
                  {idx < agentLayers.length - 1 && (
                    <div className="lg:hidden flex justify-center">
                      <motion.div
                        animate={{ y: [0, 5, 0] }}
                        transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                      >
                        <ArrowDown className="w-6 h-6" style={{ color: layer.color }} />
                      </motion.div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
