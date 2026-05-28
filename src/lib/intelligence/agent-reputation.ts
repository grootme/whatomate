/**
 * INNOVATION 5: Agent Reputation System
 *
 * Tracks each agent's accuracy over time (correct predictions vs false alarms).
 * Agents with reputation > 80 get their votes weighted 1.5x in consensus.
 * Agents with reputation < 30 get their votes weighted 0.5x.
 * Auto-recalculates after each prediction accuracy validation.
 *
 * Reputation is stored in AgentState.config as JSON:
 * {
 *   reputation: number,        // 0-100
 *   correctPredictions: number,
 *   falseAlarms: number,
 *   totalPredictions: number,
 *   lastRecalculated: string   // ISO date
 * }
 *
 * RICCO Patterns:
 * - Event Sourcing: All reputation changes recorded as events
 * - Specification Pattern: Reputation thresholds determine vote weight
 */

import { db } from '@/lib/db';
import { persistEvent } from './event-persist';
import type { EventStream } from './types';

// ===== TYPES =====

export interface AgentReputationData {
  reputation: number;
  correctPredictions: number;
  falseAlarms: number;
  totalPredictions: number;
  lastRecalculated: string;
}

export interface ReputationUpdateResult {
  agentId: string;
  oldReputation: number;
  newReputation: number;
  weightMultiplier: number;
}

// ===== THRESHOLDS =====

/** Reputation above this → 1.5x vote weight */
const HIGH_REP_THRESHOLD = 80;

/** Reputation below this → 0.5x vote weight */
const LOW_REP_THRESHOLD = 30;

/** How much each correct prediction boosts reputation (out of 100) */
const CORRECT_BOOST = 2;

/** How much each false alarm decreases reputation */
const FALSE_ALARM_PENALTY = 5;

/** Minimum reputation */
const MIN_REPUTATION = 0;

/** Maximum reputation */
const MAX_REPUTATION = 100;

// ===== HELPER =====

