import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { safeEventAppend } from '@/lib/intelligence/safe-event';
import { fetchService } from '@/lib/intelligence/service-client';

// ===== GET: Fetch messages from Telethon service and ingest =====
export async function GET() {
  try {
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
      const agentState = await db.agentState.findUnique({ where: { agentId: 'ing-tg' } });
      if (agentState) {
        await db.agentState.update({
          where: { agentId: 'ing-tg' },
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

          await db.rawMessage.create({
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
    const agentState = await db.agentState.findUnique({ where: { agentId: 'ing-tg' } });
    const health = groupsProcessed > 0 ? Math.min(100, 70 + groupsProcessed * 3) : 30;

    if (agentState) {
      await db.agentState.update({
        where: { agentId: 'ing-tg' },
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
          agentId: 'ing-tg',
          name: 'Telethon (Telegram)',
          layer: 1,
          layerName: 'Ingesta',
          status: totalInserted > 0 ? 'active' : 'warning',
          health,
          messagesProcessed: totalInserted,
          lastHeartbeat: now,
          startedAt: now,
        },
      });
    }

    // Step 4: Emit event (non-blocking, with timeout)
    const batchId = `telegram_batch_${Date.now()}`;

    safeEventAppend('whatomate:telegram_messages', {
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
    });

    // Persist event to SQLite for durability
    await db.intelligenceEvent.create({
      data: {
        eventType: 'ingestion.batch_received',
        aggregateId: batchId,
        aggregateType: 'agent',
        stream: 'whatomate:telegram_messages',
        payload: JSON.stringify({
          source: 'telegram',
          groupsProcessed,
          totalGroups: groups.length,
          inserted: totalInserted,
          duplicates: totalDuplicates,
        }),
        processed: false,
      },
    });

    return NextResponse.json({
      inserted: totalInserted,
      duplicates: totalDuplicates,
      groupsProcessed,
      totalGroups: groups.length,
      agent: {
        agentId: 'ing-tg',
        health,
        messagesProcessed: (agentState?.messagesProcessed ?? 0) + totalInserted,
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
