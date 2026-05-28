import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';
import { db } from '@/lib/db';

export async function GET() {
  // Try to fetch conversations from Hermes service first
  const result = await fetchService<Record<string, unknown>[]>('hermes', '/conversations');

  if (result.data && Array.isArray(result.data)) {
    return NextResponse.json({ conversations: result.data, messages: {} });
  }

  // Fallback: derive conversations from raw messages in DB
  try {
    const recentMessages = await db.rawMessage.findMany({
      where: { channelName: { not: null } },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    // Group by channel
    const channelMap = new Map<string, typeof recentMessages>();
    for (const msg of recentMessages) {
      const key = msg.channelId || msg.channelName || 'unknown';
      if (!channelMap.has(key)) {
        channelMap.set(key, []);
      }
      channelMap.get(key)!.push(msg);
    }

    const conversations = Array.from(channelMap.entries()).map(([channelId, msgs], idx) => {
      const latest = msgs[0];
      return {
        id: `conv-${idx}`,
        contactId: channelId,
        contactName: latest.channelName || latest.senderName || 'Unknown',
        lastMessage: latest.content.substring(0, 80),
        lastMessageTime: latest.timestamp.toLocaleTimeString('en', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
        unreadCount: 0,
        status: 'active' as const,
      };
    });

    // Build messages map
    const messages: Record<string, Array<{
      id: string;
      conversationId: string;
      from: string;
      text: string;
      timestamp: string;
      type: 'incoming' | 'outgoing';
      status?: 'sent' | 'delivered' | 'read';
    }>> = {};

    for (const [channelId, msgs] of channelMap.entries()) {
      const convIdx = Array.from(channelMap.keys()).indexOf(channelId);
      const convId = `conv-${convIdx}`;
      messages[convId] = msgs.map((msg) => ({
        id: msg.id,
        conversationId: convId,
        from: msg.senderId || 'unknown',
        text: msg.content,
        timestamp: msg.timestamp.toLocaleTimeString('en', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
        type: 'incoming' as const,
      }));
    }

    return NextResponse.json({ conversations, messages });
  } catch {
    return NextResponse.json({ conversations: [], messages: {} });
  }
}
