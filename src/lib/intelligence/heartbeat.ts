/**
 * Agent Heartbeat Protocol — Innovation 7
 *
 * Implements a heartbeat-based health monitoring system for all agents.
 * Each agent periodically sends a heartbeat; this module evaluates freshness
 * and degrades agent health scores based on how stale the last heartbeat is.
 *
 * Heartbeat Freshness Rules:
 *   < 1 min   → health stays the same (agent is active)
 *   1-5 min   → health -= 5
 *   5-15 min  → health -= 15
 *   15-30 min → health -= 25
 *   > 30 min  → health = 0 (agent is effectively dead)
 *
 * Status Thresholds:
 *   health < 20 → status = 'error'
 *   health < 50 → status = 'warning'  (but >= 20)
 *
 * Events:
 *   Emits `agent.heartbeat` event for each agent after evaluation.
 */

import { db } from '@/lib/db';
import { persistEvent } from './event-persist';

// ===== Types =====

export interface HeartbeatResult {
  agentId: string;
  name: string;
  previousHealth: number;
  newHealth: number;
  previousStatus: string;
  newStatus: string;
  heartbeatAgeMs: number;
}

export interface HeartbeatSummary {
  totalAgents: number;
  active: number;
  warning: number;
  error: number;
  inactive: number;
  results: HeartbeatResult[];
}

// ===== Heartbeat Evaluation =====

const ONE_MINUTE = 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;

/**
 * Compute the health penalty based on how old the last heartbeat is.
 */
function computeHealthDelta(heartbeatAgeMs: number): number {
  if (heartbeatAgeMs < ONE_MINUTE) return 0;
  if (heartbeatAgeMs < FIVE_MINUTES) return -5;
  if (heartbeatAgeMs < FIFTEEN_MINUTES) return -15;
  if (heartbeatAgeMs < THIRTY_MINUTES) return -25;
  return -100; // Will be clamped to 0
}

/**
 * Determine agent status based on health score.
 */
function determineStatus(health: number): 'active' | 'inactive' | 'warning' | 'error' {
  if (health < 20) return 'error';
  if (health < 50) return 'warning';
  if (health > 0) return 'active';
  return 'inactive';
}

// ===== Public API =====

/**
 * Run the heartbeat protocol for all agents.
 *
 * Iterates through all AgentState records, evaluates heartbeat freshness,
 * adjusts health scores, updates statuses, and emits heartbeat events.
 *
 * Returns a summary of agent states after evaluation.
 */
export async function runHeartbeat(): Promise<HeartbeatSummary> {
  const agentStates = await db.agentState.findMany();
  const results: HeartbeatResult[] = [];

  const now = Date.now();

  let active = 0;
  let warning = 0;
  let error = 0;
  let inactive = 0;

  for (const agent of agentStates) {
    const heartbeatAgeMs = agent.lastHeartbeat
      ? now - agent.lastHeartbeat.getTime()
      : Infinity;

    const previousHealth = agent.health;
    const previousStatus = agent.status;

    // Compute health delta
    const delta = computeHealthDelta(heartbeatAgeMs);

    let newHealth: number;
    if (delta === -100) {
      // Heartbeat older than 30 min → health = 0
      newHealth = 0;
    } else {
      newHealth = Math.min(100, Math.max(0, previousHealth + delta));
    }

    // Determine new status
    let newStatus = determineStatus(newHealth);

    // If agent was already inactive and has no heartbeat at all, keep it inactive
    if (!agent.lastHeartbeat && previousStatus === 'inactive') {
      newStatus = 'inactive';
      newHealth = 0;
    }

    // Update the database record
    await db.agentState.update({
      where: { id: agent.id },
      data: {
        health: newHealth,
        status: newStatus,
      },
    });

    // Emit agent.heartbeat event
    await persistEvent('whatomate:intel_events', {
      eventType: 'agent.heartbeat',
      aggregateId: agent.agentId,
      aggregateType: 'agent',
      payload: {
        agentId: agent.agentId,
        name: agent.name,
        layer: agent.layerName,
        previousHealth,
        newHealth,
        previousStatus,
        newStatus,
        heartbeatAgeMs: heartbeatAgeMs === Infinity ? null : heartbeatAgeMs,
        healthDelta: newHealth - previousHealth,
      },
    });

    // Count statuses
    if (newStatus === 'active') active++;
    else if (newStatus === 'warning') warning++;
    else if (newStatus === 'error') error++;
    else inactive++;

    results.push({
      agentId: agent.agentId,
      name: agent.name,
      previousHealth,
      newHealth,
      previousStatus,
      newStatus,
      heartbeatAgeMs: heartbeatAgeMs === Infinity ? Infinity : heartbeatAgeMs,
    });
  }

  return {
    totalAgents: agentStates.length,
    active,
    warning,
    error,
    inactive,
    results,
  };
}

/**
 * Register a heartbeat for a specific agent.
 *
 * Updates the agent's lastHeartbeat to now and sets status to 'active'.
 * If the agent doesn't exist in the DB yet, creates a new record.
 *
 * @param agentId The agent's unique identifier (e.g., 'ing-wa', 'ana-sem')
 */
export async function registerHeartbeat(agentId: string): Promise<void> {
  const existing = await db.agentState.findUnique({ where: { agentId } });

  if (existing) {
    await db.agentState.update({
      where: { agentId },
      data: {
        lastHeartbeat: new Date(),
        status: 'active',
        // Boost health towards 100 if it was degraded
        health: Math.min(100, existing.health + 10),
      },
    });
  } else {
    // Agent not in DB yet — create a new record
    // We need at least a name; use the agentId as a fallback
    await db.agentState.create({
      data: {
        agentId,
        name: agentId,
        layer: 0,
        layerName: 'Unknown',
        status: 'active',
        health: 80,
        lastHeartbeat: new Date(),
        startedAt: new Date(),
      },
    });
  }

  // Emit heartbeat event
  await persistEvent('whatomate:intel_events', {
    eventType: 'agent.heartbeat',
    aggregateId: agentId,
    aggregateType: 'agent',
    payload: {
      agentId,
      action: 'heartbeat_registered',
      timestamp: new Date().toISOString(),
    },
  });
}
