/**
 * DB→Domain mapping utilities - consolidated from 5+ files
 */

export function parseJsonField<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; }
  catch { return fallback; }
}

export function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function parsePlatformIds(value: string | null | undefined): string[] {
  return parseJsonArray<string>(value);
}
