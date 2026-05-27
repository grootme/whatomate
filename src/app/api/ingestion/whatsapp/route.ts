import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/intelligence/auth';
import { db } from '@/lib/db';
import { fetchService } from '@/lib/intelligence/service-client';
import { persistEvent } from '@/lib/intelligence/event-persist';
import type { AgentStatus } from '@/lib/intelligence/types';

// ===== WhatsApp Bridge Message Shape =====
interface WhatsAppBridgeMessage {
  id: string;
  from: string;           // sender phone number
  text?: string;
  chatName?: string;      // group name
  chatId?: string;
  timestamp?: string;
  fromMe?: boolean;
  type?: string;          // 'conversation', 'imageMessage', etc.
  mediaUrl?: string;
}

// ===== WhatsApp Webhook Push Message Shape =====
interface WhatsAppPushMessage {
  sourceId: string;
  channelName?: string;
  channelId?: string;
  senderName?: string;
  senderId?: string;
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

const AGENT_ID = 'ing-wa';
const AGENT_NAME = 'WhatsApp Bridge';
const AGENT_LAYER = 1;
const AGENT_LAYER_NAME = 'Ingesta';

// ===== GET: Fetch messages from WhatsApp bridge service and ingest =====
async function _GET() {
  try {
    // Step 1: Fetch recent messages from the Baileys bridge
    const messagesResponse = await fetchService<{
      messages?: WhatsAppBridgeMessage[];
    }>('whatsapp', '/messages');

    if (messagesResponse.error || !messagesResponse.data?.messages) {
      // Mark agent as error if service unavailable
      const agentState = await db.agentState.findUnique({ where: { agentId: AGENT_ID } });
      if (agentState) {
        await db.agentState.update({
          where: { agentId: AGENT_ID },
          data: {
            status: 'error' as AgentStatus,
            health: Math.max(0, agentState.health - 10),
          },
        });
      }
      return NextResponse.json(
        {
          error: messagesResponse.error || 'No messages data from WhatsApp bridge service',
          inserted: 0,
          duplicates: 0,
          groupsProcessed: 0,
          totalGroups: 0,
        },
        { status: 502 }
      );
    }

    const messages = messagesResponse.data.messages;
    const now = new Date();
    let inserted = 0;
    let duplicates = 0;

    // Track unique groups (chatIds) for group stats
    const groupSet = new Set<string>();
    const processedGroupSet = new Set<string>();

    // Step 2: Process each message
    for (const msg of messages) {
      // Skip messages with no text content
      if (!msg.text) continue;

      // Skip own outgoing messages
      if (msg.fromMe === true) continue;

      // Build sourceId and contentHash
      const sourceId = `wa_${msg.chatId}_${msg.id}`;
      const contentHash = `whatsapp:${sourceId}:${msg.text.substring(0, 50)}`;

      // Track groups
      if (msg.chatId) {
        groupSet.add(msg.chatId);
      }

      // Check for duplicate using source + sourceId unique constraint
      const existing = await db.rawMessage.findUnique({
        where: { source_sourceId: { source: 'whatsapp', sourceId } },
      });

      if (existing) {
        duplicates++;
        continue;
      }

      // Determine mediaType from message type
      const mediaType = msg.type && msg.type !== 'conversation' ? msg.type : null;

      // Insert into RawMessage table
      await db.rawMessage.create({
        data: {
          source: 'whatsapp',
          sourceId,
          channelName: msg.chatName ?? null,
          channelId: msg.chatId ?? null,
          senderName: msg.from ?? null,
          senderId: msg.from ?? null,
          content: msg.text,
          contentHash,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : now,
          metadata: JSON.stringify({
            type: msg.type ?? 'conversation',
            fromMe: msg.fromMe ?? false,
            mediaType,
            chatName: msg.chatName ?? null,
          }),
        },
      });

      inserted++;

      // Track which groups had new messages
      if (msg.chatId) {
        processedGroupSet.add(msg.chatId);
      }
    }

    // Step 3: Update AgentState for 'ing-wa'
    const agentState = await db.agentState.findUnique({ where: { agentId: AGENT_ID } });
    const health = inserted > 0
      ? Math.min(100, 70 + processedGroupSet.size * 5)
      : duplicates > 0
        ? 60  // duplicates mean service is alive but no new data
        : 30;

    const status: AgentStatus = inserted > 0 ? 'active' : duplicates > 0 ? 'warning' : 'warning';

    if (agentState) {
      await db.agentState.update({
        where: { agentId: AGENT_ID },
        data: {
          status,
          health,
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
          status,
          health,
          messagesProcessed: inserted,
          lastHeartbeat: now,
          startedAt: now,
        },
      });
    }

    // Step 4: Emit 'ingestion.batch_received' event using persistEvent
    // persistEvent handles both Redis Stream (via safeEventAppend) and SQLite durability
    const batchId = `whatsapp_batch_${Date.now()}`;

    await persistEvent('whatomate:whatsapp_messages', {
      eventType: 'ingestion.batch_received',
      aggregateId: batchId,
      aggregateType: 'agent',
      payload: {
        source: 'whatsapp',
        groupsProcessed: processedGroupSet.size,
        totalGroups: groupSet.size,
        inserted,
        duplicates,
        latency: messagesResponse.latency,
      },
      metadata: {
        bridgeService: 'baileys',
        agentId: AGENT_ID,
      },
    });

    return NextResponse.json({
      inserted,
      duplicates,
      groupsProcessed: processedGroupSet.size,
      totalGroups: groupSet.size,
      agent: {
        agentId: AGENT_ID,
        health,
        messagesProcessed: (agentState?.messagesProcessed ?? 0) + inserted,
      },
    });
  } catch (error) {
    console.error('[WhatsApp Ingestion] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error during WhatsApp ingestion' },
      { status: 500 }
    );
  }
}

