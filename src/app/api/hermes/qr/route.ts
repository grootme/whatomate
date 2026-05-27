import { NextResponse } from 'next/server';
import { SERVICE_ENDPOINTS } from '@/lib/intelligence/types';

// Proxy QR code from Baileys bridge via gateway
export async function GET() {
  const endpoint = SERVICE_ENDPOINTS.whatsapp;
  try {
    const res = await fetch(`/api/qr?XTransformPort=${endpoint.port}`, {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Bridge returned error', qr: null, status: res.status },
        { status: res.status }
      );
    }

    const contentType = res.headers.get('content-type');

    if (contentType?.includes('image')) {
      // Bridge returned raw PNG image → convert to base64 data URL
      const buffer = await res.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;
      return NextResponse.json({ qr: dataUrl, status: 'disconnected' });
    }

    // Bridge returned JSON with QR data URL
    const data = await res.json();
    return NextResponse.json({
      qr: data.qr || null,
      status: data.status || 'unknown',
      message: data.message || '',
    });
  } catch (err: unknown) {
    // Bridge not available
    const message = err instanceof Error ? err.message : 'connection refused';
    return NextResponse.json({
      error: 'Baileys bridge not available',
      qr: null,
      status: 'offline',
      message: `WhatsApp bridge at port ${endpoint.port} is not responding: ${message}`,
    }, { status: 503 });
  }
}
