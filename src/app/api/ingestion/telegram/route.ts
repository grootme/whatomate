import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/intelligence/auth';
import { db } from '@/lib/db';
import { persistEvent } from '@/lib/intelligence/event-persist';
import { fetchService } from '@/lib/intelligence/service-client';
import { strategyRegistry } from '@/lib/intelligence/strategies';
import { buildStrategyContext } from '@/lib/intelligence/context-builder';
// ===== Telegram Webhook Push Message Shape =====
interface TelegramPushMessage {
  sourceId: string;
  channelName?: string;
  channelId?: string;
  senderName?: string;
  senderId?: string;
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

const AGENT_ID = 'ing-tg';
const AGENT_NAME = 'Telethon (Telegram)';
const AGENT_LAYER = 1;
const AGENT_LAYER_NAME = 'Ingesta';

// ===== GET: Fetch messages from Telethon service and ingest =====
async function _GET() {
  try {
    // Track inserted messages for strategy context
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

    // Step 1: Get list of groups from the Telegram service
    const groupsResponse = await fetchService<{
      groups?: Array<{
        chat_id: number;
        title: string;
        member_count?: number;
        username?: string;
      }>;
    }>('telegram', '/groups');

    if (groupsResponse.error || !groupsResponse.data?.groups) {
      // Mark agent as error if service unavailable
      const agentState = await db.agentState.findUnique({ where: { agentId: AGENT_ID } });
      if (agentState) {
        await db.agentState.update({
          where: { agentId: AGENT_ID },
          data: { status: 'error', health: Math.max(0, agentState.health - 10) },
        });
      }
      return NextResponse.json({
        error: groupsResponse.error || 'No groups data from Telegram service',
        inserted: 0,
        groups: 0,
      }, { status: 502 });
    }

    const groups = groupsResponse.data.groups;
    const now = new Date();
    let totalInserted = 0;
    let totalDuplicates = 0;
    let groupsProcessed = 0;

    // Step 2: For top N groups (sorted by member count), fetch messages
    const TOP_N = 10;
    const sortedGroups = [...groups].sort((a, b) =>
      (b.member_count ?? 0) - (a.member_count ?? 0)
    ).slice(0, TOP_N);

    for (const group of sortedGroups) {
      try {
        const messagesResponse = await fetchService<{
          messages?: Array<{
            id: number;
            text?: string;
            sender_id?: number;
            sender_first_name?: string;
            sender_last_name?: string;
            sender_username?: string;
            date?: string;
            reply_to_msg_id?: number;
            forwarded_from?: string;
            media_type?: string;
          }>;
        }>('telegram', `/groups/${group.chat_id}/messages?limit=20`);

        if (messagesResponse.error || !messagesResponse.data?.messages) {
          continue;
        }

        const messages = messagesResponse.data.messages;
        let groupInserted = 0;

        for (const msg of messages) {
          if (!msg.id || !msg.text) continue;

          const sourceId = `tg_${group.chat_id}_${msg.id}`;
          const contentHash = `telegram:${sourceId}:${msg.text.substring(0, 50)}`;

          // Check for duplicate
          const existing = await db.rawMessage.findUnique({
            where: { source_sourceId: { source: 'telegram', sourceId } },
          });

          if (existing) {
            totalDuplicates++;
            continue;
          }

          const senderName = [msg.sender_first_name, msg.sender_last_name]
            .filter(Boolean)
            .join(' ') || msg.sender_username || 'Unknown';

          const rawMessage = await db.rawMessage.create({
            data: {
              source: 'telegram',
              sourceId,
              channelName: group.title,
              channelId: String(group.chat_id),
              senderName,
              senderId: msg.sender_id ? String(msg.sender_id) : null,
              content: msg.text,
              contentHash,
              timestamp: msg.date ? new Date(msg.date) : now,
              metadata: JSON.stringify({
                type: 'telegram_message',
                chatId: group.chat_id,
                chatUsername: group.username,
                replyTo: msg.reply_to_msg_id,
                forwardedFrom: msg.forwarded_from,
                mediaType: msg.media_type,
                senderUsername: msg.sender_username,
              }),
            },
          });

          insertedMessages.push(rawMessage);
          groupInserted++;
          totalInserted++;
        }

        if (groupInserted > 0) groupsProcessed++;
      } catch (err) {
        // Continue with other groups if one fails
        console.error(`[Telegram Ingestion] Error processing group ${group.chat_id}:`, err);
      }
    }

    // Step 3: Update AgentState for ing-tg
    const agentState = await db.agentState.findUnique({ where: { agentId: AGENT_ID } });
    const health = groupsProcessed > 0 ? Math.min(100, 70 + groupsProcessed * 3) : 30;

    if (agentState) {
      await db.agentState.update({
        where: { agentId: AGENT_ID },
        data: {
          status: totalInserted > 0 ? 'active' : 'warning',
          health,
          lastHeartbeat: now,
          messagesProcessed: agentState.messagesProcessed + totalInserted,
          startedAt: agentState.startedAt ?? now,
        },
      });
    } else {
      await db.agentState.create({
        data: {
          agentId: AGENT_ID,
          name: AGENT_NAME,
          layer: AGENT_LAYER,
          layerName: AGENT_LAYER_NAME,
          status: totalInserted > 0 ? 'active' : 'warning',
          health,
          messagesProcessed: totalInserted,
          lastHeartbeat: now,
          startedAt: now,
        },
      });
    }

    // Step 4: Emit event using persistEvent (handles both Redis Stream and SQLite)
    const batchId = `telegram_batch_${Date.now()}`;

    await persistEvent('whatomate:telegram_messages', {
      eventType: 'ingestion.batch_received',
      aggregateId: batchId,
      aggregateType: 'agent',
      payload: {
        source: 'telegram',
        groupsProcessed,
        totalGroups: groups.length,
        inserted: totalInserted,
        duplicates: totalDuplicates,
      },
      metadata: {
        agentId: AGENT_ID,
      },
    });

    // ===== AUTO-TRIGGER STRATEGY EVALUATION =====
    // After ingestion, automatically evaluate all 6 strategies
    // using the newly ingested messages as context
    const strategyResults: Array<{ strategy: string; action: string; confidence: number; reasoning: string }> = [];
    let alertsFromStrategies = 0;

    if (totalInserted > 0) {
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

            // Persist strategy result event via persistEvent
            await persistEvent('whatomate:decisions', {
              eventType: 'monitoring.alert_generated',
              aggregateId: `strategy_${strategy.id}_${Date.now()}`,
              aggregateType: 'alert',
              payload: {
                strategy: strategy.id,
                action: result.action,
                severity: result.severity,
                confidence: result.confidence,
                reasoning: result.reasoning,
                triggeredBy: 'telegram_ingestion',
                source: 'telegram',
              },
              metadata: { strategyId: strategy.id, autoTriggered: true },
            });
          } catch (err) {
            console.error(`[Telegram Ingestion] Strategy ${strategy.id} auto-evaluation error:`, err);
            strategyResults.push({
              strategy: strategy.id,
              action: 'error',
              confidence: 0,
              reasoning: `Evaluation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
            });
          }
        }
      } catch (ctxErr) {
        console.error('[Telegram Ingestion] Failed to build strategy context for auto-evaluation:', ctxErr);
      }
    }

    return NextResponse.json({
      inserted: totalInserted,
      duplicates: totalDuplicates,
      groupsProcessed,
      totalGroups: groups.length,
      agent: {
        agentId: AGENT_ID,
        health,
        messagesProcessed: (agentState?.messagesProcessed ?? 0) + totalInserted,
      },
      strategyEvaluation: {
        triggered: totalInserted > 0,
        results: strategyResults,
        alertsGenerated: alertsFromStrategies,
      },
    });
  } catch (error) {
    console.error('[Telegram Ingestion] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error during Telegram ingestion' },
      { status: 500 }
    );
  }
}

// ===== POST: Accept messages pushed from Telegram (webhook-style) =====
async function _POST(request: Request) {
  try {
    const body = await request.json();
    const { messages } = body as {
      messages: TelegramPushMessage[];
    };

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Missing required field: messages (array)' },
        { status: 400 }
      );
    }

    const now = new Date();
    let inserted = 0;
    let duplicates = 0;

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
      const contentHash = `telegram:${msg.sourceId}:${msg.content.substring(0, 50)}`;

      // Check for duplicate (unique on source+sourceId)
      const existing = await db.rawMessage.findUnique({
        where: { source_sourceId: { source: 'telegram', sourceId: msg.sourceId } },
      });

      if (existing) {
        duplicates++;
        continue;
      }

      // Insert into RawMessage table
      const rawMessage = await db.rawMessage.create({
        data: {
          source: 'telegram',
          sourceId: msg.sourceId,
          channelName: msg.channelName ?? null,
          channelId: msg.channelId ?? null,
          senderName: msg.senderName ?? null,
          senderId: msg.senderId ?? null,
          content: msg.content,
          contentHash,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : now,
          metadata: msg.metadata ? JSON.stringify(msg.metadata) : null,
        },
      });

      inserted++;
      insertedMessages.push(rawMessage);
    }

    // Update AgentState for 'ing-tg'
    const agentState = await db.agentState.findUnique({ where: { agentId: AGENT_ID } });
    const health = inserted > 0 ? Math.min(100, 80) : duplicates > 0 ? 60 : 30;

    if (agentState) {
      await db.agentState.update({
        where: { agentId: AGENT_ID },
        data: {
          status: inserted > 0 ? 'active' : 'warning',
          health: Math.min(100, Math.max(agentState.health, health)),
          lastHeartbeat: now,
          messagesProcessed: agentState.messagesProcessed + inserted,
          startedAt: agentState.startedAt ?? now,
        },
      });
    } else {
      await db.agentState.create({
        data: {
          agentId: AGENT_ID,
          name: AGENT_NAME,
          layer: AGENT_LAYER,
          layerName: AGENT_LAYER_NAME,
          status: inserted > 0 ? 'active' : 'warning',
          health,
          messagesProcessed: inserted,
          lastHeartbeat: now,
          startedAt: now,
        },
      });
    }

    // Emit batch event using persistEvent
    if (inserted > 0) {
      const batchId = `telegram_webhook_${Date.now()}`;

      await persistEvent('whatomate:telegram_messages', {
        eventType: 'ingestion.batch_received',
        aggregateId: batchId,
        aggregateType: 'agent',
        payload: {
          source: 'telegram',
          mode: 'webhook',
          inserted,
          duplicates,
        },
        metadata: {
          agentId: AGENT_ID,
          deliveryMethod: 'push',
        },
      });
    }

    // ===== AUTO-TRIGGER STRATEGY EVALUATION =====
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

            await persistEvent('whatomate:decisions', {
              eventType: 'monitoring.alert_generated',
              aggregateId: `strategy_${strategy.id}_${Date.now()}`,
              aggregateType: 'alert',
              payload: {
                strategy: strategy.id,
                action: result.action,
                severity: result.severity,
                confidence: result.confidence,
                reasoning: result.reasoning,
                triggeredBy: 'telegram_webhook',
                source: 'telegram',
              },
              metadata: { strategyId: strategy.id, autoTriggered: true },
            });
          } catch (err) {
            console.error(`[Telegram Webhook] Strategy ${strategy.id} auto-evaluation error:`, err);
            strategyResults.push({
              strategy: strategy.id,
              action: 'error',
              confidence: 0,
              reasoning: `Evaluation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
            });
          }
        }
      } catch (ctxErr) {
        console.error('[Telegram Webhook] Failed to build strategy context for auto-evaluation:', ctxErr);
      }
    }

    return NextResponse.json({
      inserted,
      duplicates,
      agent: {
        agentId: AGENT_ID,
        health,
        messagesProcessed: (agentState?.messagesProcessed ?? 0) + inserted,
      },
      strategyEvaluation: {
        triggered: inserted > 0,
        results: strategyResults,
        alertsGenerated: alertsFromStrategies,
      },
    });
  } catch (error) {
    console.error('[Telegram Ingestion] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error during Telegram webhook ingestion' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(_GET);
export const POST = withAuth(_POST);