// ===== POST: Accept messages pushed from the WhatsApp bridge (webhook-style) =====
async function _POST(request: Request) {
  try {
    const body = await request.json();
    const { messages } = body as {
      messages: WhatsAppPushMessage[];
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

    for (const msg of messages) {
      if (!msg.sourceId || !msg.content) continue;

      // Compute contentHash for deduplication
      const contentHash = `whatsapp:${msg.sourceId}:${msg.content.substring(0, 50)}`;

      // Check for duplicate (unique on source+sourceId)
      const existing = await db.rawMessage.findUnique({
        where: { source_sourceId: { source: 'whatsapp', sourceId: msg.sourceId } },
      });

      if (existing) {
        duplicates++;
        continue;
      }

      // Insert into RawMessage table
      await db.rawMessage.create({
        data: {
          source: 'whatsapp',
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
    }

    // Update AgentState for 'ing-wa'
    const agentState = await db.agentState.findUnique({ where: { agentId: AGENT_ID } });
    const health = inserted > 0
      ? Math.min(100, 80)
      : duplicates > 0
        ? 60
        : 30;

    const status: AgentStatus = inserted > 0 ? 'active' : 'warning';

    if (agentState) {
      await db.agentState.update({
        where: { agentId: AGENT_ID },
        data: {
          status,
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
          status,
          health,
          messagesProcessed: inserted,
          lastHeartbeat: now,
          startedAt: now,
        },
      });
    }

    // Emit batch event using persistEvent
    if (inserted > 0) {
      const batchId = `whatsapp_webhook_${Date.now()}`;

      await persistEvent('whatomate:whatsapp_messages', {
        eventType: 'ingestion.batch_received',
        aggregateId: batchId,
        aggregateType: 'agent',
        payload: {
          source: 'whatsapp',
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

    return NextResponse.json({
      inserted,
      duplicates,
      agent: {
        agentId: AGENT_ID,
        health,
        messagesProcessed: (agentState?.messagesProcessed ?? 0) + inserted,
      },
    });
  } catch (error) {
    console.error('[WhatsApp Ingestion] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error during WhatsApp webhook ingestion' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(_GET);
export const POST = withAuth(_POST);
