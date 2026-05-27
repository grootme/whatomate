import { NextResponse } from 'next/server';
import { generateReport } from '@/lib/intelligence/report-generator';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const reportId: string | undefined = body.reportId;

    if (!reportId) {
      return NextResponse.json({ error: 'reportId required' }, { status: 400 });
    }

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
