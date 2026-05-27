import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { safeEventAppend } from '@/lib/intelligence/safe-event';
import { strategyRegistry } from '@/lib/intelligence/strategies';
import { buildStrategyContext } from '@/lib/intelligence/context-builder';
import type { DecisionStrategy, StrategyContext } from '@/lib/intelligence/types';

// ===== ANALYSIS KEYWORDS =====
const SUSPICIOUS_KEYWORDS = [
  'fraude', 'estafa', 'scam', 'crypto', 'invertir', 'dinero',
  'ganancia', 'lucro', 'pirámide', 'ponzi', 'bitcoin', 'ethereum',
  'lavado', 'blanqueo', 'soborno', 'cohecho', 'corrupción',
  'falso', 'enganar', 'estafar', 'robo', 'hack',
];

const ENTITY_PATTERNS: Record<string, { type: string; patterns: RegExp[] }> = {
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

// Simple sentiment scoring based on keyword presence
function computeSentimentScore(content: string): number {
  const negativeWords = ['fraude', 'estafa', 'scam', 'peligro', 'alerta', 'robo', 'hurto', 'delito', 'crimen', 'muerte', 'amenaza', 'urgente', 'crítico'];
  const positiveWords = ['seguro', 'seguridad', 'protección', 'ayuda', 'apoyo', 'legal', 'justicia', 'confianza'];
  const lower = content.toLowerCase();

  let score = 50; // neutral
  for (const w of negativeWords) {
    if (lower.includes(w)) score -= 10;
  }
  for (const w of positiveWords) {
    if (lower.includes(w)) score += 5;
  }
  return Math.max(0, Math.min(100, score));
}

// ===== POST: Run analysis on unprocessed messages =====
export async function POST() {
  try {
    const now = new Date();

    // Step A: Fetch unprocessed RawMessages (limit 100)
    const unprocessed = await db.rawMessage.findMany({
      where: { processed: false },
      take: 100,
      orderBy: { timestamp: 'asc' },
    });

    if (unprocessed.length === 0) {
      return NextResponse.json({
        processed: 0,
        alertsGenerated: 0,
        entitiesUpdated: 0,
        message: 'No unprocessed messages found',
      });
    }

    let alertsGenerated = 0;
    let entitiesUpdated = 0;
    const suspiciousMessages: string[] = [];

    // Step B: Process each message
    for (const msg of unprocessed) {
      const contentLower = msg.content.toLowerCase();

      // Semantic analysis: check for suspicious keywords
      const isSuspicious = SUSPICIOUS_KEYWORDS.some(kw => contentLower.includes(kw));
      computeSentimentScore(msg.content); // computed but not stored separately

      if (isSuspicious) {
        suspiciousMessages.push(msg.id);
      }

      // Entity extraction: look for people, organizations, locations, crypto terms
      const extractedEntities: Array<{ name: string; type: string; confidence: number }> = [];

      for (const [, config] of Object.entries(ENTITY_PATTERNS)) {
        for (const pattern of config.patterns) {
          // Reset lastIndex for global regex
          pattern.lastIndex = 0;
          const matches = msg.content.matchAll(pattern);
          for (const match of matches) {
            if (match[0] && match[0].length > 2) {
              extractedEntities.push({
                name: match[0].trim(),
                type: config.type,
                confidence: config.type === 'crypto_wallet' ? 95 : 60,
              });
            }
          }
        }
      }

      // If suspicious keywords found: Create/update Entity with increasing riskScore
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
          entitiesUpdated++;
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
              metadata: JSON.stringify({ source: 'processing_pipeline', confidence: entity.confidence, firstSeenIn: msg.id }),
            },
          });
          entitiesUpdated++;
        }
      }

      // Mark message as processed
      await db.rawMessage.update({
        where: { id: msg.id },
        data: {
          processed: true,
          analyzedAt: now,
        },
      });
    }

    // Step C: Build strategy context and run ALL 6 strategies
    const context = await buildStrategyContext(unprocessed);

    // Run each strategy
    const strategyResults: Array<{ strategy: string; action: string; confidence: number; reasoning: string }> = [];
    const allStrategies = strategyRegistry.getAll();

    for (const strategy of allStrategies) {
      try {
        const result = await strategyRegistry.evaluateWith(strategy.id, context);
        strategyResults.push({
          strategy: strategy.id,
          action: result.action,
          confidence: result.confidence,
          reasoning: result.reasoning,
        });

        if (result.action === 'alert') {
          alertsGenerated++;
        }

        // Create IntelligenceEvent for each strategy result
        await db.intelligenceEvent.create({
          data: {
            eventType: 'monitoring.alert_generated',
            aggregateId: `strategy_${strategy.id}_processing_${Date.now()}`,
            aggregateType: 'alert',
            stream: 'whatomate:decisions',
            payload: JSON.stringify({
              strategy: strategy.id,
              action: result.action,
              severity: result.severity,
              confidence: result.confidence,
              reasoning: result.reasoning,
              triggeredBy: 'processing',
              processedCount: unprocessed.length,
            }),
            metadata: JSON.stringify({ strategyId: strategy.id, autoTriggered: true, source: 'processing' }),
            processed: false,
          },
        });
      } catch (err) {
        console.error(`[Processing] Strategy ${strategy.id} evaluation error:`, err);
        strategyResults.push({
          strategy: strategy.id,
          action: 'error',
          confidence: 0,
          reasoning: `Evaluation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        });
      }
    }

    // Step D: Create IntelligenceEvent for semantic_completed
    const batchId = `analysis_batch_${Date.now()}`;

    safeEventAppend('whatomate:analyzed_messages', {
      eventType: 'analysis.semantic_completed',
      aggregateId: batchId,
      aggregateType: 'message',
      payload: {
        processedCount: unprocessed.length,
        suspiciousCount: suspiciousMessages.length,
        entitiesUpdated,
        alertsGenerated,
        strategyResults,
      },
    });

    // Persist event to SQLite for durability
    await db.intelligenceEvent.create({
      data: {
        eventType: 'analysis.semantic_completed',
        aggregateId: batchId,
        aggregateType: 'message',
        stream: 'whatomate:analyzed_messages',
        payload: JSON.stringify({
          processedCount: unprocessed.length,
          suspiciousCount: suspiciousMessages.length,
          entitiesUpdated,
          alertsGenerated,
          strategyResults,
        }),
        processed: false,
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

    return NextResponse.json({
      processed: unprocessed.length,
      alertsGenerated,
      entitiesUpdated,
      suspiciousCount: suspiciousMessages.length,
      strategyResults,
    });
  } catch (error) {
    console.error('[Processing] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error during processing' },
      { status: 500 }
    );
  }
}

// ===== GET: Return processing stats =====
export async function GET() {
  try {
    // Unprocessed message count
    const unprocessedCount = await db.rawMessage.count({
      where: { processed: false },
    });

    // Processed message count
    const processedCount = await db.rawMessage.count({
      where: { processed: true },
    });

    // Last processing run timestamp
    const lastProcessed = await db.rawMessage.findFirst({
      where: { processed: true, analyzedAt: { not: null } },
      orderBy: { analyzedAt: 'desc' },
      select: { analyzedAt: true },
    });

    // Entity counts by risk level
    const criticalEntities = await db.entity.count({ where: { riskLevel: 'critical' } });
    const highEntities = await db.entity.count({ where: { riskLevel: 'high' } });
    const mediumEntities = await db.entity.count({ where: { riskLevel: 'medium' } });
    const lowEntities = await db.entity.count({ where: { riskLevel: 'low' } });

    // Recent analysis events
    const recentAnalysisEvents = await db.intelligenceEvent.count({
      where: { eventType: 'analysis.semantic_completed' },
    });

    // Analysis agent states
    const analysisAgents = await db.agentState.findMany({
      where: { agentId: { in: ['ana-sem', 'ana-pat', 'ana-cro', 'ana-ris'] } },
    });

    return NextResponse.json({
      messages: {
        unprocessed: unprocessedCount,
        processed: processedCount,
        lastProcessingRun: lastProcessed?.analyzedAt?.toISOString() ?? null,
      },
      entities: {
        critical: criticalEntities,
        high: highEntities,
        medium: mediumEntities,
        low: lowEntities,
        total: criticalEntities + highEntities + mediumEntities + lowEntities,
      },
      events: {
        analysisCompleted: recentAnalysisEvents,
      },
      agents: analysisAgents.map(a => ({
        agentId: a.agentId,
        name: a.name,
        status: a.status,
        health: a.health,
        messagesProcessed: a.messagesProcessed,
        lastHeartbeat: a.lastHeartbeat?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error('[Processing] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error fetching processing stats' },
      { status: 500 }
    );
  }
}
