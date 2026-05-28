import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/events
 *
 * Returns recent IntelligenceEvents from DB, formatted as EventBusEvent objects
 * for the real-time event bus display in the multiagent view.
 */
export async function GET() {
  try {
    const events = await db.intelligenceEvent.findMany({
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    // Map eventType to a human-readable source name
    function eventSource(eventType: string, payload: Record<string, unknown>): string {
      if (eventType.startsWith('ingestion.')) {
        const source = payload.source as string | undefined;
        if (source === 'whatsapp') return 'WhatsApp Bridge';
        if (source === 'telegram') return 'Telethon';
        if (source === 'osint') return 'OSINT Shadowbroker';
        return 'Ingesta';
      }
      if (eventType.startsWith('analysis.')) {
        if (eventType.includes('semantic')) return 'Semantic Analyzer';
        if (eventType.includes('pattern')) return 'Pattern Detector';
        if (eventType.includes('risk')) return 'Risk Scorer';
        if (eventType.includes('correlation')) return 'Cross-Platform Correlator';
        return 'Análisis';
      }
      if (eventType.startsWith('monitoring.')) {
        if (eventType.includes('threshold')) return 'Threshold Monitor';
        if (eventType.includes('anomaly')) return 'Anomaly Detector';
        if (eventType.includes('alert')) return 'Alert Engine';
        return 'Monitoreo';
      }
      if (eventType.startsWith('consensus.')) return 'Consensus Engine';
      if (eventType.startsWith('prediction.')) return 'Prediction Engine';
      if (eventType.startsWith('adaptive.')) return 'Adaptive Engine';
      if (eventType.startsWith('report.')) return 'Report Generator';
      if (eventType.startsWith('agent.')) return 'Agent Manager';
      return 'Sistema';
    }

    // Map eventType to a target (the next layer in the pipeline)
    function eventTarget(eventType: string): string {
      if (eventType.startsWith('ingestion.')) return 'Analysis Layer';
      if (eventType.startsWith('analysis.')) return 'Monitoring Layer';
      if (eventType.startsWith('monitoring.')) return 'Alert Engine';
      if (eventType.startsWith('consensus.')) return 'Decision Layer';
      if (eventType.startsWith('report.')) return 'Dashboard';
      return 'Sistema';
    }

    // Build a short summary from the payload
    function eventSummary(eventType: string, payload: Record<string, unknown>): string {
      if (eventType === 'ingestion.raw_message') {
        const ch = payload.channelName as string | undefined;
        return ch ? `Mensaje de ${ch}` : 'Nuevo mensaje recibido';
      }
      if (eventType === 'ingestion.batch_received') {
        const count = payload.count as number | undefined;
        return count ? `${count} mensajes batch` : 'Batch recibido';
      }
      if (eventType === 'analysis.semantic_completed') {
        const intent = payload.intent as string | undefined;
        return intent ? `Intención: ${intent}` : 'Análisis semántico completado';
      }
      if (eventType === 'analysis.pattern_detected') {
        const pt = payload.patternType as string | undefined;
        return pt ? `Patrón: ${pt}` : 'Patrón detectado';
      }
      if (eventType === 'analysis.risk_scored') {
        const score = payload.score as number | undefined;
        return score !== undefined ? `Score: ${score}/100` : 'Riesgo evaluado';
      }
      if (eventType === 'analysis.correlation_found') {
        return 'Correlación multi-plataforma';
      }
      if (eventType === 'monitoring.threshold_breached') {
        const metric = payload.metric as string | undefined;
        return metric ? `Umbral: ${metric}` : 'Umbral superado';
      }
      if (eventType === 'monitoring.anomaly_detected') {
        return 'Anomalía detectada';
      }
      if (eventType === 'monitoring.alert_generated') {
        return 'Alerta generada';
      }
      if (eventType.startsWith('consensus.')) {
        return 'Voto registrado';
      }
      if (eventType.startsWith('report.')) {
        return 'Reporte procesado';
      }
      if (eventType.startsWith('agent.')) {
        return 'Estado agente actualizado';
      }
      return 'Evento procesado';
    }

    const formatted = events.map((e) => {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(e.payload);
      } catch {
        payload = {};
      }

      const ts = e.timestamp;
      const timeStr = `${ts.getHours().toString().padStart(2, '0')}:${ts.getMinutes().toString().padStart(2, '0')}:${ts.getSeconds().toString().padStart(2, '0')}`;

      return {
        id: e.id,
        source: eventSource(e.eventType, payload),
        target: eventTarget(e.eventType),
        type: e.eventType,
        timestamp: timeStr,
        data: eventSummary(e.eventType, payload),
      };
    });

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('[/api/events] Error fetching events:', error);
    return NextResponse.json([], { status: 200 });
  }
}
