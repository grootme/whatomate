import { NextResponse } from 'next/server';
import { generateReport } from '@/lib/intelligence/report-generator';
import { withAuth } from '@/lib/intelligence/auth';
import { fetchService } from '@/lib/intelligence/service-client';

async function _POST(request: Request) {
  try {
    const body = await request.json();
    const reportId: string | undefined = body.reportId;

    if (!reportId) {
      return NextResponse.json({ error: 'reportId required' }, { status: 400 });
    }

    // Try Go backend first
    const goResult = await fetchService<Record<string, unknown>>('goBackend', '/reports/generate', {
      method: 'POST',
      body: JSON.stringify({ type: body.type || 'full_intelligence' }),
    });

    if (!goResult.error && goResult.data) {
      return NextResponse.json(goResult.data);
    }

    // Fallback to local Next.js report generation
    console.warn('[api/reports/generate] Go backend unavailable, using local fallback:', goResult.error);

    // Run generation and wait for completion
    await generateReport(reportId);

    // Fetch the updated report to return its status
    const { db } = await import('@/lib/db');
    const report = await db.report.findUnique({ where: { id: reportId } });

    if (!report) {
      return NextResponse.json({ error: 'Report not found after generation' }, { status: 404 });
    }

    if (report.status === 'error') {
      return NextResponse.json({ error: 'Report generation failed' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      reportId,
      content: report.content,
      stats: { alerts: report.alertCount, events: report.eventCount, entities: report.entityCount },
    });

  } catch (error) {
    console.error('Report generation endpoint error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Report generation failed' },
      { status: 500 }
    );
  }
}

export const POST = withAuth(_POST);
