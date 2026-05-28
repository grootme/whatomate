/**
 * Cross-Platform Correlation Engine — Single source of truth for cross-platform analysis.
 *
 * Analyzes entities and messages across WhatsApp, Telegram, and OSINT to find
 * connections, create EntityRelations, and identify cross-platform patterns.
 *
 * RICCO Patterns:
 * - Event Sourcing: All correlation results persisted as events
 * - Specification Pattern: Composable similarity and matching rules
 * - Strategy Pattern: Pluggable correlation strategies
 */

import { db } from '@/lib/db';
import { persistEvent } from './event-persist';
import type { EventStream } from './types';

// ===== STRING SIMILARITY =====

/**
 * Jaccard similarity coefficient based on character-level set intersection/union.
 * Returns a value between 0 (completely dissimilar) and 1 (identical).
 */
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(''));
  const setB = new Set(b.toLowerCase().split(''));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

// ===== THRESHOLDS =====

/** Minimum Jaccard similarity to consider two entity names as potentially matching */
const NAME_SIMILARITY_THRESHOLD = 0.65;

/** Minimum number of platforms an entity must appear on to be considered cross-platform */
const CROSS_PLATFORM_MIN_SOURCES = 2;

/** How far back (in hours) to look for entities and messages */
const LOOKBACK_HOURS = 24;

// ===== RESULT TYPES =====

export interface CrossPlatformGroup {
  name: string;
  sources: string[];
}

export interface CorrelateEntitiesResult {
  relationsCreated: number;
  entitiesUpdated: number;
  crossPlatformGroups: CrossPlatformGroup[];
}

export interface CorrelatePatternsResult {
  patternsUpdated: number;
  crossPlatformDetections: number;
}

export interface FullCorrelationResult extends CorrelateEntitiesResult, CorrelatePatternsResult {
  correlationId: string;
  timestamp: string;
}

// ===== HELPER: Parse platformIds from JSON =====

function parsePlatformIds(raw: string | null): Record<string, string[]> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string[]>;
  } catch {
    return {};
  }
}

// ===== HELPER: Parse JSON array field =====

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

// ===== CORRELATE ENTITIES =====

/**
 * Analyze entities across platforms to find cross-platform connections.
 *
 * 1. Fetches entities from last 24h with mentionCount > 1
 * 2. Groups entities with similar names (Jaccard similarity)
 * 3. Creates 'communicates_with' relations for entities across platforms
 * 4. Creates 'mentions' relations for entities co-mentioned in messages
 * 5. Updates entity platformIds to reflect cross-platform presence
 */
