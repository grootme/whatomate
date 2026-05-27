/**
 * Strategy Context Builder — shared utility for constructing
 * StrategyContext from the current DB state.
 *
 * Used by ingestion, OSINT ingestion, processing, and scheduler
 * routes to avoid duplicating context-building logic.
 */

import { db } from '@/lib/db';
import type {
  StrategyContext,
  DecisionStrategy,
  RawMessage,
  Entity,
  PatternDetection,
  ThresholdConfig,
  Alert,
} from './types';

/**
 * Build a StrategyContext from the current state of the database.
 * Optionally accepts a list of recently-ingested messages to include
 * in the context even if they haven't been processed yet.
 */
export async function buildStrategyContext(
  extraMessages?: Array<{
    id: string;
    source: string;
    sourceId: string;
    channelName?: string | null;
    channelId?: string | null;
    senderName?: string | null;
    senderId?: string | null;
    content: string;
    contentHash?: string | null;
    timestamp: Date;
    processed: boolean;
    analyzedAt?: Date | null;
    metadata?: string | null;
  }>
): Promise<StrategyContext> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Fetch recent messages (last 24h, or include extras)
  const recentDbMessages = await db.rawMessage.findMany({
    where: { timestamp: { gte: oneDayAgo } },
    take: 100,
    orderBy: { timestamp: 'desc' },
  });

  const allMessages = extraMessages
    ? [...extraMessages, ...recentDbMessages.filter(m => !extraMessages.some(e => e.id === m.id))]
    : recentDbMessages;

  const recentEntities = await db.entity.findMany({
    where: { lastSeen: { gte: oneDayAgo } },
    take: 50,
  });

  const activePatterns = await db.patternDetection.findMany({
    where: { status: { in: ['active', 'confirmed'] } },
    take: 20,
  });

  const enabledThresholds = await db.thresholdConfig.findMany({
    where: { enabled: true },
  });

  const recentAlerts = await db.alert.findMany({
    orderBy: { timestamp: 'desc' },
    take: 20,
  });

  return {
    messages: allMessages.map(m => ({
      id: m.id,
      source: m.source as 'whatsapp' | 'telegram' | 'osint',
      sourceId: m.sourceId,
      channelName: m.channelName ?? undefined,
      channelId: m.channelId ?? undefined,
      senderName: m.senderName ?? undefined,
      senderId: m.senderId ?? undefined,
      content: m.content,
      contentHash: m.contentHash ?? undefined,
      timestamp: m.timestamp,
      processed: m.processed,
      analyzedAt: m.analyzedAt ?? undefined,
      metadata: m.metadata ? JSON.parse(m.metadata) : undefined,
    })),
    entities: recentEntities.map(e => ({
      id: e.id,
      name: e.name,
      type: e.type as 'person' | 'organization' | 'location' | 'crypto_wallet' | 'event',
      aliases: e.aliases ? JSON.parse(e.aliases) : undefined,
      riskScore: e.riskScore,
      riskLevel: e.riskLevel as 'low' | 'medium' | 'high' | 'critical',
      platformIds: e.platformIds ? JSON.parse(e.platformIds) : undefined,
      firstSeen: e.firstSeen,
      lastSeen: e.lastSeen,
      mentionCount: e.mentionCount,
      metadata: e.metadata ? JSON.parse(e.metadata) : undefined,
    })),
    patterns: activePatterns.map(p => ({
      id: p.id,
      patternType: p.patternType as 'fraud_multichannel' | 'money_laundering' | 'disinformation' | 'crypto_manipulation' | 'irregular_migration',
      severity: p.severity as 'CRÍTICA' | 'ALTA' | 'MEDIA' | 'BAJA' | 'INFO',
      confidence: p.confidence,
      description: p.description,
      evidenceIds: p.evidenceIds ? JSON.parse(p.evidenceIds) : undefined,
      entityIds: p.entityIds ? JSON.parse(p.entityIds) : undefined,
      detectionRate: p.detectionRate ?? undefined,
      occurrences: p.occurrences,
      status: p.status as 'active' | 'confirmed' | 'dismissed' | 'investigating',
      firstDetected: p.firstDetected,
      lastDetected: p.lastDetected,
    })),
    thresholds: enabledThresholds.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      metric: t.metric,
      condition: t.condition as 'gte' | 'lte' | 'eq' | 'gt' | 'lt',
      value: t.value,
      unit: t.unit,
      alertSeverity: t.alertSeverity as 'CRÍTICA' | 'ALTA' | 'MEDIA' | 'BAJA' | 'INFO',
      alertType: t.alertType,
      enabled: t.enabled,
      currentValue: t.currentValue,
      lastTriggered: t.lastTriggered ?? undefined,
    })),
    alerts: recentAlerts.map(a => ({
      id: a.id,
      source: a.source,
      severity: a.severity as 'CRÍTICA' | 'ALTA' | 'MEDIA' | 'BAJA' | 'INFO',
      title: a.title,
      description: a.description,
      actionTaken: a.actionTaken ?? undefined,
      strategy: a.strategy as DecisionStrategy,
      thresholdId: a.thresholdId ?? undefined,
      patternId: a.patternId ?? undefined,
      riskId: a.riskId ?? undefined,
      acknowledged: a.acknowledged,
      acknowledgedBy: a.acknowledgedBy ?? undefined,
      acknowledgedAt: a.acknowledgedAt ?? undefined,
      escalated: a.escalated,
      relatedEvents: a.relatedEvents ? JSON.parse(a.relatedEvents) : undefined,
      timestamp: a.timestamp,
    })),
  };
}