function parseConfig(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractReputation(config: Record<string, unknown>): AgentReputationData {
  const rep = config.reputation as Record<string, unknown> | undefined;
  return {
    reputation: typeof rep?.reputation === 'number' ? rep.reputation : 50,
    correctPredictions: typeof rep?.correctPredictions === 'number' ? rep.correctPredictions : 0,
    falseAlarms: typeof rep?.falseAlarms === 'number' ? rep.falseAlarms : 0,
    totalPredictions: typeof rep?.totalPredictions === 'number' ? rep.totalPredictions : 0,
    lastRecalculated: typeof rep?.lastRecalculated === 'string' ? rep.lastRecalculated : new Date().toISOString(),
  };
}

// ===== PUBLIC API =====

/**
 * Get the reputation data for an agent.
 */
export async function getAgentReputation(agentId: string): Promise<AgentReputationData> {
  const agentState = await db.agentState.findUnique({ where: { agentId } });
  if (!agentState) {
    return {
      reputation: 50,
      correctPredictions: 0,
      falseAlarms: 0,
      totalPredictions: 0,
      lastRecalculated: new Date().toISOString(),
    };
  }
  const config = parseConfig(agentState.config);
  return extractReputation(config);
}

/**
 * Get the vote weight multiplier for an agent based on their reputation.
 * - reputation > 80 → 1.5x
 * - reputation < 30 → 0.5x
 * - otherwise → 1.0x
 */
export async function getAgentVoteWeight(agentId: string): Promise<number> {
  const reputation = await getAgentReputation(agentId);
  if (reputation.reputation > HIGH_REP_THRESHOLD) return 1.5;
  if (reputation.reputation < LOW_REP_THRESHOLD) return 0.5;
  return 1.0;
}

/**
 * Record a correct prediction for an agent and recalculate reputation.
 */
export async function recordCorrectPrediction(agentId: string): Promise<ReputationUpdateResult> {
  return updateReputation(agentId, 'correct');
}

/**
 * Record a false alarm for an agent and recalculate reputation.
 */
export async function recordFalseAlarm(agentId: string): Promise<ReputationUpdateResult> {
  return updateReputation(agentId, 'false_alarm');
}

/**
 * Validate prediction accuracy for all agents by comparing predictions
 * against actual values. This recalculates reputation for each agent.
 */
export async function validateAndRecalculateAll(): Promise<ReputationUpdateResult[]> {
  const results: ReputationUpdateResult[] = [];

  // Get agents that are in analysis/monitoring layers (the voting agents)
  const analysisAgents = await db.agentState.findMany({
    where: {
      layer: { in: [2, 3] }, // Analysis and Monitoring layers
    },
  });

  for (const agent of analysisAgents) {
    // Check if agent has any predictions that can be validated
    const predictions = await db.prediction.findMany({
      where: {
        predictedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        actualValue: { not: null },
      },
      take: 20,
    });

    if (predictions.length === 0) continue;

    // Count correct predictions (within 20% of actual) vs false alarms
    let correct = 0;
    let falseAlarms = 0;

    for (const pred of predictions) {
      const actual = pred.actualValue!;
      const error = Math.abs(pred.value - actual) / (actual || 1);
      if (error < 0.2) {
        correct++;
      } else if (pred.value > actual * 2) {
        // Over-prediction by 2x+ is a false alarm
        falseAlarms++;
      }
    }

    // Update reputation
    const config = parseConfig(agent.config);
    const repData = extractReputation(config);

    repData.correctPredictions += correct;
    repData.falseAlarms += falseAlarms;
    repData.totalPredictions += predictions.length;
    repData.reputation = computeReputationScore(repData);
    repData.lastRecalculated = new Date().toISOString();

    const oldReputation = extractReputation(config).reputation;

    // Persist to AgentState.config
    config.reputation = repData;
    await db.agentState.update({
      where: { agentId: agent.agentId },
      data: { config: JSON.stringify(config) },
    });

    results.push({
      agentId: agent.agentId,
      oldReputation,
      newReputation: repData.reputation,
      weightMultiplier: repData.reputation > HIGH_REP_THRESHOLD ? 1.5
        : repData.reputation < LOW_REP_THRESHOLD ? 0.5 : 1.0,
    });
  }

  return results;
}

// ===== INTERNAL HELPERS =====

function computeReputationScore(data: AgentReputationData): number {
  if (data.totalPredictions === 0) return 50; // Neutral starting point

  const accuracy = data.correctPredictions / data.totalPredictions;
  const falseAlarmRate = data.falseAlarms / data.totalPredictions;

  // Base score from accuracy (0-70)
  const accuracyScore = accuracy * 70;

  // Penalty from false alarms (0-30)
  const falseAlarmPenalty = falseAlarmRate * 30;

  // Combine
  const score = 50 + accuracyScore - falseAlarmPenalty;

  return Math.max(MIN_REPUTATION, Math.min(MAX_REPUTATION, Math.round(score)));
}

async function updateReputation(
  agentId: string,
  type: 'correct' | 'false_alarm'
): Promise<ReputationUpdateResult> {
  const agentState = await db.agentState.findUnique({ where: { agentId } });
  if (!agentState) {
    return {
      agentId,
      oldReputation: 50,
      newReputation: 50,
      weightMultiplier: 1.0,
    };
  }

  const config = parseConfig(agentState.config);
  const repData = extractReputation(config);
  const oldReputation = repData.reputation;

  if (type === 'correct') {
    repData.correctPredictions++;
    repData.totalPredictions++;
    repData.reputation = Math.min(MAX_REPUTATION, repData.reputation + CORRECT_BOOST);
  } else {
    repData.falseAlarms++;
    repData.totalPredictions++;
    repData.reputation = Math.max(MIN_REPUTATION, repData.reputation - FALSE_ALARM_PENALTY);
  }

  repData.lastRecalculated = new Date().toISOString();

  // Persist updated reputation
  config.reputation = repData;
  await db.agentState.update({
    where: { agentId },
    data: { config: JSON.stringify(config) },
  });

  // Emit reputation change event
  const stream: EventStream = 'whatomate:intel_events';
  await persistEvent(stream, {
    eventType: 'agent.status_changed',
    aggregateId: `reputation_${agentId}_${Date.now()}`,
    aggregateType: 'agent',
    payload: {
      action: 'reputation_update',
      agentId,
      type,
      oldReputation,
      newReputation: repData.reputation,
      correctPredictions: repData.correctPredictions,
      falseAlarms: repData.falseAlarms,
      totalPredictions: repData.totalPredictions,
    },
    metadata: {
      source: 'agent-reputation',
      changeType: type,
    },
  });

  const newWeight = repData.reputation > HIGH_REP_THRESHOLD ? 1.5
    : repData.reputation < LOW_REP_THRESHOLD ? 0.5 : 1.0;

  return {
    agentId,
    oldReputation,
    newReputation: repData.reputation,
    weightMultiplier: newWeight,
  };
}