export async function correlateEntities(): Promise<CorrelateEntitiesResult> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);

  let relationsCreated = 0;
  let entitiesUpdated = 0;
  const crossPlatformGroups: CrossPlatformGroup[] = [];

  // --- Step 1: Fetch candidate entities (last 24h, mentionCount > 1) ---
  const entities = await db.entity.findMany({
    where: {
      lastSeen: { gte: cutoff },
      mentionCount: { gt: 1 },
    },
    orderBy: { mentionCount: 'desc' },
  });

  if (entities.length === 0) {
    return { relationsCreated: 0, entitiesUpdated: 0, crossPlatformGroups: [] };
  }

  // --- Step 2: Find similar-name entity pairs across platforms ---
  // Group entities by similarity clusters
  const visited = new Set<string>();
  const similarityGroups: Array<{ primary: typeof entities[0]; matches: typeof entities }> = [];

  for (let i = 0; i < entities.length; i++) {
    if (visited.has(entities[i].id)) continue;
    visited.add(entities[i].id);

    const group = { primary: entities[i], matches: [entities[i]] };

    for (let j = i + 1; j < entities.length; j++) {
      if (visited.has(entities[j].id)) continue;

      const similarity = jaccardSimilarity(entities[i].name, entities[j].name);

      // Also check partial match: one name contains the other
      const partialMatch =
        entities[i].name.toLowerCase().includes(entities[j].name.toLowerCase()) ||
        entities[j].name.toLowerCase().includes(entities[i].name.toLowerCase());

      // Also check aliases
      const aliasesI = parseJsonArray(entities[i].aliases);
      const aliasesJ = parseJsonArray(entities[j].aliases);
      const aliasMatch =
        aliasesI.some(a => jaccardSimilarity(a, entities[j].name) >= NAME_SIMILARITY_THRESHOLD) ||
        aliasesJ.some(a => jaccardSimilarity(a, entities[i].name) >= NAME_SIMILARITY_THRESHOLD);

      if (similarity >= NAME_SIMILARITY_THRESHOLD || partialMatch || aliasMatch) {
        visited.add(entities[j].id);
        group.matches.push(entities[j]);
      }
    }

    if (group.matches.length > 1) {
      similarityGroups.push(group);
    }
  }

  // --- Step 3: Process similarity groups for cross-platform relations ---
  for (const group of similarityGroups) {
    // Collect all unique sources across the group
    const allSources = new Set<string>();
    const mergedPlatformIds: Record<string, string[]> = {};

    for (const entity of group.matches) {
      const pids = parsePlatformIds(entity.platformIds);
      for (const [source, ids] of Object.entries(pids)) {
        allSources.add(source);
        mergedPlatformIds[source] = [
          ...new Set([...(mergedPlatformIds[source] || []), ...ids]),
        ];
      }
    }

    // If the group spans multiple platforms, create cross-platform relations
    if (allSources.size >= CROSS_PLATFORM_MIN_SOURCES) {
      crossPlatformGroups.push({
        name: group.primary.name,
        sources: Array.from(allSources),
      });

      // Create 'communicates_with' relations between entities in the group
      for (let i = 0; i < group.matches.length; i++) {
        for (let j = i + 1; j < group.matches.length; j++) {
          const fromId = group.matches[i].id;
          const toId = group.matches[j].id;

          // Check if relation already exists (in either direction)
          const existingRelation = await db.entityRelation.findFirst({
            where: {
              OR: [
                { fromEntityId: fromId, toEntityId: toId, relationType: 'communicates_with' },
                { fromEntityId: toId, toEntityId: fromId, relationType: 'communicates_with' },
              ],
            },
          });

          if (!existingRelation) {
            await db.entityRelation.create({
              data: {
                fromEntityId: fromId,
                toEntityId: toId,
                relationType: 'communicates_with',
                strength: 0.6,
                evidence: JSON.stringify([`cross_platform_correlation_${now.toISOString()}`]),
                firstSeen: now,
                lastSeen: now,
              },
            });
            relationsCreated++;
          } else {
            // Strengthen existing relation
            await db.entityRelation.update({
              where: { id: existingRelation.id },
              data: {
                strength: Math.min(1.0, existingRelation.strength + 0.05),
                lastSeen: now,
              },
            });
          }
        }
      }

      // Update all entities in the group with merged platformIds
      for (const entity of group.matches) {
        const existingPids = parsePlatformIds(entity.platformIds);
        const merged = { ...existingPids };

        for (const [source, ids] of Object.entries(mergedPlatformIds)) {
          merged[source] = [...new Set([...(merged[source] || []), ...ids])];
        }

        await db.entity.update({
          where: { id: entity.id },
          data: {
            platformIds: JSON.stringify(merged),
            lastSeen: now,
          },
        });
        entitiesUpdated++;
      }
    }
  }

  // --- Step 4: Create 'mentions' relations for entities co-mentioned in the same message ---
  // Fetch recent messages and check for co-occurrence of entity names
  const recentMessages = await db.rawMessage.findMany({
    where: {
      timestamp: { gte: cutoff },
      processed: true,
    },
    select: {
      id: true,
      content: true,
      source: true,
    },
    take: 500,
    orderBy: { timestamp: 'desc' },
  });

  // Build a map of entity names (lowercase) to entity IDs for fast lookup
  const entityNameMap = new Map<string, { id: string; name: string }[]>();
  for (const entity of entities) {
    const lower = entity.name.toLowerCase();
    if (!entityNameMap.has(lower)) {
      entityNameMap.set(lower, []);
    }
    entityNameMap.get(lower)!.push({ id: entity.id, name: entity.name });

    // Also map aliases
    const aliases = parseJsonArray(entity.aliases);
    for (const alias of aliases) {
      const aliasLower = alias.toLowerCase();
      if (!entityNameMap.has(aliasLower)) {
        entityNameMap.set(aliasLower, []);
      }
      entityNameMap.get(aliasLower)!.push({ id: entity.id, name: entity.name });
    }
  }

  // For each message, find which entities are mentioned together
  for (const msg of recentMessages) {
    const contentLower = msg.content.toLowerCase();
    const mentionedEntities: Array<{ id: string; name: string }> = [];

    for (const [nameKey, entityRefs] of entityNameMap) {
      if (contentLower.includes(nameKey)) {
        // Use the first matching entity ref for this name
        if (entityRefs.length > 0 && !mentionedEntities.some(e => e.id === entityRefs[0].id)) {
          mentionedEntities.push(entityRefs[0]);
        }
      }
    }

    // Create 'mentions' relations between co-mentioned entities
    if (mentionedEntities.length >= 2) {
      for (let i = 0; i < mentionedEntities.length; i++) {
        for (let j = i + 1; j < mentionedEntities.length; j++) {
          if (mentionedEntities[i].id === mentionedEntities[j].id) continue;

          const existingRelation = await db.entityRelation.findFirst({
            where: {
              OR: [
                {
                  fromEntityId: mentionedEntities[i].id,
                  toEntityId: mentionedEntities[j].id,
                  relationType: 'mentions',
                },
                {
                  fromEntityId: mentionedEntities[j].id,
                  toEntityId: mentionedEntities[i].id,
                  relationType: 'mentions',
                },
              ],
            },
          });

          if (!existingRelation) {
            await db.entityRelation.create({
              data: {
                fromEntityId: mentionedEntities[i].id,
                toEntityId: mentionedEntities[j].id,
                relationType: 'mentions',
                strength: 0.4,
                evidence: JSON.stringify([msg.id]),
                firstSeen: now,
                lastSeen: now,
              },
            });
            relationsCreated++;
          } else {
            // Update existing relation: add this message as evidence and strengthen
            const existingEvidence = parseJsonArray(existingRelation.evidence);
            const updatedEvidence = [...new Set([...existingEvidence, msg.id])].slice(-50); // Keep last 50 evidence IDs

            await db.entityRelation.update({
              where: { id: existingRelation.id },
              data: {
                strength: Math.min(1.0, existingRelation.strength + 0.05),
                evidence: JSON.stringify(updatedEvidence),
                lastSeen: now,
              },
            });
          }
        }
      }
    }
  }

  return { relationsCreated, entitiesUpdated, crossPlatformGroups };
}

