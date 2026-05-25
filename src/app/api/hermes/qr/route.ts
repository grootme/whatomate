import { NextResponse } from 'next/server';

// Proxy QR code from Baileys bridge
export async function GET() {
  try {
    const res = await fetch('http://127.0.0.1:3001/qr', {
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
  } catch (err: any) {
    // Bridge not available
    return NextResponse.json({
      error: 'Baileys bridge not available',
      qr: null,
      status: 'offline',
      message: `WhatsApp bridge at port 3001 is not responding: ${err.message || 'connection refused'}`,
    }, { status: 503 });
  }
}
