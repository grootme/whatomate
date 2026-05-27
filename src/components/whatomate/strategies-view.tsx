'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useWhatomateStore } from '@/lib/store';
import { useIntelligenceData, patternTypeLabels, patternTypeSequences, conditionLabel, formatRelativeTime } from '@/hooks/use-intelligence-data';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Bar, BarChart, LineChart, Line, XAxis, YAxis, CartesianGrid, Cell, PieChart, Pie, ResponsiveContainer, Area, AreaChart } from 'recharts';
import {
  AlertTriangle,
  TrendingUp,
  Shield,
  Brain,
  Target,
  RotateCcw,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Minus,
  Users,
  Gauge,
  Zap,
  BarChart3,
  Lightbulb,
  Clock,
} from 'lucide-react';
import { motion } from 'framer-motion';

const severityColors: Record<string, string> = {
  'CRÍTICA': 'bg-red-500 text-white',
  'ALTA': 'bg-orange-500 text-white',
  'MEDIA': 'bg-amber-500 text-white',
  'BAJA': 'bg-teal-500 text-white',
  'INFO': 'bg-gray-400 text-white',
};

const severityBorders: Record<string, string> = {
  'CRÍTICA': 'border-l-red-500',
  'ALTA': 'border-l-orange-500',
  'MEDIA': 'border-l-amber-500',
  'BAJA': 'border-l-teal-500',
  'INFO': 'border-l-gray-400',
};