// ===== CORRELATE PATTERNS =====

/**
 * Analyze active PatternDetections for cross-platform evidence.
 *
 * 1. Fetches active PatternDetections
 * 2. For each pattern, looks at recent messages matching its keywords/type
 * 3. Checks if the pattern manifests across multiple sources
 * 4. Updates pattern occurrences and confidence if cross-platform evidence found
 */
export async function correlatePatterns(): Promise<CorrelatePatternsResult> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);

  let patternsUpdated = 0;
  let crossPlatformDetections = 0;

  // --- Step 1: Fetch active patterns ---
  const activePatterns = await db.patternDetection.findMany({
    where: {
      status: { in: ['active', 'investigating'] },
    },
    orderBy: { lastDetected: 'desc' },
  });

  if (activePatterns.length === 0) {
    return { patternsUpdated: 0, crossPlatformDetections: 0 };
  }

  // --- Step 2: Define keyword sets per pattern type ---
  const PATTERN_KEYWORDS: Record<string, string[]> = {
    fraud_multichannel: ['fraude', 'estafa', 'scam', 'crypto', 'invertir', 'dinero', 'ganancia', 'pirámide', 'ponzi'],
    money_laundering: ['lavado', 'blanqueo', 'soborno', 'cohecho', 'corrupción', 'transferir', 'crypto', 'bitcoin'],
    disinformation: ['falso', 'fake', 'engaño', 'manipulación', 'desinformación', 'rumor', 'propaganda'],
    crypto_manipulation: ['crypto', 'bitcoin', 'ethereum', 'pump', 'dump', 'manipulación', 'esquema'],
    irregular_migration: ['migración', 'irregular', 'tráfico', 'trata', 'coyote', 'pasaje', 'ilegal', 'frontera'],
  };

  // --- Step 3: For each pattern, check for cross-platform evidence ---
  for (const pattern of activePatterns) {
    const keywords = PATTERN_KEYWORDS[pattern.patternType] || [];
    if (keywords.length === 0) continue;

    // Fetch recent messages that match pattern keywords
    // We need to check messages from each source separately
    const sources = ['whatsapp', 'telegram', 'osint'];
    const sourceEvidence: Record<string, string[]> = {};

    for (const source of sources) {
      const matchingMessages = await db.rawMessage.findMany({
        where: {
          source,
          timestamp: { gte: cutoff },
          processed: true,
        },
        select: {
          id: true,
          content: true,
        },
        take: 200,
      });

      // Filter messages that contain at least one keyword
      const matchedIds = matchingMessages
        .filter(msg => {
          const contentLower = msg.content.toLowerCase();
          return keywords.some(kw => contentLower.includes(kw));
        })
        .map(msg => msg.id);

      if (matchedIds.length > 0) {
        sourceEvidence[source] = matchedIds;
      }
    }

    // Check if the pattern manifests across multiple sources
    const activeSources = Object.keys(sourceEvidence);
    const isCrossPlatform = activeSources.length >= CROSS_PLATFORM_MIN_SOURCES;

    if (isCrossPlatform) {
      crossPlatformDetections++;

      // Merge all evidence IDs
      const allEvidenceIds = Object.values(sourceEvidence).flat();
      const existingEvidenceIds = parseJsonArray(pattern.evidenceIds);
      const mergedEvidenceIds = [...new Set([...existingEvidenceIds, ...allEvidenceIds])].slice(-100);

      // Boost confidence for cross-platform detection
      const confidenceBoost = activeSources.length * 5; // +5% per additional source
      const newConfidence = Math.min(100, pattern.confidence + confidenceBoost);

      // Increase occurrences
      const newOccurrences = pattern.occurrences + activeSources.length;

      // Update existing entity IDs if relevant
      const existingEntityIds = parseJsonArray(pattern.entityIds);

      await db.patternDetection.update({
        where: { id: pattern.id },
        data: {
          confidence: newConfidence,
          occurrences: newOccurrences,
          evidenceIds: JSON.stringify(mergedEvidenceIds),
          entityIds: existingEntityIds.length > 0 ? pattern.entityIds : undefined,
          lastDetected: now,
          // Upgrade status if confidence is high enough and still active
          status: pattern.status === 'active' && newConfidence >= 80 ? 'confirmed' : pattern.status,
        },
      });

      patternsUpdated++;
    } else if (activeSources.length === 1) {
      // Single platform: still update occurrences but with smaller boost
      const evidenceIds = sourceEvidence[activeSources[0]];
      const existingEvidenceIds = parseJsonArray(pattern.evidenceIds);
      const mergedEvidenceIds = [...new Set([...existingEvidenceIds, ...evidenceIds])].slice(-100);

      await db.patternDetection.update({
        where: { id: pattern.id },
        data: {
          occurrences: pattern.occurrences + 1,
          evidenceIds: JSON.stringify(mergedEvidenceIds),
          lastDetected: now,
        },
      });

      patternsUpdated++;
    }
  }

  return { patternsUpdated, crossPlatformDetections };
}

