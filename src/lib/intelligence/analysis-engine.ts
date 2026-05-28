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

// ===== SUSPICIOUS KEYWORDS (multi-language: Spanish, English, Portuguese, French) =====
export const SUSPICIOUS_KEYWORDS = [
  // Spanish
  'fraude', 'estafa', 'scam', 'crypto', 'invertir', 'dinero',
  'ganancia', 'lucro', 'pirámide', 'ponzi', 'bitcoin', 'ethereum',
  'lavado', 'blanqueo', 'soborno', 'cohecho', 'corrupción',
  'falso', 'enganar', 'estafar', 'robo', 'hack',
  // English
  'fraud', 'scam', 'scammer', 'investment', 'money', 'profit',
  'pyramid', 'ponzi', 'laundering', 'bribe', 'corruption',
  'fake', 'cheat', 'steal', 'theft', 'hack', 'phishing',
  'ransomware', 'extortion', 'counterfeit',
  // Portuguese
  'fraude', 'golpe', 'golpista', 'investimento', 'dinheiro',
  'lucro', 'pirâmide', 'lavagem', 'suborno', 'corrupção',
  'falsificação', 'roubo', 'extorsão',
  // French
  'fraude', 'arnaque', 'escroquerie', 'investissement', 'argent',
  'profit', 'pyramide', 'blanchiment', 'corruption', 'contrefaçon',
  'vol', 'extorsion',
] as const;

// ===== FRAUD KEYWORDS (subset used in ingestion for threshold updates) =====
export const FRAUD_KEYWORDS = [
  'fraude', 'estafa', 'scam', 'crypto', 'invertir', 'dinero',
  'fraud', 'investment', 'money', 'profit', 'phishing',
  'golpe', 'investimento', 'dinheiro',
  'arnaque', 'investissement', 'argent',
] as const;

// ===== LAUNDERING KEYWORDS (for money laundering pattern detection) =====
export const LAUNDERING_KEYWORDS = [
  'lavado', 'blanqueo', 'soborno', 'crypto', 'bitcoin',
  'laundering', 'bribe', 'cryptocurrency',
  'lavagem', 'suborno',
  'blanchiment', 'corruption',
] as const;

// ===== MIGRATION KEYWORDS (for irregular migration pattern detection) =====
export const MIGRATION_KEYWORDS = [
  'migración', 'coyote', 'frontera', 'tráfico',
  'migration', 'smuggling', 'border', 'trafficking', 'coyote',
  'migração', 'contrabando', 'fronteira', 'tráfico',
  'migration', 'contrebande', 'frontière', 'trafic',
] as const;

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

// ===== SENTIMENT SCORING (multi-language) =====

const NEGATIVE_WORDS = [
  // Spanish
  'fraude', 'estafa', 'peligro', 'alerta', 'robo', 'hurto', 'delito', 'crimen', 'muerte', 'amenaza', 'urgente', 'crítico',
  // English
  'fraud', 'danger', 'alert', 'theft', 'crime', 'death', 'threat', 'urgent', 'critical', 'attack', 'breach', 'exploit',
  // Portuguese
  'perigo', 'alerta', 'roubo', 'crime', 'morte', 'ameaça', 'urgente', 'crítico',
  // French
  'danger', 'alerte', 'vol', 'crime', 'mort', 'menace', 'urgent', 'critique',
] as const;

const POSITIVE_WORDS = [
  // Spanish
  'seguro', 'seguridad', 'protección', 'ayuda', 'apoyo', 'legal', 'justicia', 'confianza',
  // English
  'safe', 'security', 'protection', 'help', 'support', 'legal', 'justice', 'trust', 'verified', 'legitimate',
  // Portuguese
  'seguro', 'segurança', 'proteção', 'ajuda', 'legal', 'justiça', 'confiança',
  // French
  'sûr', 'sécurité', 'protection', 'aide', 'légal', 'justice', 'confiance',
] as const;

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

  // Proactive pattern detection — create/update PatternDetection records
  await detectAndCreatePatterns();

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

// ===== PROACTIVE PATTERN DETECTION =====

/** Helper: parse a JSON array field from a PatternDetection record */
function parseJsonArrayField(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; }
  catch { return []; }
}

