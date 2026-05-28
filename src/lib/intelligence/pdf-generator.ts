/**
 * Report PDF Generation Pipeline — Innovation 6
 *
 * Converts Markdown report content to professional PDF using Playwright.
 * If Playwright is not installed, falls back gracefully to returning the
 * raw Markdown content with a note that PDF generation requires Playwright.
 *
 * Pipeline:
 *  1. Fetch report from DB
 *  2. Convert Markdown → HTML (simple converter)
 *  3. Wrap in styled template (header, footer, professional CSS)
 *  4. Use Playwright to render HTML → PDF
 *  5. Save PDF to /download/reports/{reportId}.pdf
 *  6. Update report record with downloadUrl and status='completado'
 *  7. Emit report.generation_completed event
 */

import { db } from '@/lib/db';
import { persistEvent } from './event-persist';
import path from 'path';
import fs from 'fs';

// ===== Markdown → HTML Converter =====

/**
 * Simple Markdown-to-HTML converter that handles the most common
 * constructs found in intelligence reports.
 */
function markdownToHtml(md: string): string {
  let html = md;

  // Escape HTML entities first (but preserve existing tags we'll create)
  // We do a careful conversion order to avoid double-processing.

  // 1. Blockquotes (> lines) — must come before headings
  html = html.replace(/^(?:>\s*)(.*)$/gm, '<blockquote>$1</blockquote>');
  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '<br>');

  // 2. Tables
  html = convertTables(html);

  // 3. Headings (h3 first, then h2, then h1 to avoid nesting issues)
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // 4. Bold & Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 5. Unordered lists (- bullet items)
  html = convertBulletLists(html);

  // 6. Ordered lists (1. 2. etc.)
  html = convertOrderedLists(html);

  // 7. Horizontal rules
  html = html.replace(/^---+$/gm, '<hr>');

  // 8. Paragraphs — wrap remaining loose text lines
  html = html.replace(/^(?!<[hbltuo]|<hr|<table|<thead|<tbody|<tr|<th|<td|<li|<strong|<em|<blockquote|<div|<section)(.*\S.*)$/gm, '<p>$1</p>');

  // 9. Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}

function convertTables(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('|') && line.endsWith('|')) {
      // Check if this is a separator line (|---|---|)
      if (/^\|[\s\-:]+\|$/.test(line)) {
        // Skip separator lines — we already have the header
        continue;
      }

      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(line);
    } else {
      if (inTable) {
        result.push(renderTable(tableRows));
        inTable = false;
        tableRows = [];
      }
      result.push(lines[i]);
    }
  }

  if (inTable) {
    result.push(renderTable(tableRows));
  }

  return result.join('\n');
}

function renderTable(rows: string[]): string {
  if (rows.length === 0) return '';

  const parseCells = (row: string): string[] =>
    row.split('|').slice(1, -1).map(c => c.trim());

  const headerCells = parseCells(rows[0]);
  let html = '<table>\n<thead>\n<tr>\n';
  for (const cell of headerCells) {
    html += `  <th>${cell}</th>\n`;
  }
  html += '</tr>\n</thead>\n';

  if (rows.length > 1) {
    html += '<tbody>\n';
    for (let i = 1; i < rows.length; i++) {
      const cells = parseCells(rows[i]);
      html += '<tr>\n';
      for (const cell of cells) {
        html += `  <td>${cell}</td>\n`;
      }
      html += '</tr>\n';
    }
    html += '</tbody>\n';
  }

  html += '</table>';
  return html;
}

function convertBulletLists(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inList = false;

  for (const line of lines) {
    const match = line.match(/^(\s*)- (.+)$/);
    if (match) {
      if (!inList) {
        result.push('<ul>');
        inList = true;
      }
      result.push(`  <li>${match[2]}</li>`);
    } else {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      result.push(line);
    }
  }

  if (inList) {
    result.push('</ul>');
  }

  return result.join('\n');
}

function convertOrderedLists(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inList = false;

  for (const line of lines) {
    const match = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (match) {
      if (!inList) {
        result.push('<ol>');
        inList = true;
      }
      result.push(`  <li>${match[2]}</li>`);
    } else {
      if (inList) {
        result.push('</ol>');
        inList = false;
      }
      result.push(line);
    }
  }

  if (inList) {
    result.push('</ol>');
  }

  return result.join('\n');
}

