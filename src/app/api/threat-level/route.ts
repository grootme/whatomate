/**
 * /api/threat-level — INNOVATION 6: Threat Level Aggregation API
 *
 * GET: Retrieve the current aggregated threat level
 * POST: Force recompute the threat level
 */

import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';
import { computeThreatLevel } from '@/lib/intelligence/threat-level';

async function _GET() {
  // ===== Try Go backend first =====
  const goResult = await fetchService<Record<string, unknown>>('goBackend', '/threat-level');
  if (!goResult.error && goResult.data) {
    return NextResponse.json(goResult.data);
  }

  // ===== Fallback to local Next.js intelligence engine =====
  console.warn('[api/threat-level] Go backend unavailable, using local fallback:', goResult.error);

  try {
    const result = await computeThreatLevel();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[ThreatLevel] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error computing threat level' },
      { status: 500 },
    );
  }
}

async function _POST() {
  // ===== Try Go backend first =====
  try {
    const goResult = await fetchService<Record<string, unknown>>('goBackend', '/threat-level', {
      method: 'POST',
    });
    if (!goResult.error && goResult.data) {
      return NextResponse.json({
        message: 'Threat level recomputed',
        ...goResult.data,
      });
    }
    console.warn('[api/threat-level] Go backend POST unavailable, using local fallback:', goResult.error);
  } catch {
    console.warn('[api/threat-level] Go backend POST failed, using local fallback');
  }

  // ===== Fallback to local =====
  try {
    const result = await computeThreatLevel();
    return NextResponse.json({
      message: 'Threat level recomputed',
      ...result,
    });
  } catch (error) {
    console.error('[ThreatLevel] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error computing threat level' },
      { status: 500 },
    );
  }
}

export { _GET as GET, _POST as POST };