/** Helper: upsert a PatternDetection — create if not found, update if exists */
async function upsertPattern(params: {
  patternType: string;
  entityIds: string[];
  evidenceIds: string[];
  description: string;
  severity: string;
  confidence: number;
}): Promise<{ id: string; isNew: boolean }> {
  const now = new Date();

  // Check if a pattern of the same type with overlapping entities already exists
  // We look for any active/investigating pattern of the same type and match by entityIds overlap
  const existingPattern = await db.patternDetection.findFirst({
    where: {
      patternType: params.patternType,
      status: { in: ['active', 'investigating'] },
    },
    orderBy: { lastDetected: 'desc' },
  });

  // Verify entity overlap if an existing pattern was found
  if (existingPattern) {
    const existingEntityIds = parseJsonArrayField(existingPattern.entityIds);
    const hasOverlap = params.entityIds.length === 0 ||
      params.entityIds.some(eid => existingEntityIds.includes(eid)) ||
      existingEntityIds.length === 0;

    if (hasOverlap) {
      // UPDATE existing pattern
      const mergedEntityIds = [...new Set([...existingEntityIds, ...params.entityIds])];
      const mergedEvidenceIds = [...new Set([
        ...parseJsonArrayField(existingPattern.evidenceIds),
        ...params.evidenceIds,
      ])].slice(-100);

      const newConfidence = Math.min(95, Math.max(existingPattern.confidence, params.confidence) + 5);
      const newOccurrences = existingPattern.occurrences + 1;

      // Upgrade severity if warranted
      const severityOrder = ['INFO', 'BAJA', 'MEDIA', 'ALTA', 'CRÍTICA'] as const;
      const existingIdx = severityOrder.indexOf(existingPattern.severity as typeof severityOrder[number]);
      const newIdx = severityOrder.indexOf(params.severity as typeof severityOrder[number]);
      const upgradedSeverity = newIdx > existingIdx ? params.severity : existingPattern.severity;

      await db.patternDetection.update({
        where: { id: existingPattern.id },
        data: {
          confidence: newConfidence,
          occurrences: newOccurrences,
          severity: upgradedSeverity,
          description: params.description,
          entityIds: JSON.stringify(mergedEntityIds),
          evidenceIds: JSON.stringify(mergedEvidenceIds),
          lastDetected: now,
          status: newConfidence >= 80 ? 'confirmed' : existingPattern.status,
        },
      });

      return { id: existingPattern.id, isNew: false };
    }
  }

  // CREATE new pattern
  const newPattern = await db.patternDetection.create({
    data: {
      patternType: params.patternType,
      severity: params.severity,
      confidence: params.confidence,
      description: params.description,
      entityIds: JSON.stringify(params.entityIds),
      evidenceIds: JSON.stringify(params.evidenceIds),
      occurrences: 1,
      status: 'active',
      firstDetected: now,
      lastDetected: now,
    },
  });

  return { id: newPattern.id, isNew: true };
}

/** Helper: emit a pattern_detected event via both safeEventAppend and persistEvent */
async function emitPatternEvent(patternId: string, patternType: string, isNew: boolean, details: Record<string, unknown>): Promise<void> {
  const stream: EventStream = 'whatomate:patterns';

  const eventData = {
    eventType: 'analysis.pattern_detected' as const,
    aggregateId: patternId,
    aggregateType: 'pattern' as const,
    payload: {
      patternType,
      patternId,
      isNew,
      ...details,
    },
  };

  safeEventAppend(stream, eventData);
  await persistEvent(stream, eventData);
}

/**
 * Proactive pattern detection — scans recently processed messages and entities
 * to CREATE new PatternDetection records (or update existing ones).
 *
 * This is the missing piece: the system previously only UPDATED patterns during
 * correlation, but never proactively CREATED them from analyzed messages.
 *
 * Called at the end of processUnprocessedMessages().
 */
