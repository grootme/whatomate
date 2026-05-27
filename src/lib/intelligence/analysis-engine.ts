/**
 * Shared Analysis Engine — Single source of truth for message analysis.
 *
 * Eliminates duplication between /api/processing, /api/scheduler, and
 * /api/ingestion routes. All analysis logic lives here.
 *
 * RICCO Patterns:
 * - Strategy Pattern: Pluggable analysis pipelines
 * - Specification Pattern: Composable validation rules
 * - Event Sourcing: All state changes as events
 */

import { db } from '@/lib/db';
import { safeEventAppend } from './safe-event';
import { persistEvent } from './event-persist';
import type { EventStream } from './types';

// ===== SUSPICIOUS KEYWORDS (single definition) =====
export const SUSPICIOUS_KEYWORDS = [
  'fraude', 'estafa', 'scam', 'crypto', 'invertir', 'dinero',
  'ganancia', 'lucro', 'pirámide', 'ponzi', 'bitcoin', 'ethereum',
  'lavado', 'blanqueo', 'soborno', 'cohecho', 'corrupción',
  'falso', 'enganar', 'estafar', 'robo', 'hack',
] as const;

// ===== FRAUD KEYWORDS (subset used in ingestion for threshold updates) =====
export const FRAUD_KEYWORDS = ['fraude', 'estafa', 'scam', 'crypto', 'invertir', 'dinero'] as const;

// ===== ENTITY EXTRACTION PATTERNS =====
export const ENTITY_PATTERNS: Record<string, { type: string; patterns: RegExp[] }> = {
  person: {
    type: 'person',
    patterns: [
      /\b(?:Sr|Sra|Srta|Dr|Dra|Don|Doña)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,3}\b/g,
      /\b(?:llam[ao]|conocid[ao] como|alias)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/gi,
    ],
  },
  organization: {
    type: 'organization',
    patterns: [
      /\b(?:empresa|compañía|corporación|grupo|organización|fundación|asociación)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/gi,
      /\b[A-ZÁÉÍÓÚÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,}){0,3}\b/g,
    ],
  },
  location: {
    type: 'location',
    patterns: [
      /\b(?:en|desde|hacia|cerca de|zona de|región de)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,2}/gi,
    ],
  },
  crypto_wallet: {
    type: 'crypto_wallet',
    patterns: [
      /\b0x[a-fA-F0-9]{40}\b/g,
      /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g,
      /\bbc1[a-zA-HJ-NP-Z0-9]{25,90}\b/g,
    ],
  },
};

// ===== SENTIMENT SCORING =====

const NEGATIVE_WORDS = ['fraude', 'estafa', 'scam', 'peligro', 'alerta', 'robo', 'hurto', 'delito', 'crimen', 'muerte', 'amenaza', 'urgente', 'crítico'] as const;
const POSITIVE_WORDS = ['seguro', 'seguridad', 'protección', 'ayuda', 'apoyo', 'legal', 'justicia', 'confianza'] as const;

export function computeSentimentScore(content: string): number {
  const lower = content.toLowerCase();
  let score = 50; // neutral
  for (const w of NEGATIVE_WORDS) {
    if (lower.includes(w)) score -= 10;
  }
  for (const w of POSITIVE_WORDS) {
    if (lower.includes(w)) score += 5;
  }
  return Math.max(0, Math.min(100, score));
}

export function isContentSuspicious(content: string): boolean {
  const lower = content.toLowerCase();
  return SUSPICIOUS_KEYWORDS.some(kw => lower.includes(kw));
}

export function isFraudRelated(content: string): boolean {
  const lower = content.toLowerCase();
  return FRAUD_KEYWORDS.some(kw => lower.includes(kw));
}

// ===== ENTITY EXTRACTION =====

export interface ExtractedEntity {
  name: string;
  type: string;
  confidence: number;
}

export function extractEntities(content: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  for (const [, config] of Object.entries(ENTITY_PATTERNS)) {
    for (const pattern of config.patterns) {
      pattern.lastIndex = 0; // Reset for global regex
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match[0] && match[0].length > 2) {
          entities.push({
            name: match[0].trim(),
            type: config.type,
            confidence: config.type === 'crypto_wallet' ? 95 : 60,
          });
        }
      }
    }
  }

  return entities;
}

// ===== MESSAGE PROCESSING (unified) =====

