/**
 * Innovation 10: Cross-Platform Entity Resolution
 *
 * Implements entity deduplication and resolution across platforms.
 * When the same real-world entity appears on WhatsApp, Telegram,
 * and OSINT with different names/IDs, this module resolves them
 * into a single unified entity.
 *
 * Resolution Strategy:
 * 1. Fetch all entities from the database
 * 2. Group by type (only resolve within same type)
 * 3. For each group, compute similarity using:
 *    - Exact name match
 *    - Jaccard similarity >= 0.65
 *    - Alias overlap
 *    - Shared platform IDs
 * 4. For matches above threshold:
 *    - Merge into primary entity (highest risk score)
 *    - Add other names as aliases
 *    - Merge platformIds
 *    - Transfer EntityRelations to primary
 *    - Delete duplicate entities
 *    - Emit analysis.correlation_found event
 *
 * RICCO Patterns:
 * - Specification Pattern: Composable similarity specifications
 * - Event Sourcing: All resolutions recorded as events
 * - Strategy Pattern: Pluggable similarity strategies
 */

import { db } from '@/lib/db';
import { persistEvent } from './event-persist';
import type { EntityType, EventStream } from './types';

// ===== TYPES =====

export interface ResolutionCandidate {
  entityId: string;
  name: string;
  type: EntityType;
  platformIds: Record<string, string[]>;
  aliases: string[];
  riskScore: number;
  riskLevel: string;
  mentionCount: number;
}

export interface ResolutionResult {
  merged: boolean;
  targetEntityId: string;
  absorbedIds: string[];
  newAliases: string[];
  newPlatformIds: Record<string, string[]>;
}

export interface ResolveEntitiesResult {
  resolved: number;
  candidates: ResolutionResult[];
}

// ===== SIMILARITY THRESHOLDS =====

/** Minimum Jaccard similarity to consider two names a potential match */
const JACCARD_THRESHOLD = 0.65;

/** Boost applied when aliases overlap */
const ALIAS_OVERLAP_BOOST = 0.15;

/** Boost applied when platform IDs are shared */
const SHARED_PLATFORM_ID_BOOST = 0.20;

/** Combined threshold for considering a merge (Jaccard + boosts) */
const MERGE_THRESHOLD = 0.65;

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
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Normalize a name for comparison: lowercase, trim, collapse whitespace.
 */
function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Check if two names are an exact match (case-insensitive).
 */
