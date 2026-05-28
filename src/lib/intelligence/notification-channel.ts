/**
 * Notification Channel — dispatches alerts to external channels.
 *
 * Supports:
 * - Telegram bot notifications
 * - Webhook callbacks
 * - Console logging (dev mode)
 *
 * RICCO Pattern: Event-Driven Consistency ADN
 */

import { fetchService } from './service-client';
import type { Alert, ConsensusVote, StrategyResult, AlertSeverity } from './types';

// ===== COLOR HELPERS =====

const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  'CRÍTICA': '\x1b[41m\x1b[37m\x1b[1m', // red background, white bold
  'ALTA': '\x1b[31m\x1b[1m',             // red bold
  'MEDIA': '\x1b[33m\x1b[1m',            // yellow bold
  'BAJA': '\x1b[36m',                     // cyan
  'INFO': '\x1b[37m',                     // white
};
const RESET = '\x1b[0m';

// ===== SEVERITY PRIORITY =====

const SEVERITY_ORDER: AlertSeverity[] = ['INFO', 'BAJA', 'MEDIA', 'ALTA', 'CRÍTICA'];

function severityRank(severity: AlertSeverity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

function isAtLeast(severity: AlertSeverity, threshold: AlertSeverity): boolean {
  return severityRank(severity) >= severityRank(threshold);
}

// ===== notifyAlert =====

/**
 * Dispatches an alert notification to the appropriate channels.
 *
 * - CRÍTICA / ALTA → Telegram notification via Hermes agent
 * - MEDIA or higher → Console log with color coding
 * - If ALERT_WEBHOOK_URL env var is set → POST alert JSON to webhook
 */
export async function notifyAlert(alert: Alert): Promise<void> {
  const { severity, title, description, source, id } = alert;

  // 1. Console log for MEDIA or higher
  if (isAtLeast(severity, 'MEDIA')) {
    const color = SEVERITY_COLORS[severity] || '';
    console.log(
      `${color}[ALERT ${severity}]${RESET} ${title}\n` +
      `  Source: ${source} | ID: ${id}\n` +
      `  ${description}`
    );
  }

  // 2. Telegram notification for CRÍTICA or ALTA
  if (isAtLeast(severity, 'ALTA')) {
    try {
      const emoji = severity === 'CRÍTICA' ? '🚨' : '⚠️';
      const message = [
        `${emoji} *${severity} ALERT* ${emoji}`,
        `*Title:* ${title}`,
        `*Source:* ${source}`,
        `*Description:* ${description}`,
        `*Time:* ${new Date(alert.timestamp).toISOString()}`,
        alert.actionTaken ? `*Action:* ${alert.actionTaken}` : '',
      ].filter(Boolean).join('\n');

      await fetchService('hermes', '/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          parseMode: 'Markdown',
          alertId: id,
          severity,
        }),
      });
    } catch (err) {
      console.error('[NotificationChannel] Telegram notification failed:', err);
    }
  }

  // 3. Webhook notification if configured
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'alert',
          alert: {
            id,
            severity,
            title,
            description,
            source,
            strategy: alert.strategy,
            timestamp: alert.timestamp,
            acknowledged: alert.acknowledged,
            escalated: alert.escalated,
          },
          notifiedAt: new Date().toISOString(),
        }),
      });
    } catch (err) {
      console.error('[NotificationChannel] Webhook notification failed:', err);
    }
  }
}

// ===== notifyConsensusResult =====

/**
 * Notifies about a consensus decision result.
 * If the consensus action is 'escalate', sends a Telegram notification
 * including the vote breakdown.
 */
export async function notifyConsensusResult(
  votes: ConsensusVote[],
  result: StrategyResult
): Promise<void> {
  // Always log to console
  const favorCount = votes.filter(v => v.vote === 'favor').length;
  const contraCount = votes.filter(v => v.vote === 'contra').length;
  const abstencionCount = votes.filter(v => v.vote === 'abstencion').length;

  console.log(
    `\x1b[35m[CONSENSUS]\x1b[0m Action: ${result.action} | ` +
    `Confidence: ${result.confidence}% | ` +
    `Votes: ${favorCount} favor, ${contraCount} contra, ${abstencionCount} abstención\n` +
    `  Reasoning: ${result.reasoning}`
  );

  // If action is 'escalate', send Telegram notification
  if (result.action === 'escalate') {
    try {
      const voteBreakdown = votes.map(v =>
        `• ${v.agentName}: ${v.vote} (${v.confidence}%) — ${v.reasoning}`
      ).join('\n');

      const message = [
        '🔁 *CONSENSUS ESCALATION*',
        `*Action:* ${result.action}`,
        `*Confidence:* ${result.confidence}%`,
        `*Severity:* ${result.severity || 'N/A'}`,
        `*Reasoning:* ${result.reasoning}`,
        '',
        '*Vote Breakdown:*',
        voteBreakdown,
      ].join('\n');

      await fetchService('hermes', '/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          parseMode: 'Markdown',
          type: 'consensus_escalation',
          confidence: result.confidence,
        }),
      });
    } catch (err) {
      console.error('[NotificationChannel] Consensus Telegram notification failed:', err);
    }
  }

  // Webhook notification if configured
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'consensus_result',
          action: result.action,
          confidence: result.confidence,
          severity: result.severity,
          reasoning: result.reasoning,
          votes: votes.map(v => ({
            agentId: v.agentId,
            agentName: v.agentName,
            vote: v.vote,
            confidence: v.confidence,
          })),
          notifiedAt: new Date().toISOString(),
        }),
      });
    } catch (err) {
      console.error('[NotificationChannel] Consensus webhook notification failed:', err);
    }
  }
}

// ===== notifySystemEvent =====

/**
 * Notifies about critical system events (agent down, service unavailable, etc.).
 * Always logs to console. If ALERT_WEBHOOK_URL is set, also sends to webhook.
 */
export async function notifySystemEvent(
  eventType: string,
  details: Record<string, unknown>
): Promise<void> {
  // Always console log
  console.log(
    `\x1b[41m\x1b[37m\x1b[1m[SYSTEM EVENT]\x1b[0m ${eventType}\n` +
    `  ${JSON.stringify(details, null, 2)}`
  );

  // Webhook notification if configured
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'system_event',
          eventType,
          details,
          notifiedAt: new Date().toISOString(),
        }),
      });
    } catch (err) {
      console.error('[NotificationChannel] System event webhook notification failed:', err);
    }
  }
}

// ===== Channel Status =====

/**
 * Returns the current status of all notification channels.
 * Useful for health checks and API endpoints.
 */
export function getChannelStatus(): {
  telegram: { available: boolean; service: string };
  webhook: { available: boolean; url: string | null };
  console: { available: boolean };
} {
  return {
    telegram: {
      available: true, // Hermes agent is always "available" to try
      service: 'hermes',
    },
    webhook: {
      available: !!process.env.ALERT_WEBHOOK_URL,
      url: process.env.ALERT_WEBHOOK_URL || null,
    },
    console: {
      available: true,
    },
  };
}
