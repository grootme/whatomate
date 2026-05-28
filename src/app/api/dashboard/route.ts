import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/intelligence/auth';

async function _GET() {
  // ===== Try Go backend first =====
  const goResult = await fetchService<Record<string, unknown>>('goBackend', '/dashboard');
  if (!goResult.error && goResult.data) {
    return NextResponse.json(goResult.data);
  }

  // ===== Fallback to local Next.js intelligence engine =====
  console.warn('[api/dashboard] Go backend unavailable, using local fallback:', goResult.error);

  try {
    // Compute dashboard stats from real DB data
    const [
      totalEntities,
      activeAlerts,
      totalMessages,
      totalPatterns,
    ] = await Promise.all([
      db.entity.count(),
      db.alert.count({ where: { acknowledged: false } }),
      db.rawMessage.count(),
      db.patternDetection.count(),
    ]);

    // Build weekly analytics for the last 7 days
    const daysArray = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      return {
        day: dayStart.toLocaleDateString('en', { weekday: 'short' }),
        dateStart: dayStart,
        dateEnd: dayEnd,
      };
    });

    const weeklyAnalytics = await Promise.all(
      daysArray.map(async (dayInfo) => {
        const [sent, received] = await Promise.all([
          db.rawMessage.count({
            where: { timestamp: { gte: dayInfo.dateStart, lt: dayInfo.dateEnd } },
          }),
          db.intelligenceEvent.count({
            where: {
              timestamp: { gte: dayInfo.dateStart, lt: dayInfo.dateEnd },
              eventType: { contains: 'ingestion' },
            },
          }),
        ]);
        return { day: dayInfo.day, sent, received };
      })
    );

    // Compute growth percentages from last 30 days vs previous 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const [currentPeriodEntities, previousPeriodEntities] = await Promise.all([
      db.entity.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      db.entity.count({ where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    ]);

    const [currentPeriodMessages, previousPeriodMessages] = await Promise.all([
      db.rawMessage.count({ where: { timestamp: { gte: thirtyDaysAgo } } }),
      db.rawMessage.count({ where: { timestamp: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    ]);

    const [currentPeriodAlerts, previousPeriodAlerts] = await Promise.all([
      db.alert.count({ where: { timestamp: { gte: thirtyDaysAgo } } }),
      db.alert.count({ where: { timestamp: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    ]);

    const [currentPeriodPatterns, previousPeriodPatterns] = await Promise.all([
      db.patternDetection.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      db.patternDetection.count({ where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    ]);

    const entityGrowth =
      previousPeriodEntities > 0
        ? Number((((currentPeriodEntities - previousPeriodEntities) / previousPeriodEntities) * 100).toFixed(1))
        : 0;

    const messageGrowth =
      previousPeriodMessages > 0
        ? Number((((currentPeriodMessages - previousPeriodMessages) / previousPeriodMessages) * 100).toFixed(1))
        : 0;

    const alertGrowth =
      previousPeriodAlerts > 0
        ? Number((((currentPeriodAlerts - previousPeriodAlerts) / previousPeriodAlerts) * 100).toFixed(1))
        : 0;

    const patternGrowth =
      previousPeriodPatterns > 0
        ? Number((((currentPeriodPatterns - previousPeriodPatterns) / previousPeriodPatterns) * 100).toFixed(1))
        : 0;

    // Recent activity — use recent raw messages as proxy
    const recentMessages = await db.rawMessage.findMany({
      where: { senderName: { not: null } },
      orderBy: { timestamp: 'desc' },
      take: 10,
      distinct: ['senderId'],
    });

    const recentActivity = recentMessages.map((msg) => ({
      id: msg.id,
      contactName: msg.senderName || 'Unknown',
      lastMessage: msg.content.substring(0, 60),
      lastMessageTime: msg.timestamp.toLocaleTimeString('en', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      unreadCount: 0,
      status: 'active' as const,
    }));

    // Monthly analytics - last 6 months
    const monthsArray = Array.from({ length: 6 }, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - i));
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      return { month: monthStart.toLocaleDateString('en', { month: 'short' }), monthStart, monthEnd };
    });

    const monthlyAnalytics = await Promise.all(
      monthsArray.map(async (info) => {
        const [conversations, messages] = await Promise.all([
          db.rawMessage.count({
            where: { timestamp: { gte: info.monthStart, lt: info.monthEnd } },
          }),
          db.intelligenceEvent.count({
            where: { timestamp: { gte: info.monthStart, lt: info.monthEnd } },
          }),
        ]);
        return { month: info.month, conversations, messages };
      })
    );

    // ===== Threat Level Computation =====
    const enabledThresholds = await db.thresholdConfig.findMany({
      where: { enabled: true },
    });

    const severityPoints: Record<string, number> = {
      'CRÍTICA': 4,
      'ALTA': 3,
      'MEDIA': 2,
      'BAJA': 1,
      'INFO': 0,
    };

    let threatScore = 0;
    for (const t of enabledThresholds) {
      if (t.currentValue >= t.value) {
        threatScore += severityPoints[t.alertSeverity] ?? 0;
      }
    }

    // Map total score to threat level: 0-2=low, 3-5=medium, 6-8=high, 9+=critical
    const threatLevel: 'low' | 'medium' | 'high' | 'critical' =
      threatScore >= 9 ? 'critical' :
      threatScore >= 6 ? 'high' :
      threatScore >= 3 ? 'medium' : 'low';

    // ===== Maritime / OSINT Data =====
    let maritime: {
      totalVessels: number;
      militaryVessels: number;
      zoneCounts: Record<string, number>;
      threatAdvisories: string[];
    } | null = null;

    try {
      const osintResult = await fetchService<{
        ships?: Array<Record<string, unknown>>;
        threat_level?: string;
      }>('osint', '/api/live-data');

      if (!osintResult.error && osintResult.data?.ships) {
        const ships = osintResult.data.ships;
        const militaryVessels = ships.filter(
          (s) => typeof s.type === 'string' && ['warship', 'naval', 'military'].includes(s.type.toLowerCase())
        ).length;

        // Compute zone-based vessel counts (group by 10-degree lat bands)
        const zoneCounts: Record<string, number> = {};
        const advisories: string[] = [];
        for (const ship of ships) {
          const lat = typeof ship.lat === 'number' ? ship.lat : 0;
          const zoneBand = `${Math.floor(lat / 10) * 10}°${lat >= 0 ? 'N' : 'S'}`;
          zoneCounts[zoneBand] = (zoneCounts[zoneBand] || 0) + 1;
        }

        if (militaryVessels > 0) {
          advisories.push(`${militaryVessels} military/naval vessel(s) detected in monitored zones`);
        }
        if (osintResult.data.threat_level === 'high' || osintResult.data.threat_level === 'critical') {
          advisories.push(`OSINT threat level elevated: ${osintResult.data.threat_level}`);
        }

        maritime = {
          totalVessels: ships.length,
          militaryVessels,
          zoneCounts,
          threatAdvisories: advisories,
        };
      }
    } catch {
      // OSINT service unavailable — maritime section stays null
    }

    return NextResponse.json({
      stats: {
        totalEntities,
        activeAlerts,
        totalMessages,
        activePatterns: totalPatterns,
        entityGrowth,
        alertGrowth,
        messageGrowth,
        patternGrowth,
      },
      weeklyAnalytics,
      monthlyAnalytics,
      recentActivity,
      threatLevel,
      threatScore,
      maritime,
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: 'Internal server error fetching dashboard data' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(_GET);
