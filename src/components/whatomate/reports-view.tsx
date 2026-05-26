'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useWhatomateStore } from '@/lib/store';
import { mockReportTemplates } from '@/lib/mock-data';
import type { ReportType, ReportStatus } from '@/lib/mock-data';
import {
  FileOutput,
  Download,
  Clock,
  Calendar,
  CheckCircle2,
  Loader2,
  FileText,
  BarChart3,
  AlertTriangle,
  Brain,
  Eye,
  Plus,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const typeConfig: Record<ReportType, { label: string; color: string; icon: React.ElementType }> = {
  diario: { label: 'Diario', color: 'bg-emerald-500', icon: Clock },
  semanal: { label: 'Semanal', color: 'bg-amber-500', icon: Calendar },
  mensual: { label: 'Mensual', color: 'bg-purple-500', icon: BarChart3 },
};

const statusConfig: Record<ReportStatus, { label: string; color: string; icon: React.ElementType }> = {
  completado: { label: 'Completado', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300', icon: CheckCircle2 },
  generando: { label: 'Generando', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300', icon: Loader2 },
  programado: { label: 'Programado', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300', icon: Clock },
  error: { label: 'Error', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', icon: AlertTriangle },
};

export function ReportsView() {
  const { reports, addReport, generatingReport, setGeneratingReport } = useWhatomateStore();
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<ReportType | 'all'>('all');
  const templates = mockReportTemplates;

  const filteredReports = reports.filter((r) => filterType === 'all' || r.type === filterType);
  const selectedReportData = reports.find((r) => r.id === selectedReport);

  const handleGenerateReport = (type: ReportType) => {
    setGeneratingReport(true);
    const template = templates.find((t) => t.type === type);
    const now = new Date();
    const typeLabels = { diario: 'Diario', semanal: 'Semanal', mensual: 'Mensual' };
    
    setTimeout(() => {
      const newReport = {
        id: `rep-${Date.now()}`,
        title: `Reporte ${typeLabels[type]} - ${now.getDate()} ${now.toLocaleString('es', { month: 'long' })} ${now.getFullYear()}`,
        date: now.toISOString().split('T')[0],
        type,
        status: 'completado' as ReportStatus,
        pages: type === 'diario' ? 11 : type === 'semanal' ? 26 : 42,
        sections: template?.sections || [],
        downloadUrl: `/download/reporte-${type}-${Date.now()}.pdf`,
      };
      addReport(newReport);
      setGeneratingReport(false);
    }, 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Centro de Generación de Reportes</h2>
          <p className="text-sm text-muted-foreground">Generación automatizada y programada de informes de inteligencia</p>
        </div>
        <Badge className="bg-emerald-600 text-white border-0">{reports.length} reportes</Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <FileOutput className="w-4 h-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Completados</span>
            </div>
            <span className="text-2xl font-bold">{reports.filter((r) => r.status === 'completado').length}</span>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Programados</span>
            </div>
            <span className="text-2xl font-bold">{reports.filter((r) => r.status === 'programado').length}</span>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">Páginas Total</span>
            </div>
            <span className="text-2xl font-bold">{reports.filter((r) => r.status === 'completado').reduce((s, r) => s + r.pages, 0)}</span>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Brain className="w-4 h-4 text-teal-500" />
              <span className="text-xs text-muted-foreground">Generando</span>
            </div>
            <span className="text-2xl font-bold">{reports.filter((r) => r.status === 'generando').length}</span>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Report Templates & Generation */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Generar Reporte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {templates.map((template) => {
                const config = typeConfig[template.type];
                const TypeIcon = config.icon;
                return (
                  <motion.div
                    key={template.id}
                    className="p-3 rounded-xl border bg-muted/30 hover:bg-muted/50 transition-colors"
                    whileHover={{ scale: 1.01 }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-white', config.color)}>
                        <TypeIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-sm font-semibold">{template.name}</span>
                        <Badge className={cn('text-[9px] ml-2', config.color + ' text-white border-0')}>
                          {config.label}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{template.description}</p>
                    <div className="text-[10px] text-muted-foreground mb-2">
                      Secciones: {template.sections.join(' • ')}
                    </div>
                    {template.schedule && (
                      <div className="text-[10px] text-muted-foreground mb-2">
                        Cron: <code className="bg-muted px-1 rounded">{template.schedule}</code>
                      </div>
                    )}
                    <Button
                      className={cn('w-full text-xs', config.color + ' hover:opacity-90 text-white')}
                      size="sm"
                      onClick={() => handleGenerateReport(template.type)}
                      disabled={generatingReport}
                    >
                      {generatingReport ? (
                        <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Generando...</>
                      ) : (
                        <><Plus className="w-3 h-3 mr-1" /> Generar {config.label}</>
                      )}
                    </Button>
                  </motion.div>
                );
              })}
            </CardContent>
          </Card>

          {/* Auto-generation Schedule */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Programación Automática</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { type: 'diario', time: '08:00 AM', cron: '0 8 * * *', active: true },
                  { type: 'semanal', time: 'Lunes 09:00 AM', cron: '0 9 * * 1', active: true },
                  { type: 'mensual', time: '1ro del mes 10:00 AM', cron: '0 10 1 * *', active: true },
                ].map((schedule) => {
                  const config = typeConfig[schedule.type as ReportType];
                  return (
                    <div key={schedule.type} className="flex items-center justify-between p-2 rounded-lg bg-muted/40">
                      <div className="flex items-center gap-2">
                        <div className={cn('w-2 h-2 rounded-full', config.color)} />
                        <div>
                          <span className="text-xs font-medium">{config.label}</span>
                          <p className="text-[10px] text-muted-foreground">{schedule.time}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[9px]">
                        {schedule.active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Report History & Preview */}
        <div className="lg:col-span-2 space-y-4">
          {/* Type Filters */}
          <div className="flex items-center gap-2">
            <Button
              variant={filterType === 'all' ? 'default' : 'outline'}
              size="sm"
              className={cn('text-xs', filterType === 'all' ? 'bg-emerald-600 hover:bg-emerald-700' : '')}
              onClick={() => setFilterType('all')}
            >
              Todos
            </Button>
            {(['diario', 'semanal', 'mensual'] as ReportType[]).map((type) => {
              const config = typeConfig[type];
              return (
                <Button
                  key={type}
                  variant={filterType === type ? 'default' : 'outline'}
                  size="sm"
                  className={cn('text-xs', filterType === type ? config.color + ' text-white' : '')}
                  onClick={() => setFilterType(type)}
                >
                  {config.label}
                </Button>
              );
            })}
          </div>

          {/* Report List */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Historial de Reportes</CardTitle>
                <Button variant="ghost" size="sm" className="text-xs text-emerald-600">
                  <RefreshCw className="w-3 h-3 mr-1" /> Actualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                <AnimatePresence>
                  {filteredReports.map((report, idx) => {
                    const typeConf = typeConfig[report.type];
                    const statusConf = statusConfig[report.status];
                    const TypeIcon = typeConf.icon;
                    const StatusIcon = statusConf.icon;
                    const isSelected = selectedReport === report.id;

                    return (
                      <motion.div
                        key={report.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all',
                          isSelected ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/20' : 'border-transparent hover:bg-muted/50'
                        )}
                        onClick={() => setSelectedReport(isSelected ? null : report.id)}
                      >
                        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center text-white', typeConf.color)}>
                          <TypeIcon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{report.title}</span>
                            <Badge className={cn('text-[9px] border-0', statusConf.color)}>
                              <StatusIcon className={cn('w-3 h-3 mr-0.5', report.status === 'generando' ? 'animate-spin' : '')} />
                              {statusConf.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                            <span>{report.date}</span>
                            {report.pages > 0 && <span>{report.pages} páginas</span>}
                            <Badge className={cn('text-[9px] border-0', typeConf.color + ' text-white')}>
                              {typeConf.label}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {report.status === 'completado' && report.downloadUrl && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-8 h-8"
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                            >
                              <Download className="w-4 h-4 text-emerald-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="w-8 h-8">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>

          {/* Report Preview */}
          <AnimatePresence>
            {selectedReportData && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Card className="border-0 shadow-sm border-t-2 border-t-emerald-500">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Vista Previa: {selectedReportData.title}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge className={cn('text-[10px]', typeConfig[selectedReportData.type].color + ' text-white border-0')}>
                          {typeConfig[selectedReportData.type].label}
                        </Badge>
                        <Badge className={cn('text-[10px]', statusConfig[selectedReportData.status].color)}>
                          {statusConfig[selectedReportData.status].label}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <div className="p-2 rounded-lg bg-muted/40 text-center">
                        <span className="text-xs text-muted-foreground">Fecha</span>
                        <p className="text-sm font-semibold">{selectedReportData.date}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/40 text-center">
                        <span className="text-xs text-muted-foreground">Páginas</span>
                        <p className="text-sm font-semibold">{selectedReportData.pages}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/40 text-center">
                        <span className="text-xs text-muted-foreground">Secciones</span>
                        <p className="text-sm font-semibold">{selectedReportData.sections.length}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/40 text-center">
                        <span className="text-xs text-muted-foreground">Tipo</span>
                        <p className="text-sm font-semibold">{typeConfig[selectedReportData.type].label}</p>
                      </div>
                    </div>

                    <h4 className="text-xs font-semibold mb-2">Secciones del Reporte</h4>
                    <div className="space-y-1.5 mb-4">
                      {selectedReportData.sections.map((section, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                          <div className="w-5 h-5 bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded flex items-center justify-center text-[10px] font-bold">
                            {idx + 1}
                          </div>
                          <span className="text-xs">{section}</span>
                          <Progress value={Math.random() * 40 + 60} className="h-1 flex-1 ml-2" />
                        </div>
                      ))}
                    </div>

                    {selectedReportData.status === 'completado' && selectedReportData.downloadUrl && (
                      <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                        <Download className="w-4 h-4 mr-2" /> Descargar Reporte PDF
                      </Button>
                    )}
                    {selectedReportData.status === 'generando' && (
                      <div className="flex items-center justify-center gap-3 p-4">
                        <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                        <span className="text-sm text-muted-foreground">Generando reporte en progreso...</span>
                        <Progress value={45} className="h-2 w-32" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