// ===== Styled HTML Template =====

function wrapInTemplate(bodyHtml: string, title: string, dateStr: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    @page {
      size: A4;
      margin: 2cm 2.5cm;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 11pt;
      line-height: 1.7;
      color: #1a1a2e;
      background: #fff;
    }

    /* Header */
    .report-header {
      border-bottom: 3px solid #dc2626;
      padding-bottom: 16px;
      margin-bottom: 32px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .report-header h1 {
      font-family: 'Helvetica Neue', 'Arial', sans-serif;
      font-size: 18pt;
      font-weight: 700;
      color: #dc2626;
      letter-spacing: 0.5px;
    }
    .report-header .date {
      font-family: 'Helvetica Neue', 'Arial', sans-serif;
      font-size: 10pt;
      color: #6b7280;
    }

    /* Headings */
    h1 { font-family: 'Helvetica Neue', 'Arial', sans-serif; font-size: 16pt; font-weight: 700; color: #1e293b; margin: 28px 0 12px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    h2 { font-family: 'Helvetica Neue', 'Arial', sans-serif; font-size: 14pt; font-weight: 600; color: #334155; margin: 24px 0 10px 0; }
    h3 { font-family: 'Helvetica Neue', 'Arial', sans-serif; font-size: 12pt; font-weight: 600; color: #475569; margin: 20px 0 8px 0; }

    /* Paragraph */
    p { margin: 8px 0; text-align: justify; }

    /* Lists */
    ul, ol { margin: 8px 0 8px 24px; }
    li { margin: 4px 0; }

    /* Blockquote */
    blockquote {
      border-left: 4px solid #dc2626;
      background: #fef2f2;
      padding: 10px 16px;
      margin: 12px 0;
      font-style: italic;
      color: #7f1d1d;
    }

    /* Table */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 10pt;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background: #f1f5f9;
      font-family: 'Helvetica Neue', 'Arial', sans-serif;
      font-weight: 600;
      color: #1e293b;
    }
    tr:nth-child(even) {
      background: #f8fafc;
    }

    /* Horizontal Rule */
    hr {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 24px 0;
    }

    /* Bold / Italic */
    strong { color: #0f172a; }
    em { color: #475569; }

    /* Footer with page number */
    .report-footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      text-align: center;
      font-family: 'Helvetica Neue', 'Arial', sans-serif;
      font-size: 8pt;
      color: #9ca3af;
      padding: 8px 0;
    }

    /* Severity badges */
    .severity-critica { color: #dc2626; font-weight: 700; }
    .severity-alta { color: #ea580c; font-weight: 600; }
    .severity-media { color: #d97706; }
    .severity-baja { color: #65a30d; }
    .severity-info { color: #2563eb; }

    /* Watermark */
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 72pt;
      color: rgba(220, 38, 38, 0.03);
      font-family: 'Helvetica Neue', sans-serif;
      font-weight: 900;
      pointer-events: none;
      z-index: -1;
    }
  </style>
</head>
<body>
  <div class="watermark">WHATOMATE</div>

  <div class="report-header">
    <div>
      <h1>Whatomate Intelligence Report</h1>
    </div>
    <div class="date">${dateStr}</div>
  </div>

  <div class="content">
    ${bodyHtml}
  </div>

  <div class="report-footer">
    Whatomate Intelligence Platform &mdash; P&aacute;gina <span class="page-number"></span>
  </div>
</body>
</html>`;
}

// ===== PDF Generation =====

let playwrightAvailable: boolean | null = null;

async function isPlaywrightAvailable(): Promise<boolean> {
  if (playwrightAvailable !== null) return playwrightAvailable;

  try {
    require.resolve('playwright');
    playwrightAvailable = true;
  } catch {
    playwrightAvailable = false;
  }

  return playwrightAvailable;
}

export interface PdfGenerationResult {
  success: boolean;
  downloadUrl?: string;
  fallbackMarkdown?: string;
  error?: string;
}

/**
 * Generate a PDF from a report's Markdown content.
 *
 * If Playwright is not installed, falls back gracefully and returns
 * the raw Markdown content with a note that PDF generation requires Playwright.
 */
export async function generatePdf(reportId: string): Promise<PdfGenerationResult> {
  try {
    // 1. Fetch the report from DB
    const report = await db.report.findUnique({ where: { id: reportId } });
    if (!report) {
      return { success: false, error: `Report ${reportId} not found` };
    }

    if (!report.content) {
      return { success: false, error: `Report ${reportId} has no content` };
    }

    // 2. Check if PDF already generated
    if (report.downloadUrl && report.status === 'completado') {
      const existingPath = path.join(process.cwd(), 'download', 'reports', `${reportId}.pdf`);
      if (fs.existsSync(existingPath)) {
        return { success: true, downloadUrl: report.downloadUrl };
      }
    }

    // 3. Convert Markdown → HTML
    const bodyHtml = markdownToHtml(report.content);

    // 4. Format the date for the header
    const dateStr = new Date().toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // 5. Wrap in styled template
    const fullHtml = wrapInTemplate(bodyHtml, report.title, dateStr);

    // 6. Attempt Playwright PDF generation
    const canUsePlaywright = await isPlaywrightAvailable();

    if (!canUsePlaywright) {
      // Graceful fallback — save HTML and return markdown with a note
      console.warn('[PDF Generator] Playwright not installed. Falling back to Markdown content.');

      const htmlPath = path.join(process.cwd(), 'download', 'reports', `${reportId}.html`);
      const reportsDir = path.dirname(htmlPath);
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }
      fs.writeFileSync(htmlPath, fullHtml, 'utf-8');

      // Update the report with a note
      const fallbackNote = `\n\n---\n*Nota: La generación de PDF requiere Playwright. Se ha guardado una versión HTML del reporte.*`;
      await db.report.update({
        where: { id: reportId },
        data: {
          downloadUrl: `/download/reports/${reportId}.html`,
          status: 'completado',
        },
      });

      // Emit event
      await persistEvent('whatomate:reports', {
        eventType: 'report.generation_completed',
        aggregateId: reportId,
        aggregateType: 'report',
        payload: {
          reportId,
          format: 'html',
          fallback: true,
          note: 'PDF generation requires Playwright',
        },
      });

      return {
        success: true,
        downloadUrl: `/download/reports/${reportId}.html`,
        fallbackMarkdown: report.content + fallbackNote,
      };
    }

    // 7. Use Playwright to generate PDF
    const { chromium } = await import('playwright');

    const reportsDir = path.join(process.cwd(), 'download', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const pdfPath = path.join(reportsDir, `${reportId}.pdf`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await page.setContent(fullHtml, { waitUntil: 'networkidle' });

      await page.pdf({
        path: pdfPath,
        format: 'A4',
        margin: { top: '2cm', bottom: '2cm', left: '2.5cm', right: '2.5cm' },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: `
          <div style="font-size: 8px; width: 100%; text-align: center; color: #9ca3af; font-family: Helvetica, Arial, sans-serif;">
            Whatomate Intelligence Report — ${dateStr}
          </div>
        `,
        footerTemplate: `
          <div style="font-size: 8px; width: 100%; text-align: center; color: #9ca3af; font-family: Helvetica, Arial, sans-serif;">
            P&aacute;gina <span class="pageNumber"></span> de <span class="totalPages"></span>
          </div>
        `,
      });
    } finally {
      await browser.close();
    }

    const downloadUrl = `/download/reports/${reportId}.pdf`;

    // 8. Update the report record
    await db.report.update({
      where: { id: reportId },
      data: {
        downloadUrl,
        status: 'completado',
      },
    });

    // 9. Emit report.generation_completed event
    await persistEvent('whatomate:reports', {
      eventType: 'report.generation_completed',
      aggregateId: reportId,
      aggregateType: 'report',
      payload: {
        reportId,
        format: 'pdf',
        downloadUrl,
        title: report.title,
      },
    });

    console.log(`[PDF Generator] Report ${reportId} PDF generated at ${pdfPath}`);

    return { success: true, downloadUrl };
  } catch (error) {
    console.error('[PDF Generator] Error generating PDF:', error);

    // Attempt to mark report as error
    try {
      await db.report.update({
        where: { id: reportId },
        data: { status: 'error' },
      });
    } catch {
      // Best-effort
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown PDF generation error',
    };
  }
}