export interface ProcessingResult {
  processed: number;
  suspiciousCount: number;
  entitiesUpdated: number;
  alertsGenerated: number;
  extractedEntities: ExtractedEntity[];
}

/**
 * Process a batch of unprocessed messages from the database.
 * Single implementation used by /api/processing and /api/scheduler.
 */
export async function processUnprocessedMessages(limit: number = 100): Promise<ProcessingResult> {
  const now = new Date();
  const unprocessed = await db.rawMessage.findMany({
    where: { processed: false },
    take: limit,
    orderBy: { timestamp: 'asc' },
  });

  if (unprocessed.length === 0) {
    return { processed: 0, suspiciousCount: 0, entitiesUpdated: 0, alertsGenerated: 0, extractedEntities: [] };
  }

  let suspiciousCount = 0;
  let entitiesUpdated = 0;
  const allExtractedEntities: ExtractedEntity[] = [];

  for (const msg of unprocessed) {
    const isSuspicious = isContentSuspicious(msg.content);
    const sentimentScore = computeSentimentScore(msg.content);

    if (isSuspicious) suspiciousCount++;

    // Entity extraction
    const extractedEntities = extractEntities(msg.content);
    allExtractedEntities.push(...extractedEntities);

    // Persist entities
    for (const entity of extractedEntities) {
      const existingEntity = await db.entity.findFirst({
        where: { name: entity.name, type: entity.type },
      });

      if (existingEntity) {
        const newRiskScore = Math.min(100, existingEntity.riskScore + (isSuspicious ? 15 : 5));
        const newRiskLevel = newRiskScore >= 90 ? 'critical' : newRiskScore >= 70 ? 'high' : newRiskScore >= 40 ? 'medium' : 'low';

        let platformIds: Record<string, string[]> = {};
        if (existingEntity.platformIds) {
          try { platformIds = JSON.parse(existingEntity.platformIds); } catch { platformIds = {}; }
        }

        await db.entity.update({
          where: { id: existingEntity.id },
          data: {
            riskScore: newRiskScore,
            riskLevel: newRiskLevel,
            mentionCount: existingEntity.mentionCount + 1,
            lastSeen: now,
            platformIds: JSON.stringify({
              ...platformIds,
              [msg.source]: [...new Set([
                ...(platformIds[msg.source] || []),
                msg.channelId,
              ].filter(Boolean))],
            }),
          },
        });

        // Create EntityRelation if suspicious content links to existing entity
        if (isSuspicious && msg.senderId) {
          const senderEntity = await db.entity.findFirst({
            where: { name: msg.senderName || '', type: 'person' },
          });
          if (senderEntity && senderEntity.id !== existingEntity.id) {
            const existingRelation = await db.entityRelation.findFirst({
              where: {
                fromEntityId: senderEntity.id,
                toEntityId: existingEntity.id,
                relationType: 'mentions',
              },
            });
            if (existingRelation) {
              await db.entityRelation.update({
                where: { id: existingRelation.id },
                data: {
                  strength: Math.min(1.0, existingRelation.strength + 0.1),
                  lastSeen: now,
                  evidence: JSON.stringify([...new Set([
                    ...(JSON.parse(existingRelation.evidence || '[]') as string[]),
                    msg.id,
                  ])]),
                },
              });
            } else {
              await db.entityRelation.create({
                data: {
                  fromEntityId: senderEntity.id,
                  toEntityId: existingEntity.id,
                  relationType: 'mentions',
                  strength: 0.3,
                  evidence: JSON.stringify([msg.id]),
                  firstSeen: now,
                  lastSeen: now,
                },
              });
            }
          }
        }
      } else {
        const initialRiskScore = isSuspicious ? 40 : 10;

        await db.entity.create({
          data: {
            name: entity.name,
            type: entity.type,
            riskScore: initialRiskScore,
            riskLevel: isSuspicious ? 'medium' : 'low',
            mentionCount: 1,
            lastSeen: now,
            platformIds: JSON.stringify({ [msg.source]: [msg.channelId].filter(Boolean) }),
            metadata: JSON.stringify({
              source: 'processing_pipeline',
              confidence: entity.confidence,
              firstSeenIn: msg.id,
              initialSentiment: sentimentScore,
            }),
          },
        });
      }
      entitiesUpdated++;
    }

    // Mark message as processed with sentiment score in metadata
    const existingMetadata = msg.metadata ? JSON.parse(msg.metadata) : {};
    await db.rawMessage.update({
      where: { id: msg.id },
      data: {
        processed: true,
        analyzedAt: now,
        metadata: JSON.stringify({ ...existingMetadata, sentimentScore, suspicious: isSuspicious }),
      },
    });
  }

  // Emit processing event
  const batchId = `analysis_batch_${Date.now()}`;
  const stream: EventStream = 'whatomate:analyzed_messages';

  safeEventAppend(stream, {
    eventType: 'analysis.semantic_completed',
    aggregateId: batchId,
    aggregateType: 'message',
    payload: {
      processedCount: unprocessed.length,
      suspiciousCount,
      entitiesUpdated,
      extractedEntityCount: allExtractedEntities.length,
    },
  });

  await persistEvent(stream, {
    eventType: 'analysis.semantic_completed',
    aggregateId: batchId,
    aggregateType: 'message',
    payload: {
      processedCount: unprocessed.length,
      suspiciousCount,
      entitiesUpdated,
      extractedEntityCount: allExtractedEntities.length,
    },
  });

  // Update analysis agent states
  const analysisAgents = ['ana-sem', 'ana-pat', 'ana-cro', 'ana-ris'];
  for (const agentId of analysisAgents) {
    const agentState = await db.agentState.findUnique({ where: { agentId } });
    if (agentState) {
      await db.agentState.update({
        where: { agentId },
        data: {
          status: 'active',
          lastHeartbeat: now,
          messagesProcessed: agentState.messagesProcessed + unprocessed.length,
          health: Math.min(100, agentState.health + 1),
        },
      });
    }
  }

  // Update threshold currentValues
  await updateThresholdValues(suspiciousCount);

  return {
    processed: unprocessed.length,
    suspiciousCount,
    entitiesUpdated,
    alertsGenerated: 0, // Alerts generated by strategy evaluation, not processing
    extractedEntities: allExtractedEntities,
  };
}

