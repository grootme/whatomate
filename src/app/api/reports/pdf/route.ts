import { NextResponse } from 'next/server';
import { generatePdf } from '@/lib/intelligence/pdf-generator';
import { db } from '@/lib/db';

/**
 * GET /api/reports/pdf?reportId=xxx
 *
 * Generates a PDF for the report if not already generated,
 * then returns the download URL.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get('reportId');

    if (!reportId) {
      return NextResponse.json(
        { error: 'reportId query parameter is required' },
        { status: 400 }
      );
    }

    // Verify the report exists
    const report = await db.report.findUnique({ where: { id: reportId } });
    if (!report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      );
    }

    // If PDF already generated and file exists, return download URL directly
    if (report.downloadUrl && report.status === 'completado') {
      return NextResponse.json({
        success: true,
        downloadUrl: report.downloadUrl,
        alreadyGenerated: true,
      });
    }

    // Generate the PDF
    const result = await generatePdf(reportId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'PDF generation failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      downloadUrl: result.downloadUrl,
      fallbackMarkdown: result.fallbackMarkdown,
      alreadyGenerated: false,
    });
  } catch (error) {
    console.error('[Reports PDF API] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reports/pdf
 *
 * Triggers PDF generation for a report.
 * Body: { reportId: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const reportId: string | undefined = body.reportId;

    if (!reportId) {
      return NextResponse.json(
        { error: 'reportId is required in request body' },
        { status: 400 }
      );
    }

    // Verify the report exists
    const report = await db.report.findUnique({ where: { id: reportId } });
    if (!report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      );
    }

    // If the report has no content yet, it needs to be generated first
    if (!report.content) {
      return NextResponse.json(
        { error: 'Report has no content yet. Generate the report first.' },
        { status: 400 }
      );
    }

    // Generate the PDF
    const result = await generatePdf(reportId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'PDF generation failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      downloadUrl: result.downloadUrl,
      fallbackMarkdown: result.fallbackMarkdown,
    });
  } catch (error) {
    console.error('[Reports PDF API] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