export async function detectAndCreatePatterns(): Promise<void> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  // Fetch recently processed messages for analysis
  const recentMessages = await db.rawMessage.findMany({
    where: {
      processed: true,
      timestamp: { gte: twentyFourHoursAgo },
    },
    select: {
      id: true,
      content: true,
      source: true,
      senderId: true,
      senderName: true,
      timestamp: true,
    },
    orderBy: { timestamp: 'desc' },
    take: 500,
  });

  if (recentMessages.length === 0) return;

  // ─── 1. FRAUD MULTI-CHANNEL DETECTION ───
  // Suspicious messages from 2+ different sources within 24h
  {
    const fraudMessages = recentMessages.filter(msg => isContentSuspicious(msg.content));
    const sourceMap = new Map<string, { ids: string[]; count: number }>();

    for (const msg of fraudMessages) {
      const entry = sourceMap.get(msg.source) || { ids: [], count: 0 };
      entry.ids.push(msg.id);
      entry.count++;
      sourceMap.set(msg.source, entry);
    }

    const sources = Array.from(sourceMap.keys());
    if (sources.length >= 2) {
      const totalFraudMsgs = fraudMessages.length;
      const evidenceIds = fraudMessages.map(m => m.id);

      // Collect entity IDs from fraud messages
      const fraudEntityIds: string[] = [];
      for (const msg of fraudMessages) {
        if (msg.senderId) {
          const senderEntity = await db.entity.findFirst({
            where: { name: msg.senderName || '', type: 'person' },
            select: { id: true },
          });
          if (senderEntity) fraudEntityIds.push(senderEntity.id);
        }
      }

      // Confidence: base 60%, +10% per source beyond 2, +5% per 5 messages
      const confidence = Math.min(95, 60 + (sources.length - 2) * 10 + Math.floor(totalFraudMsgs / 5) * 5);

      // Severity based on source diversity and message volume
      const severity = sources.length >= 3 && totalFraudMsgs >= 10 ? 'CRÍTICA'
        : sources.length >= 3 || totalFraudMsgs >= 5 ? 'ALTA'
        : totalFraudMsgs >= 3 ? 'MEDIA' : 'BAJA';

      const { id: patternId, isNew } = await upsertPattern({
        patternType: 'fraud_multichannel',
        entityIds: [...new Set(fraudEntityIds)],
        evidenceIds,
        description: `Fraude detectado en ${sources.length} fuentes (${sources.join(', ')}) con ${totalFraudMsgs} mensajes sospechosos en 24h`,
        severity,
        confidence,
      });

      await emitPatternEvent(patternId, 'fraud_multichannel', isNew, {
        sources,
        messageCount: totalFraudMsgs,
        sourceCount: sources.length,
        confidence,
        severity,
      });
    }
  }

  // ─── 2. MONEY LAUNDERING DETECTION ───
  // Messages with laundering keywords mentioning crypto_wallet or organization entities
  {
    const launderingMessages = recentMessages.filter(msg =>
      LAUNDERING_KEYWORDS.some(kw => msg.content.toLowerCase().includes(kw))
    );

    if (launderingMessages.length > 0) {
      // Find entities of type crypto_wallet or organization mentioned in these messages
      const relevantEntities = await db.entity.findMany({
        where: {
          type: { in: ['crypto_wallet', 'organization'] },
          lastSeen: { gte: twentyFourHoursAgo },
        },
        select: { id: true, name: true, type: true },
      });

      // Filter to entities whose names appear in laundering messages
      const implicatedEntities = relevantEntities.filter(entity =>
        launderingMessages.some(msg => msg.content.toLowerCase().includes(entity.name.toLowerCase()))
      );

      if (implicatedEntities.length > 0) {
        const entityIds = implicatedEntities.map(e => e.id);
        const evidenceIds = launderingMessages.map(m => m.id);
        const entityTypes = [...new Set(implicatedEntities.map(e => e.type))];

        // Confidence: base 60%, +10% per crypto_wallet entity, +5% per org entity, +5% per message
        const confidence = Math.min(95,
          60 +
          implicatedEntities.filter(e => e.type === 'crypto_wallet').length * 10 +
          implicatedEntities.filter(e => e.type === 'organization').length * 5 +
          Math.floor(launderingMessages.length / 3) * 5
        );

        const severity = entityTypes.includes('crypto_wallet') && launderingMessages.length >= 5 ? 'CRÍTICA'
          : entityTypes.includes('crypto_wallet') || launderingMessages.length >= 3 ? 'ALTA'
          : 'MEDIA';

        const { id: patternId, isNew } = await upsertPattern({
          patternType: 'money_laundering',
          entityIds,
          evidenceIds,
          description: `Potencial lavado de dinero: ${launderingMessages.length} mensajes con keywords de lavado mencionando ${implicatedEntities.length} entidades (${entityTypes.join(', ')})`,
          severity,
          confidence,
        });

        await emitPatternEvent(patternId, 'money_laundering', isNew, {
          entityCount: implicatedEntities.length,
          entityTypes,
          messageCount: launderingMessages.length,
          confidence,
          severity,
        });
      }
    }
  }

  // ─── 3. DISINFORMATION DETECTION ───
  // Same entity/phrase in 5+ messages from different senders within 6 hours
  {
    const recentSixHours = recentMessages.filter(msg => new Date(msg.timestamp) >= sixHoursAgo);

    // Count mentions per entity from different senders
    const entitySenderMap = new Map<string, { senders: Set<string>; messageIds: string[]; entityIds: string[] }>();

    // First, get all entities seen in the last 6h
    const recentEntities = await db.entity.findMany({
      where: { lastSeen: { gte: sixHoursAgo } },
      select: { id: true, name: true, type: true },
    });

    for (const entity of recentEntities) {
      for (const msg of recentSixHours) {
        if (msg.content.toLowerCase().includes(entity.name.toLowerCase())) {
          const entry = entitySenderMap.get(entity.name) || { senders: new Set<string>(), messageIds: [], entityIds: [] };
          if (msg.senderId) entry.senders.add(msg.senderId);
          if (msg.senderName) entry.senders.add(msg.senderName);
          entry.messageIds.push(msg.id);
          if (!entry.entityIds.includes(entity.id)) entry.entityIds.push(entity.id);
          entitySenderMap.set(entity.name, entry);
        }
      }
    }

    // Check for entities mentioned by 5+ different senders
    for (const [entityName, data] of entitySenderMap) {
      if (data.senders.size >= 5 && data.messageIds.length >= 5) {
        const confidence = Math.min(95, 60 + (data.senders.size - 5) * 5 + Math.floor(data.messageIds.length / 5) * 5);

        const severity = data.senders.size >= 10 ? 'CRÍTICA'
          : data.senders.size >= 7 ? 'ALTA'
          : 'MEDIA';

        const { id: patternId, isNew } = await upsertPattern({
          patternType: 'disinformation',
          entityIds: data.entityIds,
          evidenceIds: data.messageIds.slice(-100),
          description: `Posible desinformación: "${entityName}" mencionado en ${data.messageIds.length} mensajes por ${data.senders.size} remitentes distintos en 6h`,
          severity,
          confidence,
        });

        await emitPatternEvent(patternId, 'disinformation', isNew, {
          entityName,
          senderCount: data.senders.size,
          messageCount: data.messageIds.length,
          confidence,
          severity,
        });
      }
    }
  }

  // ─── 4. CRYPTO MANIPULATION DETECTION ───
  // Crypto-related messages spike above 3x normal volume
  {
    const CRYPTO_KEYWORDS = ['crypto', 'bitcoin', 'ethereum', 'pump', 'dump', 'token', 'defi', 'nft', 'minar', 'minería'];

    // Current hour crypto message count
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const currentCryptoMessages = recentMessages.filter(msg =>
      new Date(msg.timestamp) >= oneHourAgo &&
      CRYPTO_KEYWORDS.some(kw => msg.content.toLowerCase().includes(kw))
    );

    // Calculate "normal" volume: average hourly crypto messages over the previous 23 hours
    const twentyThreeHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const previousCryptoMessages = recentMessages.filter(msg => {
      const ts = new Date(msg.timestamp);
      return ts >= twentyThreeHoursAgo && ts < oneHourAgo &&
        CRYPTO_KEYWORDS.some(kw => msg.content.toLowerCase().includes(kw));
    });

    // Average per hour over the 23-hour baseline
    const normalHourlyVolume = previousCryptoMessages.length / 23;
    const currentHourlyVolume = currentCryptoMessages.length;
    const spikeRatio = normalHourlyVolume > 0 ? currentHourlyVolume / normalHourlyVolume : (currentHourlyVolume > 3 ? 3 : 0);

    if (spikeRatio >= 3 && currentHourlyVolume >= 3) {
      // Find crypto-related entities
      const cryptoEntities = await db.entity.findMany({
        where: {
          type: { in: ['crypto_wallet', 'organization'] },
          lastSeen: { gte: twentyFourHoursAgo },
        },
        select: { id: true, name: true },
        take: 20,
      });

      const cryptoEntityIds = cryptoEntities
        .filter(e => currentCryptoMessages.some(m => m.content.toLowerCase().includes(e.name.toLowerCase())))
        .map(e => e.id);

      const evidenceIds = currentCryptoMessages.map(m => m.id);
      const confidence = Math.min(95, 60 + Math.floor(spikeRatio) * 5 + Math.floor(currentHourlyVolume / 5) * 5);

      const severity = spikeRatio >= 6 && currentHourlyVolume >= 10 ? 'CRÍTICA'
        : spikeRatio >= 4 || currentHourlyVolume >= 7 ? 'ALTA'
        : 'MEDIA';

      const { id: patternId, isNew } = await upsertPattern({
        patternType: 'crypto_manipulation',
        entityIds: cryptoEntityIds,
        evidenceIds,
        description: `Manipulación crypto detectada: volumen ${spikeRatio.toFixed(1)}x sobre lo normal (${currentHourlyVolume} mensajes/hora vs promedio ${normalHourlyVolume.toFixed(1)}/hora)`,
        severity,
        confidence,
      });

      await emitPatternEvent(patternId, 'crypto_manipulation', isNew, {
        spikeRatio: Math.round(spikeRatio * 10) / 10,
        currentVolume: currentHourlyVolume,
        normalVolume: Math.round(normalHourlyVolume * 10) / 10,
        messageCount: currentHourlyVolume,
        confidence,
        severity,
      });
    }
  }

  // ─── 5. IRREGULAR MIGRATION DETECTION ───
  // Messages with migration keywords from multiple sources
  {
    const migrationMessages = recentMessages.filter(msg =>
      MIGRATION_KEYWORDS.some(kw => msg.content.toLowerCase().includes(kw))
    );

    if (migrationMessages.length > 0) {
      const sourceMap = new Map<string, { ids: string[]; count: number }>();

      for (const msg of migrationMessages) {
        const entry = sourceMap.get(msg.source) || { ids: [], count: 0 };
        entry.ids.push(msg.id);
        entry.count++;
        sourceMap.set(msg.source, entry);
      }

      const sources = Array.from(sourceMap.keys());

      if (sources.length >= 2) {
        // Find migration-related entities (locations, organizations)
        const migrationEntities = await db.entity.findMany({
          where: {
            type: { in: ['location', 'organization', 'person'] },
            lastSeen: { gte: twentyFourHoursAgo },
          },
          select: { id: true, name: true, type: true },
        });

        const implicatedEntityIds = migrationEntities
          .filter(e => migrationMessages.some(m => m.content.toLowerCase().includes(e.name.toLowerCase())))
          .map(e => e.id);

        const evidenceIds = migrationMessages.map(m => m.id);
        const confidence = Math.min(95, 60 + (sources.length - 2) * 10 + Math.floor(migrationMessages.length / 3) * 5);

        const severity = sources.length >= 3 && migrationMessages.length >= 10 ? 'CRÍTICA'
          : sources.length >= 3 || migrationMessages.length >= 5 ? 'ALTA'
          : migrationMessages.length >= 3 ? 'MEDIA' : 'BAJA';

        const { id: patternId, isNew } = await upsertPattern({
          patternType: 'irregular_migration',
          entityIds: [...new Set(implicatedEntityIds)],
          evidenceIds,
          description: `Migración irregular detectada: ${migrationMessages.length} mensajes con keywords de migración desde ${sources.length} fuentes (${sources.join(', ')}) en 24h`,
          severity,
          confidence,
        });

        await emitPatternEvent(patternId, 'irregular_migration', isNew, {
          sources,
          messageCount: migrationMessages.length,
          sourceCount: sources.length,
          confidence,
          severity,
        });
      }
    }
  }
}
