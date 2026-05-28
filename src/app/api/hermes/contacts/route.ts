import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';
import { db } from '@/lib/db';

export async function GET() {
  // Try to fetch contacts from Hermes service first
  const result = await fetchService<Record<string, unknown>[]>('hermes', '/contacts');

  if (result.data && Array.isArray(result.data)) {
    return NextResponse.json({ contacts: result.data });
  }

  // Fallback: derive contacts from raw messages in DB
  try {
    const senders = await db.rawMessage.findMany({
      where: { senderName: { not: null } },
      select: { senderId: true, senderName: true, source: true },
      distinct: ['senderId'],
      take: 50,
    });

    const contacts = senders.map((s, idx) => ({
      id: s.senderId || `contact-${idx}`,
      name: s.senderName || 'Unknown',
      phone: s.senderId || '',
      tags: [s.source === 'whatsapp' ? 'WhatsApp' : s.source === 'telegram' ? 'Telegram' : 'OSINT'],
      lastSeen: 'Recent',
    }));

    return NextResponse.json({ contacts });
  } catch {
    return NextResponse.json({ contacts: [] });
  }
}
