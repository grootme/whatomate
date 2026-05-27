import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';
import { db } from '@/lib/db';

export async function GET() {
  // Fetch from external Cognitive API (Go backend) and local DB in parallel
  const [dashboard, cognitiveEntities, cognitiveDecisions, cognitiveSummaries, messages, entityRelations, patterns] = await Promise.all([
    fetchService<Record<string, unknown>>('cognitive', '/dashboard'),
    fetchService<unknown[]>('cognitive', '/entities'),
    fetchService<unknown[]>('cognitive', '/decisions'),
    fetchService<unknown[]>('cognitive', '/summaries'),
    // Local DB queries for data not available from the external Cognitive API
    db.rawMessage.findMany({
      where: { processed: true },
      orderBy: { timestamp: 'desc' },
      take: 50,
    }),
    db.entityRelation.findMany({
      take: 50,
    }),
    db.patternDetection.findMany({
      where: { status: { in: ['active', 'confirmed'] } },
      orderBy: { lastDetected: 'desc' },
      take: 20,
    }),
  ]);

  // Build stats from DB counts
  const [totalMessages, totalEntities, totalDecisions, totalPatterns] = await Promise.all([
    db.rawMessage.count(),
    db.entity.count(),
    db.alert.count({ where: { strategy: { in: ['threshold', 'pattern', 'risk_scoring', 'consensus', 'predictive', 'adaptive'] } } }),
    db.patternDetection.count(),
  ]);

  const stats = {
    totalMessages,
    totalEntities,
    totalDecisions,
    totalPatterns,
    totalResearchTasks: await db.prediction.count(),
    messagesGrowth: 0,
    entitiesGrowth: 0,
  };

  // Map messages from DB to the component's expected shape
  const mappedMessages = messages.map((m) => ({
    id: m.id,
    from: m.senderName || 'Unknown',
    text: m.content,
    timestamp: m.timestamp.toISOString(),
    channel: m.source === 'whatsapp' ? 'WhatsApp' : m.source === 'telegram' ? 'Telegram' : 'OSINT',
    entities: 0, // Will be computed from analysis
  }));

  // Map entities from external API, fallback to DB
  const mappedEntities = (cognitiveEntities.data ?? []).length > 0
    ? (cognitiveEntities.data as Array<Record<string, unknown>>).map((e, idx) => ({
        id: (e.id as string) || `e${idx}`,
        name: (e.name as string) || '',
        type: (e.type as string) || 'topic',
        relevance: (e.relevance as number) || 0,
        mentions: (e.mentions as number) || (e.mentionCount as number) || 0,
        lastSeen: (e.lastSeen as string) || '',
        properties: Array.isArray(e.properties) ? e.properties as string[] : [],
      }))
    : (await db.entity.findMany({ take: 50 })).map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type as 'person' | 'topic' | 'decision' | 'action_item' | 'project' | 'concept',
        relevance: e.riskScore / 100,
        mentions: e.mentionCount,
        lastSeen: e.lastSeen.toISOString(),
        properties: e.metadata ? (JSON.parse(e.metadata).properties ?? []) : [],
      }));

  // Map relationships from DB
  const mappedRelationships = entityRelations.map((r) => ({
    id: r.id,
    source: r.fromEntityId,
    target: r.toEntityId,
    type: r.relationType,
    strength: r.strength,
  }));

  // Map decisions from external API, fallback to DB alerts
  let mappedDecisions: Array<{
    id: string;
    title: string;
    maker: string;
    status: 'implemented' | 'pending' | 'overdue';
    priority: 'high' | 'medium' | 'low';
    date: string;
    context: string;
  }>;

  if ((cognitiveDecisions.data ?? []).length > 0) {
    mappedDecisions = (cognitiveDecisions.data as Array<Record<string, unknown>>).map((d, idx) => ({
      id: (d.id as string) || `d${idx}`,
      title: (d.title as string) || '',
      maker: (d.maker as string) || '',
      status: (d.status as 'implemented' | 'pending' | 'overdue') || 'pending',
      priority: (d.priority as 'high' | 'medium' | 'low') || 'medium',
      date: (d.date as string) || '',
      context: (d.context as string) || '',
    }));
  } else {
    const dbAlerts = await db.alert.findMany({
      orderBy: { timestamp: 'desc' },
      take: 20,
    });
    mappedDecisions = dbAlerts.map((a) => ({
      id: a.id,
      title: a.title,
      maker: a.source,
      status: a.acknowledged ? 'implemented' as const : a.escalated ? 'overdue' as const : 'pending' as const,
      priority: (a.severity === 'CRÍTICA' || a.severity === 'ALTA' ? 'high' : a.severity === 'MEDIA' ? 'medium' : 'low') as 'high' | 'medium' | 'low',
      date: a.timestamp.toISOString().split('T')[0],
      context: a.description,
    }));
  }

  // Map patterns from DB
  const mappedPatterns = patterns.map((p) => ({
    id: p.id,
    name: p.patternType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    description: p.description,
    confidence: p.confidence / 100,
    occurrences: p.occurrences,
    category: p.severity,
  }));

  // Map summaries from external API, fallback to empty
  const mappedSummaries = (cognitiveSummaries.data ?? []).length > 0
    ? (cognitiveSummaries.data as Array<Record<string, unknown>>).map((s, idx) => ({
        id: (s.id as string) || `s${idx}`,
        period: (s.period as 'daily' | 'weekly') || 'daily',
        date: (s.date as string) || '',
        insights: Array.isArray(s.insights) ? s.insights as string[] : [],
        actionItems: Array.isArray(s.actionItems) ? s.actionItems as string[] : [],
      }))
    : [];

  return NextResponse.json({
    stats,
    messages: mappedMessages,
    entities: mappedEntities,
    relationships: mappedRelationships,
    decisions: mappedDecisions,
    patterns: mappedPatterns,
    summaries: mappedSummaries,
    serviceStatus: {
      cognitive: !dashboard.error,
    },
  });
}
