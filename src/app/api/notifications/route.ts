import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/intelligence/auth';
import { getChannelStatus, notifyAlert, notifySystemEvent } from '@/lib/intelligence/notification-channel';
import { fetchService } from '@/lib/intelligence/service-client';
import { db } from '@/lib/db';

/**
 * GET /api/notifications
 * Returns the current status of all notification channels.
 */
async function _GET() {
  const status = getChannelStatus();

  // Also check if Hermes Telegram bot is actually reachable
  let telegramReachable = false;
  try {
    const healthCheck = await fetchService<{ status: string }>('hermes', '/health');
    telegramReachable = healthCheck.data?.status === 'ok' || healthCheck.data != null;
  } catch {
    telegramReachable = false;
  }

  // Get recent notification events from DB
  let recentNotificationCount = 0;
  try {
    recentNotificationCount = await db.intelligenceEvent.count({
      where: {
        eventType: {
          in: ['monitoring.alert_generated', 'monitoring.alert_escalated'],
        },
      },
    });
  } catch {
    // ignore DB errors
  }

  return NextResponse.json({
    channels: {
      ...status,
      telegram: {
        ...status.telegram,
        reachable: telegramReachable,
      },
    },
    stats: {
      totalNotificationEvents: recentNotificationCount,
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/notifications
 * Sends a test notification to the specified channel.
 *
 * Body: { channel: 'telegram' | 'webhook' | 'console', message: string }
 */
async function _POST(request: Request) {
  const body = await request.json();
  const { channel, message } = body as { channel: string; message: string };

  if (!channel || !message) {
    return NextResponse.json(
      { error: 'Missing required fields: channel, message' },
      { status: 400 }
    );
  }

  const validChannels = ['telegram', 'webhook', 'console'];
  if (!validChannels.includes(channel)) {
    return NextResponse.json(
      { error: `Invalid channel. Must be one of: ${validChannels.join(', ')}` },
      { status: 400 }
    );
  }

  const testAlertId = `test_${Date.now()}`;

  switch (channel) {
    case 'telegram': {
      try {
        const telegramMessage = `🧪 *TEST NOTIFICATION*\n${message}\n_Time: ${new Date().toISOString()}_`;

        const result = await fetchService('hermes', '/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: telegramMessage,
            parseMode: 'Markdown',
            type: 'test',
            alertId: testAlertId,
          }),
        });

        if (result.error) {
          return NextResponse.json(
            {
              success: false,
              channel: 'telegram',
              error: result.error,
              message: 'Telegram test notification failed',
            },
            { status: 502 }
          );
        }

        return NextResponse.json({
          success: true,
          channel: 'telegram',
          message: 'Test notification sent via Telegram',
          latency: result.latency,
        });
      } catch (err) {
        return NextResponse.json(
          {
            success: false,
            channel: 'telegram',
            error: err instanceof Error ? err.message : 'Unknown error',
            message: 'Telegram test notification failed',
          },
          { status: 500 }
        );
      }
    }

    case 'webhook': {
      const webhookUrl = process.env.ALERT_WEBHOOK_URL;
      if (!webhookUrl) {
        return NextResponse.json(
          {
            success: false,
            channel: 'webhook',
            error: 'ALERT_WEBHOOK_URL environment variable not set',
            message: 'Webhook not configured',
          },
          { status: 400 }
        );
      }

      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'test_notification',
            message,
            testAlertId,
            notifiedAt: new Date().toISOString(),
          }),
        });

        if (!response.ok) {
          return NextResponse.json(
            {
              success: false,
              channel: 'webhook',
              error: `HTTP ${response.status}`,
              message: 'Webhook test notification failed',
            },
            { status: 502 }
          );
        }

        return NextResponse.json({
          success: true,
          channel: 'webhook',
          message: 'Test notification sent via webhook',
          statusCode: response.status,
        });
      } catch (err) {
        return NextResponse.json(
          {
            success: false,
            channel: 'webhook',
            error: err instanceof Error ? err.message : 'Unknown error',
            message: 'Webhook test notification failed',
          },
          { status: 500 }
        );
      }
    }

    case 'console': {
      // Send a test console notification
      console.log(
        `\x1b[36m[TEST NOTIFICATION]\x1b[0m ${message} (at ${new Date().toISOString()})`
      );

      // Also test the notifyAlert function with a mock alert for console channel
      await notifyAlert({
        id: testAlertId,
        source: 'test',
        severity: 'MEDIA',
        title: `Test: ${message}`,
        description: 'This is a test notification dispatched to console',
        strategy: 'threshold',
        acknowledged: false,
        escalated: false,
        timestamp: new Date(),
      });

      // Also test system event notification
      await notifySystemEvent('test_event', { message, triggeredBy: 'api_test' });

      return NextResponse.json({
        success: true,
        channel: 'console',
        message: 'Test notification logged to console',
      });
    }

    default:
      return NextResponse.json(
        { error: `Unhandled channel: ${channel}` },
        { status: 400 }
      );
  }
}

export const GET = withAuth(_GET);
export const POST = withAuth(_POST);
