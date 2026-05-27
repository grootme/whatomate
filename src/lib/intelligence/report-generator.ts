import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

/**
 * Generate an AI-powered intelligence report and persist it to the database.
 * This is the shared generation logic used by both the reports POST endpoint
 * and the generate POST endpoint.
 */
export async function generateReport(reportId: string): Promise<void> {
  try {
    // Get report from DB
    const report = await db.report.findUnique({ where: { id: reportId } });
    if (!report) {
      console.error(`Report generation: report ${reportId} not found`);
      return;
    }

    // Update status to generating
    await db.report.update({
      where: { id: reportId },
      data: { status: 'generando' },
    });

    // Fetch all real data for the report period
    const [alerts, events, patterns, entities, thresholds, riskAssessments, agentStates] = await Promise.all([
      db.alert.findMany({
        where: { timestamp: { gte: report.dateFrom, lte: report.dateTo } },
        orderBy: { timestamp: 'desc' },
      }),
      db.intelligenceEvent.findMany({
        where: { timestamp: { gte: report.dateFrom, lte: report.dateTo } },
        orderBy: { timestamp: 'desc' },
        take: 100,
      }),
      db.patternDetection.findMany({
        where: { lastDetected: { gte: report.dateFrom, lte: report.dateTo } },
      }),
      db.entity.findMany({
        where: { lastSeen: { gte: report.dateFrom, lte: report.dateTo } },
        orderBy: { riskScore: 'desc' },
        take: 50,
      }),
      db.thresholdConfig.findMany({ where: { enabled: true } }),
      db.riskAssessment.findMany({
        where: { createdAt: { gte: report.dateFrom, lte: report.dateTo } },
        orderBy: { score: 'desc' },
        take: 50,
      }),
      db.agentState.findMany(),
    ]);

    // Build data summary for AI
    const alertSummary = {
      total: alerts.length,
      bySeverity: {
        CRÍTICA: alerts.filter(a => a.severity === 'CRÍTICA').length,
        ALTA: alerts.filter(a => a.severity === 'ALTA').length,
        MEDIA: alerts.filter(a => a.severity === 'MEDIA').length,
        BAJA: alerts.filter(a => a.severity === 'BAJA').length,
        INFO: alerts.filter(a => a.severity === 'INFO').length,
      },
      acknowledged: alerts.filter(a => a.acknowledged).length,
      escalated: alerts.filter(a => a.escalated).length,
      byStrategy: alerts.reduce((acc, a) => {
        acc[a.strategy] = (acc[a.strategy] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    const patternSummary = patterns.map(p => ({
      type: p.patternType,
      severity: p.severity,
      confidence: p.confidence,
      occurrences: p.occurrences,
      status: p.status,
    }));

    const entitySummary = {
      total: entities.length,
      byRiskLevel: {
        critical: entities.filter(e => e.riskLevel === 'critical').length,
        high: entities.filter(e => e.riskLevel === 'high').length,
        medium: entities.filter(e => e.riskLevel === 'medium').length,
        low: entities.filter(e => e.riskLevel === 'low').length,
      },
      topRisky: entities.slice(0, 10).map(e => ({ name: e.name, type: e.type, riskScore: e.riskScore, mentionCount: e.mentionCount })),
    };

    const agentSummary = agentStates.map(a => ({
      name: a.name,
      layer: a.layerName,
      status: a.status,
      health: a.health,
      messagesProcessed: a.messagesProcessed,
    }));

    // Use AI to generate professional report content
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Eres un analista de inteligencia digital senior. Generas reportes profesionales en formato Markdown para una plataforma de inteligencia multi-agente que monitorea 276 grupos (195 WhatsApp, 81 Telegram), 6 fuentes OSINT, y 19 herramientas de inteligencia. Los reportes deben ser detallados, analíticos y con recomendaciones accionables. Escribe en español. Usa formato Markdown con encabezados, tablas y listas.`
        },
        {
          role: 'user',
          content: `Genera un reporte de inteligencia ${report.type} para el período ${report.dateFrom.toLocaleDateString('es-ES')} - ${report.dateTo.toLocaleDateString('es-ES')}.

DATOS REALES DEL SISTEMA:

## Alertas
${JSON.stringify(alertSummary, null, 2)}

## Patrones Detectados
${JSON.stringify(patternSummary, null, 2)}

## Entidades Monitoreadas
${JSON.stringify(entitySummary, null, 2)}

## Agentes del Sistema
${JSON.stringify(agentSummary, null, 2)}

## Umbrales Configurados
${JSON.stringify(thresholds.map(t => ({ name: t.name, value: t.value, current: t.currentValue, unit: t.unit, enabled: t.enabled })), null, 2)}

## Evaluaciones de Riesgo Recientes
Total: ${riskAssessments.length}
Score promedio: ${riskAssessments.length > 0 ? Math.round(riskAssessments.reduce((s, r) => s + r.score, 0) / riskAssessments.length) : 0}/100
Score máximo: ${riskAssessments.length > 0 ? riskAssessments[0].score : 0}/100

## Eventos del Sistema
Total en período: ${events.length}
Tipos: ${[...new Set(events.map(e => e.eventType))].join(', ')}

INCLUYE LAS SIGUIENTES SECCIONES:
1. Resumen Ejecutivo - panorama general del período
2. Análisis de Alertas - distribución, tendencias, severidad
3. Patrones Detectados - detalles de cada patrón activo
4. Evaluación de Riesgo - entidades de alto riesgo, scores
5. Estado del Sistema - salud de agentes, umbrales
6. Recomendaciones - acciones prioritarias`
        }
      ],
    });

    const reportContent = completion.choices[0]?.message?.content || `# ${report.title}\n\nSin datos disponibles para el período.`;

    // Save content to report
    await db.report.update({
      where: { id: reportId },
      data: {
        status: 'completado',
        content: reportContent,
        pages: Math.ceil(reportContent.length / 3000) + 1,
        generatedAt: new Date(),
        alertCount: alerts.length,
        eventCount: events.length,
        entityCount: entities.length,
      },
    });

    console.log(`Report ${reportId} generated successfully`);
  } catch (error) {
    console.error('Report generation error:', error);

    // Try to mark report as error
    try {
      await db.report.update({
        where: { id: reportId },
        data: { status: 'error' },
      });
    } catch {
      // Silently handle — error status update is best-effort
    }
  }
}
