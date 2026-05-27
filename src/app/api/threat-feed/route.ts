/**
 * OSINT Threat Intelligence Feed — Innovation 3
 *
 * GET endpoint that aggregates all current threat intelligence into a single feed.
 * Provides a unified view for dashboards and external consumers.
 *
 * Aggregates:
 * - Active threats from OSINT data (earthquakes, military, weather, fire, conflict, fraud, migration)
 * - Active patterns from PatternDetection table
 * - Unacknowledged alerts from Alert table
 * - Risk summary from Entity table
 * - Overall threat level and score
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/intelligence/auth';
import { db } from '@/lib/db';
import { fetchService } from '@/lib/intelligence/service-client';
import type { AlertSeverity, PatternDetection } from '@/lib/intelligence/types';

// ===== THREAT TYPES =====

type ThreatType =
  | 'earthquake'
  | 'military'
  | 'weather'
  | 'fire'
  | 'conflict'
  | 'fraud'
  | 'migration';

interface ActiveThreat {
  id: string;
  type: ThreatType;
  severity: AlertSeverity;
  title: string;
  description: string;
  source: string;
  timestamp: string;
  location?: string;
}

interface RiskSummary {
  totalEntities: number;
  highRisk: number;
  avgScore: number;
}

interface ThreatFeedResponse {
  threatLevel: string;
  threatScore: number;
  activeThreats: ActiveThreat[];
  recentPatterns: PatternDetection[];
  activeAlerts: Array<Record<string, unknown>>;
  riskSummary: RiskSummary;
}

// ===== SEVERITY → NUMERIC SCORE =====

const SEVERITY_SCORE: Record<AlertSeverity, number> = {
  'INFO': 10,
  'BAJA': 25,
  'MEDIA': 50,
  'ALTA': 75,
  'CRÍTICA': 100,
};

// ===== HELPER: Parse JSON field safely =====

function parseJsonField<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ===== BUILD OSINT THREATS FROM RAW MESSAGES =====

async function buildOsintThreats(): Promise<ActiveThreat[]> {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const threats: ActiveThreat[] = [];

  // Fetch recent OSINT messages (last 24h) with metadata
  const osintMessages = await db.rawMessage.findMany({
    where: {
      source: 'osint',
      timestamp: { gte: last24h },
    },
    orderBy: { timestamp: 'desc' },
    take: 200,
  });

  for (const msg of osintMessages) {
    const meta = parseJsonField<Record<string, unknown>>(msg.metadata, {});
    const type = meta.type as string | undefined;

    let threatType: ThreatType | null = null;
    let severity: AlertSeverity = 'BAJA';
    let location: string | undefined;

    switch (type) {
      case 'earthquake': {
        threatType = 'earthquake';
        const magnitude = Number(meta.magnitude) || 0;
        severity =
          magnitude >= 7 ? 'CRÍTICA' :
          magnitude >= 5 ? 'ALTA' :
          magnitude >= 3 ? 'MEDIA' : 'BAJA';
        location = (meta.location as string) || undefined;
        break;
      }
      case 'flight': {
        const isMilitary = meta.isMilitary === true;
        if (isMilitary) {
          threatType = 'military';
          severity = 'MEDIA';
        }
        break;
      }
      case 'weather': {
        threatType = 'weather';
        const activeAlerts = Number(meta.activeAlerts) || 0;
        severity =
          activeAlerts >= 10 ? 'ALTA' :
          activeAlerts >= 3 ? 'MEDIA' : 'BAJA';
        break;
      }
      case 'fire': {
        threatType = 'fire';
        const confidence = Number(meta.confidence) || 0;
        severity =
          confidence >= 80 ? 'ALTA' :
          confidence >= 50 ? 'MEDIA' : 'BAJA';
        location = (meta.location as string) || undefined;
        break;
      }
      case 'gdelt': {
        threatType = 'conflict';
        severity = 'MEDIA';
        break;
      }
      case 'news': {
        // Map news categories to threat types
        const category = meta.category as string;
        if (category?.toLowerCase().includes('fraud') || category?.toLowerCase().includes('crime')) {
          threatType = 'fraud';
        } else if (category?.toLowerCase().includes('conflict') || category?.toLowerCase().includes('military')) {
          threatType = 'conflict';
        } else if (category?.toLowerCase().includes('migration') || category?.toLowerCase().includes('border')) {
          threatType = 'migration';
        }
        severity = 'MEDIA';
        break;
      }
      case 'ship': {
        // Ships are not typically a threat type, skip unless suspicious
        break;
      }
    }

    if (threatType) {
      threats.push({
        id: msg.id,
        type: threatType,
        severity,
        title: msg.content.substring(0, 120),
        description: msg.content,
        source: msg.senderName || 'OSINT',
        timestamp: msg.timestamp.toISOString(),
        location,
      });
    }
  }

  return threats;
}

// ===== COMPUTE OVERALL THREAT LEVEL =====

function computeThreatLevel(
  threats: ActiveThreat[],
  activeAlerts: Array<{ severity: string }>,
  riskSummary: RiskSummary
): { threatLevel: string; threatScore: number } {
  // Weighted threat score computation
  let score = 0;

  // 1. Threat severity contribution (max 40 points)
  if (threats.length > 0) {
    const maxThreatScore = Math.max(...threats.map(t => SEVERITY_SCORE[t.severity] ?? 0));
    const avgThreatScore =
      threats.reduce((sum, t) => sum + (SEVERITY_SCORE[t.severity] ?? 0), 0) / threats.length;
    score += (maxThreatScore * 0.3 + avgThreatScore * 0.1);
  }

  // 2. Active alerts contribution (max 35 points)
  if (activeAlerts.length > 0) {
    const maxAlertScore = Math.max(
      ...activeAlerts.map(a => SEVERITY_SCORE[a.severity as AlertSeverity] ?? 0)
    );
    const criticalCount = activeAlerts.filter(a => a.severity === 'CRÍTICA').length;
    const altaCount = activeAlerts.filter(a => a.severity === 'ALTA').length;
    score += Math.min(35, maxAlertScore * 0.25 + criticalCount * 5 + altaCount * 2);
  }

  // 3. Risk summary contribution (max 25 points)
  score += Math.min(25, (riskSummary.avgScore / 100) * 25);
  if (riskSummary.highRisk > 0) {
    score += Math.min(10, riskSummary.highRisk * 2);
  }

  // Cap at 100
  const threatScore = Math.min(100, Math.round(score));

  // Map score to level
  let threatLevel: string;
  if (threatScore >= 80) {
    threatLevel = 'CRÍTICA';
  } else if (threatScore >= 60) {
    threatLevel = 'ALTA';
  } else if (threatScore >= 40) {
    threatLevel = 'MEDIA';
  } else if (threatScore >= 20) {
    threatLevel = 'BAJA';
  } else {
    threatLevel = 'INFO';
  }

  return { threatLevel, threatScore };
}

// ===== MAIN HANDLER =====

async function _GET() {
  try {
    // --- Fetch all data in parallel ---
    const [osintThreats, activePatterns, activeAlerts, entityStats, liveOsintData] =
      await Promise.all([
        buildOsintThreats(),
        db.patternDetection.findMany({
          where: { status: { in: ['active', 'confirmed', 'investigating'] } },
          orderBy: { lastDetected: 'desc' },
          take: 20,
        }),
        db.alert.findMany({
          where: { acknowledged: false },
          orderBy: { timestamp: 'desc' },
          take: 50,
        }),
        (async () => {
          const totalEntities = await db.entity.count();
          const highRisk = await db.entity.count({
            where: { riskLevel: { in: ['high', 'critical'] } },
          });
          const avgResult = await db.entity.aggregate({
            _avg: { riskScore: true },
          });
          return {
            totalEntities,
            highRisk,
            avgScore: Math.round(avgResult._avg.riskScore ?? 0),
          };
        })(),
        fetchService<Record<string, unknown>>('osint', '/threat').catch(() => ({
          data: null,
          error: true,
        })),
      ]);

    // --- Merge live OSINT threat level if available ---
    const liveThreatLevel = liveOsintData.data
      ? (liveOsintData.data as Record<string, unknown>).level
      : null;

    // --- Format patterns ---
    const recentPatterns: PatternDetection[] = activePatterns.map(p => ({
      id: p.id,
      patternType: p.patternType as PatternDetection['patternType'],
      severity: p.severity as AlertSeverity,
      confidence: p.confidence,
      description: p.description,
      evidenceIds: parseJsonField<string[]>(p.evidenceIds, undefined),
      entityIds: parseJsonField<string[]>(p.entityIds, undefined),
      detectionRate: p.detectionRate ?? undefined,
      occurrences: p.occurrences,
      status: p.status as PatternDetection['status'],
      firstDetected: p.firstDetected,
      lastDetected: p.lastDetected,
    }));

    // --- Format active alerts ---
    const formattedAlerts = activeAlerts.map(a => ({
      id: a.id,
      source: a.source,
      severity: a.severity,
      title: a.title,
      description: a.description,
      actionTaken: a.actionTaken || '',
      strategy: a.strategy,
      acknowledged: a.acknowledged,
      escalated: a.escalated,
      timestamp: a.timestamp.toISOString(),
      relatedEvents: parseJsonField<string[]>(a.relatedEvents, []),
    }));

    // --- Compute threat level ---
    const { threatLevel, threatScore } = computeThreatLevel(
      osintThreats,
      activeAlerts,
      entityStats
    );

    // If live OSINT data reports a higher threat level, use that
    let finalThreatLevel = threatLevel;
    const liveLevelOrder = ['INFO', 'BAJA', 'MEDIA', 'ALTA', 'CRÍTICA'];
    if (
      liveThreatLevel &&
      typeof liveThreatLevel === 'string' &&
      liveLevelOrder.includes(liveThreatLevel)
    ) {
      if (liveLevelOrder.indexOf(liveThreatLevel) > liveLevelOrder.indexOf(threatLevel)) {
        finalThreatLevel = liveThreatLevel;
      }
    }

    // --- Build response ---
    const response: ThreatFeedResponse = {
      threatLevel: finalThreatLevel,
      threatScore,
      activeThreats: osintThreats,
      recentPatterns,
      activeAlerts: formattedAlerts,
      riskSummary: {
        totalEntities: entityStats.totalEntities,
        highRisk: entityStats.highRisk,
        avgScore: entityStats.avgScore,
      },
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[ThreatFeed] Error building threat feed:', err);
    return NextResponse.json(
      {
        error: 'Failed to build threat intelligence feed',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuth(_GET);
