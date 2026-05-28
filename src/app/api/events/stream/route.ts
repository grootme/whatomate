/**
 * Innovation 8: Real-time Event Stream (Server-Sent Events)
 *
 * GET /api/events/stream
 *
 * SSE endpoint that pushes real-time intelligence events to connected clients.
 * Instead of marking events as processed (which would prevent other consumers
 * from seeing them), this tracks the last sent timestamp per connection and
 * only fetches events after that timestamp.
 *
 * Features:
 * - Initial connection event with server timestamp
 * - Polls for new events every 5 seconds
 * - Polls Go backend /alerts endpoint and streams new alerts to clients
 * - Tracks lastSentTimestamp per connection (no DB mutation)
 * - Tracks sentAlertIds to avoid duplicate alert pushes
 * - Heartbeat keep-alive every 15 seconds
 * - Clean shutdown on client abort
 * - Supports optional `?after=ISO_DATE` query param to resume from a point
 */

import { db } from '@/lib/db';
import { fetchService } from '@/lib/intelligence/service-client';

const POLL_INTERVAL_MS = 5000;
const ALERT_POLL_INTERVAL_MS = 8000;
const HEARTBEAT_INTERVAL_MS = 15000;
const MAX_EVENTS_PER_POLL = 20;
const MAX_ALERTS_TO_TRACK = 200;

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  const url = new URL(request.url);

  // Allow clients to resume from a specific timestamp
  const afterParam = url.searchParams.get('after');
  let lastSentTimestamp: Date = afterParam ? new Date(afterParam) : new Date();

  // If the after param is invalid, default to now
  if (isNaN(lastSentTimestamp.getTime())) {
    lastSentTimestamp = new Date();
  }

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      const connectedEvent = {
        type: 'connected',
        timestamp: new Date().toISOString(),
        lastSentTimestamp: lastSentTimestamp.toISOString(),
      };

      try {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(connectedEvent)}\n\n`)
        );
      } catch {
        // Stream already closed
        return;
      }

      // Track alert IDs already sent to this client to avoid duplicates
      const sentAlertIds = new Set<string>();

      // Poll the Go backend for new alerts and push them to the SSE stream
      const alertPollInterval = setInterval(async () => {
        try {
          const alertResult = await fetchService<{
            alerts?: Array<Record<string, unknown> & { id?: string }>
          }>('goBackend', '/alerts');

          if (!alertResult.error && alertResult.data?.alerts) {
            for (const alert of alertResult.data.alerts) {
              const alertId = alert.id ?? JSON.stringify(alert).slice(0, 64);
              if (sentAlertIds.has(alertId)) continue;

              // Track this alert; evict oldest if set grows too large
              sentAlertIds.add(alertId);
              if (sentAlertIds.size > MAX_ALERTS_TO_TRACK) {
                const oldest = sentAlertIds.values().next().value;
                if (oldest !== undefined) sentAlertIds.delete(oldest);
              }

              const sseAlert = {
                type: 'alert',
                source: 'go_backend',
                alert,
                timestamp: new Date().toISOString(),
              };

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(sseAlert)}\n\n`)
              );
            }
          }
        } catch (err) {
          console.error('[SSE] Alert poll error:', err);
          // Non-fatal — don't close the stream, just log
        }
      }, ALERT_POLL_INTERVAL_MS);

      // Poll for new events periodically
      const pollInterval = setInterval(async () => {
        try {
          // Fetch events created after our last sent timestamp
          const recentEvents = await db.intelligenceEvent.findMany({
            where: {
              timestamp: { gt: lastSentTimestamp },
            },
            orderBy: { timestamp: 'asc' },
            take: MAX_EVENTS_PER_POLL,
          });

          if (recentEvents.length > 0) {
            // Update lastSentTimestamp to the newest event we're about to send
            lastSentTimestamp = recentEvents[recentEvents.length - 1].timestamp;

            for (const event of recentEvents) {
              let payload: Record<string, unknown> = {};
              try {
                payload = event.payload ? JSON.parse(event.payload) : {};
              } catch {
                payload = {};
              }

              let metadata: Record<string, unknown> | undefined;
              if (event.metadata) {
                try {
                  metadata = JSON.parse(event.metadata);
                } catch {
                  metadata = undefined;
                }
              }

              const sseEvent = {
                id: event.id,
                type: event.eventType,
                aggregateId: event.aggregateId,
                aggregateType: event.aggregateType,
                stream: event.stream,
                payload,
                metadata,
                timestamp: event.timestamp.toISOString(),
                processed: event.processed,
              };

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(sseEvent)}\n\n`)
              );
            }
          }
        } catch (err) {
          // DB query failed — send error event but don't close the stream
          console.error('[SSE] Poll error:', err);
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'error',
                  message: 'Failed to fetch events',
                  timestamp: new Date().toISOString(),
                })}\n\n`
              )
            );
          } catch {
            // Stream closed, clear interval
            clearInterval(pollInterval);
            clearInterval(heartbeatInterval);
            clearInterval(alertPollInterval);
          }
        }
      }, POLL_INTERVAL_MS);

      // Heartbeat to keep the connection alive and prevent proxy timeouts
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'heartbeat',
                timestamp: new Date().toISOString(),
                lastSentTimestamp: lastSentTimestamp.toISOString(),
              })}\n\n`
            )
          );
        } catch {
          // Stream closed
          clearInterval(pollInterval);
          clearInterval(heartbeatInterval);
          clearInterval(alertPollInterval);
        }
      }, HEARTBEAT_INTERVAL_MS);

      // Clean up on client abort
      request.signal.addEventListener('abort', () => {
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
        clearInterval(alertPollInterval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}
