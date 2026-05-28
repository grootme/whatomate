/**
 * /api/threat-level — INNOVATION 6: Threat Level Aggregation API
 *
 * GET: Retrieve the current aggregated threat level
 * POST: Force recompute the threat level
 */

import { NextResponse } from 'next/server';
import { computeThreatLevel } from '@/lib/intelligence/threat-level';

async function _GET() {
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