function RiskGauge({ score }: { score: number }) {
  const getColor = (s: number) => {
    if (s <= 30) return '#10B981';
    if (s <= 50) return '#F59E0B';
    if (s <= 70) return '#F97316';
    return '#EF4444';
  };
  const getLabel = (s: number) => {
    if (s <= 30) return 'Legítimo';
    if (s <= 50) return 'Mercado Gris';
    if (s <= 70) return 'Sospechoso';
    return 'Fraude';
  };

  const data = [
    { name: 'value', value: score },
    { name: 'empty', value: 100 - score },
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-48 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="100%"
              startAngle={180}
              endAngle={0}
              innerRadius={60}
              outerRadius={80}
              dataKey="value"
              stroke="none"
            >
              <Cell fill={getColor(score)} />
              <Cell fill="#e5e7eb" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-end justify-center pb-1">
          <span className="text-3xl font-bold" style={{ color: getColor(score) }}>{score}</span>
        </div>
      </div>
      <span className="text-sm font-semibold mt-1" style={{ color: getColor(score) }}>{getLabel(score)}</span>
      <div className="flex gap-1 mt-2">
        {[
          { label: '0-30', color: 'bg-emerald-500' },
          { label: '30-50', color: 'bg-amber-500' },
          { label: '50-70', color: 'bg-orange-500' },
          { label: '70-100', color: 'bg-red-500' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-1">
            <div className={cn('w-2.5 h-2.5 rounded-full', s.color)} />
            <span className="text-[10px] text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConsensusVotingPanel() {
  const { consensusVotes, updateVote, setConsensusVotes } = useWhatomateStore();
  const [isVoting, setIsVoting] = useState(false);
  const [animatingAgent, setAnimatingAgent] = useState<string | null>(null);

  const favorCount = consensusVotes.filter((v) => v.vote === 'favor').length;
  const totalCount = consensusVotes.length;

  const getConsensusLevel = () => {
    const ratio = favorCount / totalCount;
    if (ratio >= 1) return { label: 'Total (4/4)', action: 'Auto 99%+', color: 'text-emerald-600' };
    if (ratio >= 0.75) return { label: 'Mayoritario (3/4)', action: 'Auto + Notificación 90-99%', color: 'text-teal-600' };
    if (ratio >= 0.5) return { label: 'Parcial (2/4)', action: 'Escalación Humana 60-90%', color: 'text-amber-600' };
    return { label: 'Minoritario (1/4)', action: 'Falso Positivo <60%', color: 'text-red-600' };
  };

  const consensus = getConsensusLevel();

  const simulateVoting = useCallback(async () => {
    setIsVoting(true);
    try {
      const res = await fetch('/api/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'consensus' }),
      });
      if (res.ok) {
        const data = await res.json();
        // The API returns the votes array from the real consensus strategy evaluation
        const returnedVotes: Array<{ id: string; alertId: string; agentId: string; agentName: string; vote: 'favor' | 'contra' | 'abstencion'; confidence: number; reasoning: string }> = data.votes ?? [];

        // Animate each vote sequentially
        returnedVotes.forEach((v, idx) => {
          setTimeout(() => {
            setAnimatingAgent(v.agentId);
            updateVote(v.agentId, v.vote);
            setTimeout(() => setAnimatingAgent(null), 500);
            if (idx === returnedVotes.length - 1) {
              // After last animation, replace all votes with full data from API
              setConsensusVotes(returnedVotes);
              setIsVoting(false);
            }
          }, idx * 800);
        });

        // If no votes returned, just finish
        if (returnedVotes.length === 0) {
          setIsVoting(false);
        }
      } else {
        setIsVoting(false);
      }
    } catch {
      setIsVoting(false);
    }
  }, [updateVote, setConsensusVotes]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Voting Agents */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Agentes Votantes</h4>
          {consensusVotes.map((vote) => (
            <motion.div
              key={vote.agentId}
              animate={animatingAgent === vote.agentId ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 0.5 }}
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl border transition-all',
                vote.vote === 'favor' ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20' :
                vote.vote === 'contra' ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20' :
                'border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-900/20'
              )}
            >
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold',
                vote.vote === 'favor' ? 'bg-emerald-500' :
                vote.vote === 'contra' ? 'bg-red-500' :
                'bg-gray-400'
              )}>
                {vote.agentName.split(' ').map((w) => w[0]).join('').slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{vote.agentName}</span>
                  <Badge className={cn('text-[10px]', vote.vote === 'favor' ? 'bg-emerald-500' : vote.vote === 'contra' ? 'bg-red-500' : 'bg-gray-400')}>
                    {vote.vote === 'favor' ? '✓ A favor' : vote.vote === 'contra' ? '✗ En contra' : '— Abstención'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{vote.reasoning}</p>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold" style={{ color: vote.confidence >= 80 ? '#10B981' : vote.confidence >= 60 ? '#F59E0B' : '#EF4444' }}>
                  {vote.confidence}%
                </span>
                <p className="text-[10px] text-muted-foreground">Confianza</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Consensus Result */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold">Resultado del Consenso</h4>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-6 text-center">
              <div className="flex justify-center gap-3 mb-4">
                {consensusVotes.map((v) => (
                  <motion.div
                    key={v.agentId}
                    className={cn(
                      'w-12 h-12 rounded-full flex items-center justify-center text-lg',
                      v.vote === 'favor' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' :
                      v.vote === 'contra' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    )}
                    animate={isVoting ? { rotate: [0, 360] } : {}}
                    transition={{ duration: 0.5 }}
                  >
                    {v.vote === 'favor' ? <CheckCircle2 className="w-6 h-6" /> :
                     v.vote === 'contra' ? <XCircle className="w-6 h-6" /> :
                     <Minus className="w-6 h-6" />}
                  </motion.div>
                ))}
              </div>
              <div className="mb-3">
                <span className={cn('text-2xl font-bold', consensus.color)}>{consensus.label}</span>
              </div>
              <Progress value={(favorCount / totalCount) * 100} className="h-3 mb-2" />
              <p className="text-sm text-muted-foreground">{favorCount}/{totalCount} agentes a favor</p>
              <p className="text-sm font-medium mt-2">Acción: {consensus.action}</p>
            </CardContent>
          </Card>
          <Button
            onClick={simulateVoting}
            disabled={isVoting}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isVoting ? (
              <><RotateCcw className="w-4 h-4 mr-2 animate-spin" /> Votando...</>
            ) : (
              <><Users className="w-4 h-4 mr-2" /> Simular Votación</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

const activityChartConfig = {
  activity: { label: 'Actividad', color: '#10B981' },
  confidence: { label: 'Confianza', color: '#F59E0B' },
} satisfies ChartConfig;

const adaptiveChartConfig = {
  falsePositiveRate: { label: 'Falsos Positivos %', color: '#EF4444' },
  accuracy: { label: 'Precisión %', color: '#10B981' },
  sensitivity: { label: 'Sensibilidad %', color: '#F59E0B' },
} satisfies ChartConfig;

const thresholdChartConfig = {
  current: { label: 'Actual', color: '#10B981' },
  value: { label: 'Umbral', color: '#EF4444' },
} satisfies ChartConfig;

export function StrategiesView() {
  const {
    agentLayers,
    thresholds,
    updateThreshold,
    riskDimensions,
    updateRiskDimension,
    adaptiveHistory,
    learningRate,
    setLearningRate,
    patterns,
    signals,
  } = useWhatomateStore();
  useIntelligenceData();

  // Use real prediction data from DB (fetched via /api/strategies/signals)
  const predictionData = signals.predictionChartData;

  const [activeTab, setActiveTab] = useState('umbrales');

  // Derive risk score from dimensions
  const totalWeight = riskDimensions.reduce((s, d) => s + d.weight, 0);
  const sampleRiskScore = totalWeight > 0 ? Math.min(100, Math.round(
    riskDimensions.reduce((s, d) => s + (d.weight / totalWeight) * (50 + d.weight * 0.8), 0)
  )) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Panel de 6 Estrategias de Decisión</h2>
          <p className="text-sm text-muted-foreground">Configuración interactiva de todas las estrategias del sistema multi-agente</p>
        </div>
        <Badge className="bg-emerald-600 text-white border-0">{agentLayers.reduce((s, l) => s + l.agents.filter(a => a.status === 'active').length, 0)} herramientas activas</Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="umbrales" className="text-xs gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Umbrales</TabsTrigger>
          <TabsTrigger value="patrones" className="text-xs gap-1"><Target className="w-3.5 h-3.5" /> Patrones</TabsTrigger>
          <TabsTrigger value="riesgo" className="text-xs gap-1"><Gauge className="w-3.5 h-3.5" /> Riesgo</TabsTrigger>
          <TabsTrigger value="consenso" className="text-xs gap-1"><Users className="w-3.5 h-3.5" /> Consenso</TabsTrigger>
          <TabsTrigger value="predictiva" className="text-xs gap-1"><TrendingUp className="w-3.5 h-3.5" /> Predictiva</TabsTrigger>
          <TabsTrigger value="adaptativa" className="text-xs gap-1"><RotateCcw className="w-3.5 h-3.5" /> Adaptativa</TabsTrigger>
        </TabsList>

        {/* Strategy 1: Umbrales (Reactiva) */}
        <TabsContent value="umbrales">
          <div className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-50 dark:bg-red-950/30 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Estrategia 1: Umbrales (Reactiva)</CardTitle>
                    <p className="text-xs text-muted-foreground">Respuesta automática cuando los datos superan límites predefinidos</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-3">
                    {thresholds.map((threshold) => (
                      <motion.div
                        key={threshold.id}
                        className={cn(
                          'p-4 rounded-xl border-l-4 bg-muted/30',
                          severityBorders[threshold.alertSeverity]
                        )}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05 }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{threshold.name}</span>
                            <Badge className={cn('text-[10px]', severityColors[threshold.alertSeverity])}>
                              {threshold.alertSeverity}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">{threshold.alertType}</span>
                        </div>
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xs text-muted-foreground w-20">Condición: {conditionLabel(threshold.condition)} {threshold.value} {threshold.unit}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <Slider
                              value={[threshold.value]}
                              min={1}
                              max={Math.max(threshold.value * 3, 10)}
                              step={1}
                              onValueChange={(val) => updateThreshold(threshold.id, val[0])}
                              className="w-full"
                            />
                          </div>
                          <span className="text-sm font-bold min-w-[60px] text-right">
                            {threshold.value} {threshold.unit}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-2 text-xs">
                          <span className="text-muted-foreground">Valor actual: <span className={threshold.currentValue >= threshold.value ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}>{threshold.currentValue}</span></span>
                          <Progress value={(threshold.currentValue / threshold.value) * 100} className="h-1.5 w-24" />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <div>
                    <Card className="border-0 shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Estado de Umbrales</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ChartContainer config={thresholdChartConfig} className="h-[280px] w-full">
                          <BarChart data={thresholds.map((t) => ({ name: t.name.split(' ').slice(0, 2).join(' '), current: t.currentValue, value: t.value }))} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" tickLine={false} fontSize={10} />
                            <YAxis dataKey="name" type="category" tickLine={false} width={80} fontSize={10} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar dataKey="current" fill="var(--color-current)" radius={[0, 4, 4, 0]} />
                            <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ChartContainer>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Strategy 2: Patrones (Deductiva) */}
        <TabsContent value="patrones">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-50 dark:bg-amber-950/30 rounded-lg flex items-center justify-center">
                  <Target className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Estrategia 2: Patrones (Deductiva)</CardTitle>
                  <p className="text-xs text-muted-foreground">Detección de secuencias y patrones conocidos de actividad sospechosa</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {patterns.map((pattern, idx) => (
                  <motion.div
                    key={pattern.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className={cn(
                      'p-4 rounded-xl border-l-4 bg-muted/30',
                      severityBorders[pattern.severity]
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold">{patternTypeLabels[pattern.patternType] || pattern.patternType}</span>
                      <Badge className={cn('text-[10px]', severityColors[pattern.severity])}>
                        {pattern.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{pattern.description}</p>
                    
                    {/* Sequence Diagram */}
                    <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-1">
                      {(patternTypeSequences[pattern.patternType] || []).map((step, sIdx) => (
                        <React.Fragment key={sIdx}>
                          <div className="flex flex-col items-center min-w-[70px]">
                            <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-[10px] font-bold">
                              {sIdx + 1}
                            </div>
                            <span className="text-[9px] text-muted-foreground text-center mt-1 leading-tight">{step}</span>
                          </div>
                          {sIdx < (patternTypeSequences[pattern.patternType] || []).length - 1 && (
                            <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                          )}
                        </React.Fragment>
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Detección:</span>
                        <span className="font-bold text-emerald-600">{pattern.detectionRate ?? pattern.confidence}%</span>
                      </div>
                      <span className="text-muted-foreground">Último: {formatRelativeTime(pattern.lastDetected)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1">
                      <Progress value={pattern.detectionRate ?? pattern.confidence} className="h-1.5 flex-1 mr-3" />
                      <span className="text-muted-foreground">{pattern.occurrences} casos</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Strategy 3: Risk Scoring */}
        <TabsContent value="riesgo">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-50 dark:bg-orange-950/30 rounded-lg flex items-center justify-center">
                  <Gauge className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Estrategia 3: Puntuación de Riesgo (Cuantitativa)</CardTitle>
                  <p className="text-xs text-muted-foreground">Evaluación multidimensional del riesgo con pesos ajustables</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Risk Gauge */}
                <div className="flex flex-col items-center">
                  <RiskGauge score={sampleRiskScore} />
                  <Card className="w-full mt-4 border-0 shadow-sm">
                    <CardContent className="p-4">
                      <h4 className="text-sm font-semibold mb-3">Dimensiones del Riesgo</h4>
                      <div className="space-y-4">
                        {riskDimensions.map((dim) => (
                          <div key={dim.id}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dim.color }} />
                                <span className="text-xs font-medium">{dim.name}</span>
                              </div>
                              <span className="text-xs font-bold" style={{ color: dim.color }}>{dim.weight}%</span>
                            </div>
                            <Slider
                              value={[dim.weight]}
                              min={0}
                              max={50}
                              step={1}
                              onValueChange={(val) => updateRiskDimension(dim.id, val[0])}
                            />
                            <p className="text-[10px] text-muted-foreground mt-0.5">{dim.description}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Risk Explanation */}
                <div className="space-y-4">
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                      <h4 className="text-sm font-semibold mb-3">Escala de Riesgo</h4>
                      <div className="space-y-2">
                        {[
                          { range: '0-30', label: 'Legítimo', color: 'bg-emerald-500', desc: 'Actividad verificada como legítima. No se requiere acción.' },
                          { range: '30-50', label: 'Mercado Gris', color: 'bg-amber-500', desc: 'Actividad ambigua que requiere monitoreo pasivo y revisión.' },
                          { range: '50-70', label: 'Sospechoso', color: 'bg-orange-500', desc: 'Indicadores de actividad ilícita. Requiere investigación activa.' },
                          { range: '70-100', label: 'Fraude', color: 'bg-red-500', desc: 'Alta probabilidad de fraude confirmado. Acción inmediata requerida.' },
                        ].map((level) => (
                          <div key={level.range} className="flex items-start gap-3 p-2 rounded-lg bg-muted/40">
                            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold', level.color)}>
                              {level.range}
                            </div>
                            <div>
                              <span className="text-sm font-semibold">{level.label}</span>
                              <p className="text-xs text-muted-foreground">{level.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                      <h4 className="text-sm font-semibold mb-2">Fórmula de Puntuación</h4>
                      <div className="p-3 bg-muted/50 rounded-lg text-xs font-mono leading-relaxed">
                        Risk = Σ(W<sub>i</sub> × S<sub>i</sub>) / Σ(W<sub>i</sub>)<br />
                        <br />
                        Donde: W<sub>i</sub> = peso de dimensión i<br />
                        S<sub>i</sub> = score de dimensión i (0-100)
                      </div>
                      <div className="mt-3 text-xs text-muted-foreground">
                        <p>La puntuación se recalcula automáticamente cuando se ajustan los pesos de las dimensiones. Los pesos actuales suman: <span className="font-bold">{riskDimensions.reduce((s, d) => s + d.weight, 0)}%</span></p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Strategy 4: Consensus */}
        <TabsContent value="consenso">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-50 dark:bg-teal-950/30 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Estrategia 4: Consenso Multi-Agente (Cooperativa)</CardTitle>
                  <p className="text-xs text-muted-foreground">Votación democrática entre agentes para decisiones críticas</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ConsensusVotingPanel />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Strategy 5: Predictive */}
        <TabsContent value="predictiva">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Estrategia 5: Predictiva (Proactiva)</CardTitle>
                  <p className="text-xs text-muted-foreground">Anticipación de eventos basada en modelos predictivos y análisis de tendencias</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Predicción de Actividad (Próximas 24h)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={activityChartConfig} className="h-[280px] w-full">
                      <AreaChart data={predictionData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="hour" tickLine={false} fontSize={10} />
                        <YAxis tickLine={false} fontSize={10} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Area type="monotone" dataKey="activity" stroke="var(--color-activity)" fill="var(--color-activity)" fillOpacity={0.2} />
                      </AreaChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
                <div className="space-y-4">
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                      <h4 className="text-sm font-semibold mb-3">Señales Activas</h4>
                      <div className="space-y-2">
                        {signals.activeSignals.map((signal, idx) => {
                          const IconComponent = signal.icon === 'Shield' ? Shield :
                            signal.icon === 'BarChart3' ? BarChart3 :
                            signal.icon === 'Zap' ? Zap :
                            signal.icon === 'AlertTriangle' ? AlertTriangle :
                            Brain;
                          return (
                            <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-muted/40">
                              <IconComponent className={cn('w-4 h-4', signal.color)} />
                              <span className="text-xs flex-1">{signal.label}</span>
                              <span className={cn('text-xs font-bold', signal.color)}>{signal.value}</span>
                              <TrendingUp className={cn('w-3 h-3', signal.trend === 'up' ? 'text-emerald-500' : 'text-muted-foreground')} />
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                      <h4 className="text-sm font-semibold mb-3">Indicadores de Confianza</h4>
                      <div className="space-y-3">
                        {signals.confidenceIndicators.map((ind) => (
                          <div key={ind.label}>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span>{ind.label}</span>
                              <span className="font-bold">{ind.value}%</span>
                            </div>
                            <Progress value={ind.value} className="h-2" />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Strategy 6: Adaptive */}
        <TabsContent value="adaptativa">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-50 dark:bg-purple-950/30 rounded-lg flex items-center justify-center">
                  <RotateCcw className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Estrategia 6: Adaptativa (Evolución Continua)</CardTitle>
                  <p className="text-xs text-muted-foreground">Auto-ajuste de parámetros basado en retroalimentación y resultados históricos</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Evolución del Sistema</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={adaptiveChartConfig} className="h-[280px] w-full">
                      <LineChart data={adaptiveHistory}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tickLine={false} fontSize={10} />
                        <YAxis tickLine={false} fontSize={10} domain={[0, 100]} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line type="monotone" dataKey="falsePositiveRate" stroke="var(--color-falsePositiveRate)" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="accuracy" stroke="var(--color-accuracy)" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="sensitivity" stroke="var(--color-sensitivity)" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
                <div className="space-y-4">
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                      <h4 className="text-sm font-semibold mb-3">Controles de Sensibilidad</h4>
                      <div className="space-y-4">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium">Tasa de Aprendizaje</span>
                            <span className="text-xs font-bold text-purple-600">{learningRate.toFixed(2)}</span>
                          </div>
                          <Slider
                            value={[learningRate * 100]}
                            min={1}
                            max={50}
                            step={1}
                            onValueChange={(val) => setLearningRate(val[0] / 100)}
                          />
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Valores altos = aprendizaje más rápido pero menos estable. Valores bajos = aprendizaje gradual y más preciso.
                          </p>
                        </div>
                        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Métricas Actuales</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Falsos Positivos:</span>
                              <span className="font-bold text-emerald-600 ml-1">{signals.currentMetrics.falsePositiveRate.toFixed(1)}%</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Precisión:</span>
                              <span className="font-bold text-emerald-600 ml-1">{Math.round(signals.currentMetrics.accuracy)}%</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Sensibilidad:</span>
                              <span className="font-bold text-emerald-600 ml-1">{Math.round(signals.currentMetrics.sensitivity)}%</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Iteraciones:</span>
                              <span className="font-bold text-emerald-600 ml-1">{signals.currentMetrics.iterations.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                      <h4 className="text-sm font-semibold mb-3">Línea de Tiempo de Evolución</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                        {signals.timelineEntries.map((entry, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-xs">
                            <div className={cn(
                              'w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                              entry.type === 'auto' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400' :
                              entry.type === 'learn' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-400' :
                              entry.type === 'improve' ? 'bg-teal-100 text-teal-600 dark:bg-teal-900 dark:text-teal-400' :
                              'bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-400'
                            )}>
                              {entry.type === 'auto' ? <RotateCcw className="w-3 h-3" /> :
                               entry.type === 'learn' ? <Lightbulb className="w-3 h-3" /> :
                               entry.type === 'improve' ? <TrendingUp className="w-3 h-3" /> :
                               <Clock className="w-3 h-3" />}
                            </div>
                            <div>
                              <span className="font-medium">{entry.date}</span>
                              <span className="text-muted-foreground"> — {entry.event}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