// ===== FULL CORRELATION RUN =====

/**
 * Execute a full correlation analysis: entities then patterns.
 * Persists a correlation event and updates the 'ana-cro' agent state.
 */
export async function runFullCorrelation(): Promise<FullCorrelationResult> {
  const now = new Date();
  const correlationId = `correlation_${Date.now()}`;

  // Step 1: Correlate entities
  const entityResult = await correlateEntities();

  // Step 2: Correlate patterns
  const patternResult = await correlatePatterns();

  // Step 3: Persist correlation event
  const stream: EventStream = 'whatomate:intel_events';
  await persistEvent(stream, {
    eventType: 'analysis.correlation_found',
    aggregateId: correlationId,
    aggregateType: 'entity',
    payload: {
      relationsCreated: entityResult.relationsCreated,
      entitiesUpdated: entityResult.entitiesUpdated,
      crossPlatformGroups: entityResult.crossPlatformGroups,
      patternsUpdated: patternResult.patternsUpdated,
      crossPlatformDetections: patternResult.crossPlatformDetections,
    },
    metadata: {
      source: 'correlation-engine',
      agentId: 'ana-cro',
      lookbackHours: LOOKBACK_HOURS,
    },
  });

  // Step 4: Update agent state for 'ana-cro' (Cross-Platform Correlator)
  const agentState = await db.agentState.findUnique({ where: { agentId: 'ana-cro' } });

  const totalRelations = entityResult.relationsCreated + patternResult.crossPlatformDetections;
  const healthScore = Math.min(100, 60 + Math.min(40, totalRelations * 5));

  if (agentState) {
    await db.agentState.update({
      where: { agentId: 'ana-cro' },
      data: {
        status: 'active',
        health: healthScore,
        lastHeartbeat: now,
        messagesProcessed: agentState.messagesProcessed + totalRelations,
      },
    });
  } else {
    await db.agentState.create({
      data: {
        agentId: 'ana-cro',
        name: 'Cross-Platform Correlator',
        layer: 2,
        layerName: 'Análisis',
        status: 'active',
        health: healthScore,
        messagesProcessed: totalRelations,
        lastHeartbeat: now,
        startedAt: now,
      },
    });
  }

  return {
    correlationId,
    timestamp: now.toISOString(),
    ...entityResult,
    ...patternResult,
  };
}