// ===== THRESHOLD VALUE UPDATES =====

/**
 * Update threshold currentValue for all metrics that can be computed from DB data.
 */
export async function updateThresholdValues(suspiciousCount?: number): Promise<void> {
  const now = new Date();

  // Fraud mentions per hour
  if (suspiciousCount !== undefined && suspiciousCount > 0) {
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const allRecentMessages = await db.rawMessage.findMany({
      where: { timestamp: { gte: oneHourAgo } },
      select: { content: true },
    });
    const actualSuspiciousCount = allRecentMessages.filter(m =>
      FRAUD_KEYWORDS.some(kw => m.content.toLowerCase().includes(kw))
    ).length;

    const fraudThreshold = await db.thresholdConfig.findFirst({
      where: { metric: 'fraud_mentions_per_hour' },
    });
    if (fraudThreshold) {
      await db.thresholdConfig.update({
        where: { id: fraudThreshold.id },
        data: { currentValue: actualSuspiciousCount },
      });
    }
  }

  // Suspicious messages (unprocessed count)
  const suspiciousThreshold = await db.thresholdConfig.findFirst({
    where: { metric: 'suspicious_messages' },
  });
  if (suspiciousThreshold) {
    const totalUnprocessed = await db.rawMessage.count({
      where: { processed: false },
    });
    await db.thresholdConfig.update({
      where: { id: suspiciousThreshold.id },
      data: { currentValue: totalUnprocessed },
    });
  }

  // Inactive group activity (compare current activity to historical average)
  const inactiveThreshold = await db.thresholdConfig.findFirst({
    where: { metric: 'inactive_group_activity' },
  });
  if (inactiveThreshold) {
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [recentActivity, dailyActivity] = await Promise.all([
      db.rawMessage.count({ where: { timestamp: { gte: oneHourAgo } } }),
      db.rawMessage.count({ where: { timestamp: { gte: twentyFourHoursAgo } } }),
    ]);

    const hourlyAverage = dailyActivity / 24;
    const activityMultiplier = hourlyAverage > 0 ? recentActivity / hourlyAverage : 0;

    await db.thresholdConfig.update({
      where: { id: inactiveThreshold.id },
      data: { currentValue: Math.round(activityMultiplier * 10) / 10 },
    });
  }
}
