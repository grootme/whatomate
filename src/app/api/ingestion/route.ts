import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { safeEventAppend } from '@/lib/intelligence/safe-event';
import { strategyRegistry } from '@/lib/intelligence/strategies';
import { buildStrategyContext } from '@/lib/intelligence/context-builder';
import type { MessageSource, EventStream } from '@/lib/intelligence/types';

// ===== SUSPICIOUS KEYWORDS for fraud detection =====
const FRAUD_KEYWORDS = ['fraude', 'estafa', 'scam', 'crypto', 'invertir', 'dinero'];

// ===== POST: Ingest messages from any source =====
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { source, messages } = body as {
      source: MessageSource;
      messages: Array<{
        sourceId: string;
        channelName?: string;
        channelId?: string;
        senderName?: string;
        senderId?: string;
        content: string;
        timestamp?: string;
        metadata?: Record<string, unknown>;
      }>;
    };

    if (!source || !messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Missing required fields: source, messages' },
        { status: 400 }
      );
    }

    const validSources: MessageSource[] = ['whatsapp', 'telegram', 'osint'];
    if (!validSources.includes(source)) {
      return NextResponse.json(
        { error: `Invalid source. Must be one of: ${validSources.join(', ')}` },
        { status: 400 }
      );
    }

    let inserted = 0;
    let duplicates = 0;
    let events = 0;
    let suspiciousCount = 0;

    const streamMap: Record<MessageSource, EventStream> = {
      whatsapp: 'whatomate:whatsapp_messages',
      telegram: 'whatomate:telegram_messages',
      osint: 'whatomate:osint_events',
    };

    const insertedMessages: Array<{
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
    }> = [];

    for (const msg of messages) {
      if (!msg.sourceId || !msg.content) continue;

      // Compute contentHash for deduplication
      const contentHash = `${source}:${msg.sourceId}:${msg.content.substring(0, 50)}`;

      // Check for duplicate (unique on source+sourceId)
      const existing = await db.rawMessage.findUnique({
        where: { source_sourceId: { source, sourceId: msg.sourceId } },
      });

      if (existing) {
        duplicates++;
        continue;
      }

      // Insert into RawMessage table
      const rawMessage = await db.rawMessage.create({
        data: {
          source,
          sourceId: msg.sourceId,
          channelName: msg.channelName,
          channelId: msg.channelId,
          senderName: msg.senderName,
          senderId: msg.senderId,
          content: msg.content,
          contentHash,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
          metadata: msg.metadata ? JSON.stringify(msg.metadata) : null,
        },
      });

      inserted++;
      insertedMessages.push(rawMessage);

      // Check for suspicious content
      const contentLower = msg.content.toLowerCase();
      const isSuspicious = FRAUD_KEYWORDS.some(kw => contentLower.includes(kw));
      if (isSuspicious) suspiciousCount++;

      // Emit event to Redis Stream (non-blocking, with timeout)
      safeEventAppend(streamMap[source], {
        eventType: 'ingestion.raw_message',
        aggregateId: rawMessage.id,
        aggregateType: 'message',
        payload: {
          source,
          sourceId: msg.sourceId,
          channelName: msg.channelName,
          senderName: msg.senderName,
          contentPreview: msg.content.substring(0, 200),
          suspicious: isSuspicious,
        },
        metadata: { contentHash, channelId: msg.channelId },
      });

      // Persist event to IntelligenceEvent table for durability
      await db.intelligenceEvent.create({
        data: {
          eventType: 'ingestion.raw_message',
          aggregateId: rawMessage.id,
          aggregateType: 'message',
          stream: streamMap[source],
          payload: JSON.stringify({
            source,
            sourceId: msg.sourceId,
            channelName: msg.channelName,
            suspicious: isSuspicious,
          }),
          metadata: JSON.stringify({ contentHash }),
          processed: false,
        },
      });

      events++;
    }

    // Update AgentState for the corresponding ingestion agent
    const agentIdMap: Record<MessageSource, string> = {
      whatsapp: 'ing-wa',
      telegram: 'ing-tg',
      osint: 'ing-os',
    };
    const agentId = agentIdMap[source];
    const agentState = await db.agentState.findUnique({ where: { agentId } });

    const now = new Date();
    // Compute health: based on heartbeat freshness (100 if just now, declining over time)
    const healthFromHeartbeat = agentState?.lastHeartbeat
      ? Math.max(0, Math.min(100, 100 - Math.floor((now.getTime() - agentState.lastHeartbeat.getTime()) / (60 * 1000))))
      : 50;

    if (agentState) {
      await db.agentState.update({
        where: { agentId },
        data: {
          messagesProcessed: agentState.messagesProcessed + inserted,
          lastHeartbeat: now,
          status: 'active',
          health: Math.min(100, Math.max(healthFromHeartbeat, 80)),
          startedAt: agentState.startedAt ?? now,
        },
      });
    } else {
      await db.agentState.create({
        data: {
          agentId,
          name: source === 'whatsapp' ? 'WhatsApp Bridge' : source === 'telegram' ? 'Telethon (Telegram)' : 'OSINT Shadowbroker',
          layer: 1,
          layerName: 'Ingesta',
          messagesProcessed: inserted,
          lastHeartbeat: now,
          status: 'active',
          health: 90,
          startedAt: now,
        },
      });
    }

    // Update threshold currentValue for fraud_mentions_per_hour
    if (suspiciousCount > 0) {
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Count messages containing fraud keywords in the last hour
      const allRecentMessages = await db.rawMessage.findMany({
        where: {
          timestamp: { gte: oneHourAgo },
        },
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

    // Update threshold currentValue for suspicious_messages
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

    // ===== AUTO-TRIGGER STRATEGY EVALUATION =====
    // After ingestion, automatically evaluate all 6 strategies
    // using the newly ingested messages as context
    const strategyResults: Array<{ strategy: string; action: string; confidence: number; reasoning: string }> = [];
    let alertsFromStrategies = 0;

    if (inserted > 0) {
      try {
        const context = await buildStrategyContext(insertedMessages);
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
              alertsFromStrategies++;
            }

            // Create IntelligenceEvent for each strategy result
            await db.intelligenceEvent.create({
              data: {
                eventType: 'monitoring.alert_generated',
                aggregateId: `strategy_${strategy.id}_${Date.now()}`,
                aggregateType: 'alert',
                stream: 'whatomate:decisions',
                payload: JSON.stringify({
                  strategy: strategy.id,
                  action: result.action,
                  severity: result.severity,
                  confidence: result.confidence,
                  reasoning: result.reasoning,
                  triggeredBy: 'ingestion',
                  source,
                }),
                metadata: JSON.stringify({ strategyId: strategy.id, autoTriggered: true }),
                processed: false,
              },
            });
          } catch (err) {
            console.error(`[Ingestion] Strategy ${strategy.id} auto-evaluation error:`, err);
            strategyResults.push({
              strategy: strategy.id,
              action: 'error',
              confidence: 0,
              reasoning: `Evaluation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
            });
          }
        }
      } catch (ctxErr) {
        console.error('[Ingestion] Failed to build strategy context for auto-evaluation:', ctxErr);
      }
    }

    return NextResponse.json({
      inserted,
      duplicates,
      events,
      suspiciousCount,
      source,
      strategyEvaluation: {
        triggered: inserted > 0,
        results: strategyResults,
        alertsGenerated: alertsFromStrategies,
      },
    });
  } catch (error) {
    console.error('[Ingestion] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error during ingestion' },
      { status: 500 }
    );
  }
}

// ===== GET: Return ingestion stats from DB =====
export async function GET() {
  try {
    // Total messages by source
    const whatsappCount = await db.rawMessage.count({ where: { source: 'whatsapp' } });
    const telegramCount = await db.rawMessage.count({ where: { source: 'telegram' } });
    const osintCount = await db.rawMessage.count({ where: { source: 'osint' } });

    // Recent message counts
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const lastHourCount = await db.rawMessage.count({
      where: { timestamp: { gte: oneHourAgo } },
    });
    const last24hCount = await db.rawMessage.count({
      where: { timestamp: { gte: twentyFourHoursAgo } },
    });

    // Unprocessed count
    const unprocessedCount = await db.rawMessage.count({
      where: { processed: false },
    });

    // Current threshold values
    const thresholds = await db.thresholdConfig.findMany({
      where: { enabled: true },
      select: { id: true, name: true, metric: true, currentValue: true, value: true, unit: true, condition: true },
    });

    // Recent ingestion events from IntelligenceEvent table
    const recentEvents = await db.intelligenceEvent.findMany({
      where: { eventType: 'ingestion.raw_message' },
      orderBy: { timestamp: 'desc' },
      take: 10,
    });

    // Agent states for ingestion agents
    const ingestionAgents = await db.agentState.findMany({
      where: { agentId: { in: ['ing-wa', 'ing-tg', 'ing-os'] } },
    });

    return NextResponse.json({
      totals: {
        whatsapp: whatsappCount,
        telegram: telegramCount,
        osint: osintCount,
        all: whatsappCount + telegramCount + osintCount,
      },
      recent: {
        lastHour: lastHourCount,
        last24h: last24hCount,
      },
      unprocessed: unprocessedCount,
      thresholds,
      recentEvents: recentEvents.length,
      agents: ingestionAgents.map(a => ({
        agentId: a.agentId,
        name: a.name,
        status: a.status,
        health: a.health,
        messagesProcessed: a.messagesProcessed,
        lastHeartbeat: a.lastHeartbeat?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error('[Ingestion] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error fetching ingestion stats' },
      { status: 500 }
    );
  }
}
