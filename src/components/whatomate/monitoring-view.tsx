'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useWhatomateStore } from '@/lib/store';
import { useIntelligenceData, formatTimestamp } from '@/hooks/use-intelligence-data';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Filter,
  Bell,
  Shield,
  Eye,
  ArrowUpCircle,
  Trash2,
  FileOutput,
  Clock,
  Zap,
  Radio,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const severityConfig: Record<string, { color: string; bg: string; border: string; icon: React.ElementType }> = {
  'CRÍTICA': { color: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-l-red-500', icon: Zap },
  'ALTA': { color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-l-orange-500', icon: AlertTriangle },
  'MEDIA': { color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-l-amber-500', icon: Shield },
  'BAJA': { color: 'text-teal-700 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/30', border: 'border-l-teal-500', icon: Activity },
  'INFO': { color: 'text-gray-700 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-900/30', border: 'border-l-gray-400', icon: Bell },
};

const severityBadgeColors: Record<string, string> = {
  'CRÍTICA': 'bg-red-500 text-white',
  'ALTA': 'bg-orange-500 text-white',
  'MEDIA': 'bg-amber-500 text-white',
  'BAJA': 'bg-teal-500 text-white',
  'INFO': 'bg-gray-400 text-white',
};

const alertTrendConfig = {
  count: { label: 'Alertas', color: '#EF4444' },
} satisfies ChartConfig;

const pieChartConfig = {
  CRÍTICA: { label: 'Crítica', color: '#EF4444' },
  ALTA: { label: 'Alta', color: '#F97316' },
  MEDIA: { label: 'Media', color: '#F59E0B' },
  BAJA: { label: 'Baja', color: '#14B8A6' },
  INFO: { label: 'Info', color: '#9CA3AF' },
} satisfies ChartConfig;

const PIE_COLORS = ['#EF4444', '#F97316', '#F59E0B', '#14B8A6', '#9CA3AF'];

export function MonitoringView() {
  const { alerts, addAlert, acknowledgeAlert, dismissAlert, escalateAlert, threatLevel } = useWhatomateStore();
  useIntelligenceData();
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  // Simulate real-time alerts
  useEffect(() => {
    const sources = ['WhatsApp Bridge', 'Telethon', 'OSINT Shadowbroker', 'Pattern Detector', 'Risk Scorer', 'Anomaly Detector', 'Threshold Monitor'];
    const severities: Array<'CRÍTICA' | 'ALTA' | 'MEDIA' | 'BAJA' | 'INFO'> = ['INFO', 'BAJA', 'MEDIA', 'MEDIA', 'ALTA', 'ALTA', 'CRÍTICA'];
    const titles = [
      'Nuevo mensaje sospechoso detectado',
      'Actividad inusual en canal monitoreado',
      'Umbral de menciones superado',
      'Actualización de fuente OSINT',
      'Correlación multi-plataforma identificada',
      'Anomalía estadística en volumen de mensajes',
      'Patrón de fraude potencial detectado',
    ];

    const interval = setInterval(() => {
      const now = new Date();
      const sev = severities[Math.floor(Math.random() * severities.length)];
      const src = sources[Math.floor(Math.random() * sources.length)];
      const title = titles[Math.floor(Math.random() * titles.length)];
      const alert = {
        id: `live-${Date.now()}`,
        timestamp: formatTimestamp(now),
        source: src,
        severity: sev,
        title,
        description: `Alerta generada automáticamente por el sistema de monitoreo. Fuente: ${src}. Se requiere revisión del evento detectado.`,
        actionTaken: 'Notificación automática enviada.',
        strategy: 'threshold' as const,
        acknowledged: false,
        escalated: false,
      };
      addAlert(alert);
    }, 8000);

    return () => clearInterval(interval);
  }, [addAlert]);

  const filteredAlerts = alerts.filter((a) => {
    if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
    if (sourceFilter !== 'all' && a.source !== sourceFilter) return false;
    return true;
  });

  const uniqueSources = [...new Set(alerts.map((a) => a.source))];

  const alertsBySeverity = [
    { name: 'CRÍTICA', value: alerts.filter((a) => a.severity === 'CRÍTICA').length },
    { name: 'ALTA', value: alerts.filter((a) => a.severity === 'ALTA').length },
    { name: 'MEDIA', value: alerts.filter((a) => a.severity === 'MEDIA').length },
    { name: 'BAJA', value: alerts.filter((a) => a.severity === 'BAJA').length },
    { name: 'INFO', value: alerts.filter((a) => a.severity === 'INFO').length },
  ];

  const alertTrendData = [
    { hour: '18:00', count: 8 },
    { hour: '19:00', count: 12 },
    { hour: '20:00', count: 6 },
    { hour: '21:00', count: 15 },
    { hour: '22:00', count: 10 },
    { hour: '23:00', count: alerts.length },
  ];

  const getThreatColor = (level: number) => {
    if (level >= 80) return '#EF4444';
    if (level >= 60) return '#F97316';
    if (level >= 40) return '#F59E0B';
    return '#10B981';
  };

  const getThreatLabel = (level: number) => {
    if (level >= 80) return 'CRÍTICO';
    if (level >= 60) return 'ALTO';
    if (level >= 40) return 'MEDIO';
    return 'BAJO';
  };

  const activeAlerts = alerts.filter((a) => !a.acknowledged).length;

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Bell className="w-4 h-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Alertas Activas</span>
            </div>
            <span className="text-2xl font-bold">{activeAlerts}</span>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <span className="text-xs text-muted-foreground">Críticas</span>
            </div>
            <span className="text-2xl font-bold text-red-600">
              {alerts.filter((a) => a.severity === 'CRÍTICA' && !a.acknowledged).length}
            </span>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Reconocidas</span>
            </div>
            <span className="text-2xl font-bold text-emerald-600">
              {alerts.filter((a) => a.acknowledged).length}
            </span>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
            <span className="text-2xl font-bold">{alerts.length}</span>
          </CardContent>
        </Card>
      </div>

      {/* Threat Level Gauge */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <h3 className="text-sm font-semibold mb-2">Nivel de Amenaza Global</h3>
                <div className="relative w-32 h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'level', value: threatLevel },
                          { name: 'empty', value: 100 - threatLevel },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={55}
                        startAngle={90}
                        endAngle={-270}
                        dataKey="value"
                        stroke="none"
                      >
                        <Cell fill={getThreatColor(threatLevel)} />
                        <Cell fill="#e5e7eb" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <motion.span
                        className="text-2xl font-bold block"
                        style={{ color: getThreatColor(threatLevel) }}
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                      >
                        {threatLevel}
                      </motion.span>
                      <span className="text-[10px] font-semibold" style={{ color: getThreatColor(threatLevel) }}>
                        {getThreatLabel(threatLevel)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-2 text-xs">
                {[
                  { range: '0-39', label: 'BAJO', color: 'bg-emerald-500' },
                  { range: '40-59', label: 'MEDIO', color: 'bg-amber-500' },
                  { range: '60-79', label: 'ALTO', color: 'bg-orange-500' },
                  { range: '80-100', label: 'CRÍTICO', color: 'bg-red-500' },
                ].map((level) => (
                  <div key={level.label} className="flex items-center gap-2">
                    <div className={cn('w-3 h-3 rounded-full', level.color)} />
                    <span>{level.range} — {level.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Alert Distribution */}
            <div className="flex-1">
              <h4 className="text-xs font-semibold mb-2 text-center">Distribución por Severidad</h4>
              <div className="flex items-center gap-2">
                <ResponsiveContainer width="50%" height={120}>
                  <PieChart>
                    <Pie data={alertsBySeverity} cx="50%" cy="50%" innerRadius={25} outerRadius={45} dataKey="value" stroke="none">
                      {alertsBySeverity.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1 text-xs">
                  {alertsBySeverity.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <Badge className={cn('text-[9px]', severityBadgeColors[item.name])}>{item.name}</Badge>
                      <span className="font-bold">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Trend */}
            <div className="flex-1">
              <h4 className="text-xs font-semibold mb-2 text-center">Tendencia (6h)</h4>
              <ChartContainer config={alertTrendConfig} className="h-[120px] w-full">
                <BarChart data={alertTrendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="hour" tickLine={false} fontSize={9} />
                  <YAxis tickLine={false} fontSize={9} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters & Live Feed */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 dark:bg-red-950/30 rounded-lg flex items-center justify-center">
                <Radio className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <CardTitle className="text-base">Feed de Alertas en Vivo</CardTitle>
                <p className="text-xs text-muted-foreground">Monitoreo en tiempo real de todas las alertas del sistema</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs border-red-300 text-red-600">
                <motion.div
                  className="w-2 h-2 bg-red-500 rounded-full mr-1"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                />
                EN VIVO
              </Badge>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <Filter className="w-3 h-3 mr-1" />
                  <SelectValue placeholder="Severidad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="CRÍTICA">Crítica</SelectItem>
                  <SelectItem value="ALTA">Alta</SelectItem>
                  <SelectItem value="MEDIA">Media</SelectItem>
                  <SelectItem value="BAJA">Baja</SelectItem>
                  <SelectItem value="INFO">Info</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue placeholder="Fuente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las fuentes</SelectItem>
                  {uniqueSources.map((src) => (
                    <SelectItem key={src} value={src}>{src}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div ref={feedRef} className="max-h-[500px] overflow-y-auto custom-scrollbar space-y-2">
            <AnimatePresence>
              {filteredAlerts.slice(0, 30).map((alert) => {
                const config = severityConfig[alert.severity] || severityConfig['INFO'];
                const SevIcon = config.icon;
                const isExpanded = expandedAlert === alert.id;

                return (
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className={cn(
                      'border-l-4 rounded-lg p-3 transition-all',
                      config.border,
                      config.bg,
                      alert.acknowledged ? 'opacity-60' : ''
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <SevIcon className={cn('w-5 h-5 shrink-0 mt-0.5', config.color)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={cn('text-[10px]', severityBadgeColors[alert.severity])}>
                            {alert.severity}
                          </Badge>
                          <span className="text-xs font-mono text-muted-foreground">{formatTimestamp(alert.timestamp)}</span>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs font-medium">{alert.source}</span>
                          {alert.acknowledged && (
                            <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-600">Reconocida</Badge>
                          )}
                        </div>
                        <p className="text-sm font-semibold mt-1">{alert.title}</p>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                          >
                            <p className="text-xs text-muted-foreground mt-2">{alert.description}</p>
                            <div className="mt-2 p-2 bg-background rounded-lg text-xs">
                              <span className="font-medium">Acción tomada: </span>
                              <span className="text-muted-foreground">{alert.actionTaken || 'Sin acción registrada'}</span>
                            </div>
                          </motion.div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7"
                          onClick={() => setExpandedAlert(isExpanded ? null : alert.id)}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                    {!alert.acknowledged && (
                      <div className="flex items-center gap-2 mt-2 ml-8">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => acknowledgeAlert(alert.id)}
                        >
                          <Eye className="w-3 h-3" /> Reconocer
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 border-orange-300 text-orange-600 hover:bg-orange-50"
                          onClick={() => escalateAlert(alert.id)}
                        >
                          <ArrowUpCircle className="w-3 h-3" /> Escalar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 border-red-300 text-red-600 hover:bg-red-50"
                          onClick={() => dismissAlert(alert.id)}
                        >
                          <Trash2 className="w-3 h-3" /> Descartar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 border-emerald-300 text-emerald-600 hover:bg-emerald-50"
                        >
                          <FileOutput className="w-3 h-3" /> Reporte
                        </Button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
          <Separator className="my-3" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Mostrando {Math.min(filteredAlerts.length, 30)} de {filteredAlerts.length} alertas</span>
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3" />
              <span>Actualización automática cada 8s</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
