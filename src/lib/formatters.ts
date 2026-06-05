/**
 * Shared formatters - extracted from use-intelligence-data.ts
 * CONSOLIDATES: formatTimestamp, formatRelativeTime, formatDateString, conditionLabel
 */

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `Hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `Hace ${days}d`;
  } catch {
    return iso;
  }
}

export function formatDateString(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function conditionLabel(condition: string): string {
  const labels: Record<string, string> = {
    gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠',
    contains: 'contiene', not_contains: 'no contiene',
    threshold_exceeded: 'umbral excedido',
  };
  return labels[condition] ?? condition;
}