function isExactNameMatch(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

/**
 * Check if one name contains the other (partial match).
 */
function isPartialNameMatch(a: string, b: string): boolean {
  const normA = normalizeName(a);
  const normB = normalizeName(b);
  return normA.includes(normB) || normB.includes(normA);
}

/**
 * Count how many aliases from one entity match the name or aliases of another.
 */
function aliasOverlapCount(aliasesA: string[], aliasesB: string[], nameB: string): number {
  let overlap = 0;
  for (const alias of aliasesA) {
    // Check alias vs nameB
    if (isExactNameMatch(alias, nameB)) {
      overlap++;
      continue;
    }
    // Check alias vs each alias of B
    for (const aliasB of aliasesB) {
      if (isExactNameMatch(alias, aliasB)) {
        overlap++;
        break;
      }
    }
  }
  return overlap;
}

/**
 * Check if two entities share any platform IDs.
 */
function hasSharedPlatformIds(
  platformIdsA: Record<string, string[]>,
  platformIdsB: Record<string, string[]>
): boolean {
  for (const platform of Object.keys(platformIdsA)) {
    const idsA = platformIdsA[platform] || [];
    const idsB = platformIdsB[platform] || [];
    if (idsA.some(id => idsB.includes(id))) {
      return true;
    }
  }
  return false;
}

/**
 * Compute the combined similarity score between two candidates.
 * Uses Jaccard similarity as the base, with boosts for alias overlap
 * and shared platform IDs.
 */
function computeSimilarity(a: ResolutionCandidate, b: ResolutionCandidate): number {
  // Base: Jaccard similarity of names
  let score = jaccardSimilarity(a.name, b.name);

  // Exact name match is an automatic strong match
  if (isExactNameMatch(a.name, b.name)) {
    return 1.0;
  }

  // Partial name match boost
  if (isPartialNameMatch(a.name, b.name)) {
    score = Math.max(score, 0.75);
  }

  // Check alias overlap
  const overlapCount = Math.max(
    aliasOverlapCount(a.aliases, b.aliases, b.name),
    aliasOverlapCount(b.aliases, a.aliases, a.name)
  );

  if (overlapCount > 0) {
    score += ALIAS_OVERLAP_BOOST * Math.min(overlapCount, 3); // Cap at 3 overlaps
  }

  // Check shared platform IDs
  if (hasSharedPlatformIds(a.platformIds, b.platformIds)) {
    score += SHARED_PLATFORM_ID_BOOST;
  }

  return Math.min(1.0, score);
}

// ===== HELPERS =====

/**
 * Parse a JSON field from the database, returning a default on failure.
 */
function parseJsonField<T>(raw: string | null, defaultValue: T): T {
  if (!raw) return defaultValue;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Merge two platformIds records, deduplicating the ID arrays.
 */
function mergePlatformIds(
  a: Record<string, string[]>,
  b: Record<string, string[]>
): Record<string, string[]> {
  const merged: Record<string, string[]> = { ...a };
  for (const [platform, ids] of Object.entries(b)) {
    merged[platform] = [...new Set([...(merged[platform] || []), ...ids])];
  }
  return merged;
}

/**
 * Merge two alias arrays, deduplicating.
 */
function mergeAliases(a: string[], b: string[]): string[] {
  const seen = new Set(a.map(alias => normalizeName(alias)));
  const merged = [...a];
  for (const alias of b) {
    if (!seen.has(normalizeName(alias))) {
      merged.push(alias);
      seen.add(normalizeName(alias));
    }
  }
  return merged;
}

// ===== ENTITY RESOLUTION =====

/**
 * Resolve duplicate entities across platforms.
 *
 * This is a heavyweight operation that should be run periodically
 * (e.g., every few hours) or on-demand, not on every ingestion.
 *
 * Algorithm:
 * 1. Fetch all entities
 * 2. Group by type
 * 3. Within each type group, find clusters of similar entities
 * 4. For each cluster, select the primary entity (highest risk score)
 * 5. Merge all others into the primary:
 *    - Add names as aliases
 *    - Merge platformIds
 *    - Transfer EntityRelations
 *    - Update risk score (max of all)
 *    - Delete absorbed entities
 * 6. Emit resolution events
 */
export async function resolveEntities(): Promise<ResolveEntitiesResult> {
  const allEntities = await db.entity.findMany({
    orderBy: { riskScore: 'desc' },
  });

  if (allEntities.length === 0) {
    return { resolved: 0, candidates: [] };
  }

  // Step 1: Build ResolutionCandidates
  const candidates: ResolutionCandidate[] = allEntities.map(e => ({
    entityId: e.id,
    name: e.name,
    type: e.type as EntityType,
    platformIds: parseJsonField<Record<string, string[]>>(e.platformIds, {}),
    aliases: parseJsonField<string[]>(e.aliases, []),
    riskScore: e.riskScore,
    riskLevel: e.riskLevel,
    mentionCount: e.mentionCount,
  }));

  // Step 2: Group by type
  const typeGroups = new Map<EntityType, ResolutionCandidate[]>();
  for (const candidate of candidates) {
    const group = typeGroups.get(candidate.type) || [];
    group.push(candidate);
    typeGroups.set(candidate.type, group);
  }

  const results: ResolutionResult[] = [];
  let resolvedCount = 0;

  // Step 3: Resolve within each type group
  for (const [, group] of typeGroups) {
    if (group.length < 2) continue; // No resolution needed for single entities

    // Track which entities have been absorbed
    const absorbed = new Set<string>();
    // Track which entities have been processed as primaries
    const processedAsPrimary = new Set<string>();

    // Sort by risk score descending (highest risk = primary)
    const sorted = [...group].sort((a, b) => b.riskScore - a.riskScore);

    for (let i = 0; i < sorted.length; i++) {
      const candidate = sorted[i];

      // Skip if already absorbed or processed
      if (absorbed.has(candidate.entityId) || processedAsPrimary.has(candidate.entityId)) {
        continue;
      }

      // Find all entities that should be merged into this primary
      const toMerge: ResolutionCandidate[] = [];

      for (let j = i + 1; j < sorted.length; j++) {
        const other = sorted[j];

        // Skip if already absorbed
        if (absorbed.has(other.entityId)) continue;

        const similarity = computeSimilarity(candidate, other);

        if (similarity >= MERGE_THRESHOLD) {
          toMerge.push(other);
        }
      }

      if (toMerge.length === 0) {
        processedAsPrimary.add(candidate.entityId);
        continue;
      }

      // Mark merged entities as absorbed
      for (const merged of toMerge) {
        absorbed.add(merged.entityId);
      }

      // Step 4: Execute the merge
      const mergeResult = await executeMerge(candidate, toMerge);
      results.push(mergeResult);

      if (mergeResult.merged) {
        resolvedCount += toMerge.length;
      }

      processedAsPrimary.add(candidate.entityId);
    }
  }

  return {
    resolved: resolvedCount,
    candidates: results,
  };
}

/**
 * Execute the merge of secondary entities into a primary entity.
 *
 * - Primary = highest risk score entity
 * - Secondary entities are absorbed: their names become aliases,
 *   their platformIds are merged, their relations are transferred,
 *   and then they are deleted.
 */
async function executeMerge(
  primary: ResolutionCandidate,
  secondaries: ResolutionCandidate[]
): Promise<ResolutionResult> {
  const now = new Date();

  // Collect new aliases (names of absorbed entities that aren't already aliases)
  const existingAliases = primary.aliases;
  const newAliases: string[] = [];

  for (const secondary of secondaries) {
    // The secondary's name becomes an alias if not already known
    const secondaryNameNorm = normalizeName(secondary.name);
    const primaryNameNorm = normalizeName(primary.name);
    const alreadyKnown =
      primaryNameNorm === secondaryNameNorm ||
      existingAliases.some(a => normalizeName(a) === secondaryNameNorm) ||
      newAliases.some(a => normalizeName(a) === secondaryNameNorm);

    if (!alreadyKnown) {
      newAliases.push(secondary.name);
    }

    // Also add any unique aliases from the secondary
    for (const alias of secondary.aliases) {
      const aliasNorm = normalizeName(alias);
      const aliasAlreadyKnown =
        primaryNameNorm === aliasNorm ||
        existingAliases.some(a => normalizeName(a) === aliasNorm) ||
        newAliases.some(a => normalizeName(a) === aliasNorm) ||
        secondaryNameNorm === aliasNorm;

      if (!aliasAlreadyKnown) {
        newAliases.push(alias);
      }
    }
  }

  // Merge platformIds
  let mergedPlatformIds = { ...primary.platformIds };
  for (const secondary of secondaries) {
    mergedPlatformIds = mergePlatformIds(mergedPlatformIds, secondary.platformIds);
  }

  // Compute new risk score (max of all, or boost)
  const maxRiskScore = Math.max(primary.riskScore, ...secondaries.map(s => s.riskScore));
  const riskBoost = secondaries.length * 3; // Small boost per absorbed entity
  const newRiskScore = Math.min(100, maxRiskScore + riskBoost);

  // Compute new risk level
  const newRiskLevel = newRiskScore >= 90 ? 'critical'
    : newRiskScore >= 70 ? 'high'
    : newRiskScore >= 40 ? 'medium'
    : 'low';

  // Total mention count
  const totalMentions = primary.mentionCount + secondaries.reduce((sum, s) => sum + s.mentionCount, 0);

  // Earliest firstSeen (we need to check the DB for this)
  const allEntityIds = [primary.entityId, ...secondaries.map(s => s.entityId)];
  const entityRecords = await db.entity.findMany({
    where: { id: { in: allEntityIds } },
    select: { id: true, firstSeen: true, metadata: true },
  });

  const earliestFirstSeen = entityRecords.reduce(
    (earliest, e) => (e.firstSeen < earliest ? e.firstSeen : earliest),
    entityRecords[0]?.firstSeen ?? now
  );

  // Merge metadata from all entities
  const mergedMetadata: Record<string, unknown> = {};
  for (const record of entityRecords) {
    const meta = parseJsonField<Record<string, unknown>>(record.metadata, {});
    Object.assign(mergedMetadata, meta);
  }
  mergedMetadata.resolvedFrom = secondaries.map(s => s.entityId);
  mergedMetadata.resolvedAt = now.toISOString();

  // All aliases combined
  const allAliases = mergeAliases(
    mergeAliases(existingAliases, newAliases),
    secondaries.flatMap(s => s.aliases)
  );

  // Update the primary entity
  await db.entity.update({
    where: { id: primary.entityId },
    data: {
      aliases: JSON.stringify(allAliases),
      platformIds: JSON.stringify(mergedPlatformIds),
      riskScore: newRiskScore,
      riskLevel: newRiskLevel,
      mentionCount: totalMentions,
      firstSeen: earliestFirstSeen,
      metadata: JSON.stringify(mergedMetadata),
    },
  });

  // Transfer EntityRelations from absorbed entities to primary
  for (const secondary of secondaries) {
    // Re-point relations where the secondary is the source
    const fromRelations = await db.entityRelation.findMany({
      where: { fromEntityId: secondary.entityId },
    });

    for (const rel of fromRelations) {
      // Avoid duplicate: check if a relation already exists from primary to the same target
      if (rel.toEntityId === primary.entityId) {
        // Self-referential — delete
        await db.entityRelation.delete({ where: { id: rel.id } });
        continue;
      }

      const existing = await db.entityRelation.findFirst({
        where: {
          fromEntityId: primary.entityId,
          toEntityId: rel.toEntityId,
          relationType: rel.relationType,
        },
      });

      if (existing) {
        // Merge: update strength and evidence
        const existingEvidence = parseJsonField<string[]>(existing.evidence, []);
        const newEvidence = parseJsonField<string[]>(rel.evidence, []);
        const mergedEvidence = [...new Set([...existingEvidence, ...newEvidence])].slice(-100);

        await db.entityRelation.update({
          where: { id: existing.id },
          data: {
            strength: Math.min(1.0, Math.max(existing.strength, rel.strength)),
            evidence: JSON.stringify(mergedEvidence),
            lastSeen: now,
          },
        });

        // Delete the old relation
        await db.entityRelation.delete({ where: { id: rel.id } });
      } else {
        // Re-point the relation to the primary
        await db.entityRelation.update({
          where: { id: rel.id },
          data: { fromEntityId: primary.entityId },
        });
      }
    }

    // Re-point relations where the secondary is the target
    const toRelations = await db.entityRelation.findMany({
      where: { toEntityId: secondary.entityId },
    });

    for (const rel of toRelations) {
      // Avoid duplicate
      if (rel.fromEntityId === primary.entityId) {
        // Already handled above or self-referential
        await db.entityRelation.delete({ where: { id: rel.id } });
        continue;
      }

      const existing = await db.entityRelation.findFirst({
        where: {
          fromEntityId: rel.fromEntityId,
          toEntityId: primary.entityId,
          relationType: rel.relationType,
        },
      });

      if (existing) {
        const existingEvidence = parseJsonField<string[]>(existing.evidence, []);
        const newEvidence = parseJsonField<string[]>(rel.evidence, []);
        const mergedEvidence = [...new Set([...existingEvidence, ...newEvidence])].slice(-100);

        await db.entityRelation.update({
          where: { id: existing.id },
          data: {
            strength: Math.min(1.0, Math.max(existing.strength, rel.strength)),
            evidence: JSON.stringify(mergedEvidence),
            lastSeen: now,
          },
        });

        await db.entityRelation.delete({ where: { id: rel.id } });
      } else {
        await db.entityRelation.update({
          where: { id: rel.id },
          data: { toEntityId: primary.entityId },
        });
      }
    }

    // Update PatternDetection entityIds that reference the absorbed entity
    const patternsWithEntity = await db.patternDetection.findMany({
      where: {
        entityIds: { contains: secondary.entityId },
      },
    });

    for (const pattern of patternsWithEntity) {
      const entityIds = parseJsonField<string[]>(pattern.entityIds, []);
      const updatedEntityIds = entityIds.map(eid =>
        eid === secondary.entityId ? primary.entityId : eid
      );
      // Deduplicate
      const dedupedEntityIds = [...new Set(updatedEntityIds)];

      await db.patternDetection.update({
        where: { id: pattern.id },
        data: { entityIds: JSON.stringify(dedupedEntityIds) },
      });
    }

    // Delete the absorbed entity
    await db.entity.delete({
      where: { id: secondary.entityId },
    });
  }

  // Emit resolution event
  const stream: EventStream = 'whatomate:intel_events';
  await persistEvent(stream, {
    eventType: 'analysis.correlation_found',
    aggregateId: `resolution_${Date.now()}`,
    aggregateType: 'entity',
    payload: {
      action: 'entity_resolution',
      primaryEntityId: primary.entityId,
      primaryName: primary.name,
      absorbedCount: secondaries.length,
      absorbedNames: secondaries.map(s => s.name),
      newAliases,
      mergedPlatforms: Object.keys(mergedPlatformIds),
      newRiskScore,
      newRiskLevel,
    },
    metadata: {
      source: 'entity-resolver',
      similarityThreshold: MERGE_THRESHOLD,
    },
  });

  return {
    merged: true,
    targetEntityId: primary.entityId,
    absorbedIds: secondaries.map(s => s.entityId),
    newAliases,
    newPlatformIds: mergedPlatformIds,
  };
}

// ===== DRY RUN =====

/**
 * Dry-run resolution: compute what would be merged without actually
 * performing any database mutations. Useful for preview/review.
 */
export async function dryRunResolveEntities(): Promise<{
  potentialMerges: Array<{
    primary: ResolutionCandidate;
    secondaries: ResolutionCandidate[];
    similarityScores: Array<{ name: string; score: number }>;
  }>;
  totalEntities: number;
  potentialReduction: number;
}> {
  const allEntities = await db.entity.findMany({
    orderBy: { riskScore: 'desc' },
  });

  const candidates: ResolutionCandidate[] = allEntities.map(e => ({
    entityId: e.id,
    name: e.name,
    type: e.type as EntityType,
    platformIds: parseJsonField<Record<string, string[]>>(e.platformIds, {}),
    aliases: parseJsonField<string[]>(e.aliases, []),
    riskScore: e.riskScore,
    riskLevel: e.riskLevel,
    mentionCount: e.mentionCount,
  }));

  // Group by type
  const typeGroups = new Map<EntityType, ResolutionCandidate[]>();
  for (const candidate of candidates) {
    const group = typeGroups.get(candidate.type) || [];
    group.push(candidate);
    typeGroups.set(candidate.type, group);
  }

  const potentialMerges: Array<{
    primary: ResolutionCandidate;
    secondaries: ResolutionCandidate[];
    similarityScores: Array<{ name: string; score: number }>;
  }> = [];

  const absorbed = new Set<string>();

  for (const [, group] of typeGroups) {
    if (group.length < 2) continue;

    const sorted = [...group].sort((a, b) => b.riskScore - a.riskScore);

    for (let i = 0; i < sorted.length; i++) {
      const candidate = sorted[i];
      if (absorbed.has(candidate.entityId)) continue;

      const toMerge: ResolutionCandidate[] = [];
      const scores: Array<{ name: string; score: number }> = [];

      for (let j = i + 1; j < sorted.length; j++) {
        const other = sorted[j];
        if (absorbed.has(other.entityId)) continue;

        const similarity = computeSimilarity(candidate, other);
        if (similarity >= MERGE_THRESHOLD) {
          toMerge.push(other);
          scores.push({ name: other.name, score: Math.round(similarity * 100) / 100 });
          absorbed.add(other.entityId);
        }
      }

      if (toMerge.length > 0) {
        potentialMerges.push({
          primary: candidate,
          secondaries: toMerge,
          similarityScores: scores,
        });
      }
    }
  }

  return {
    potentialMerges,
    totalEntities: allEntities.length,
    potentialReduction: absorbed.size,
  };
}
