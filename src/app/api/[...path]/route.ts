import { NextRequest, NextResponse } from 'next/server';
import { SERVICE_ENDPOINTS } from '@/lib/intelligence/types';

const BACKEND_PORT = SERVICE_ENDPOINTS.backend.port;

async function proxyRequest(request: NextRequest, method: string) {
  const path = request.nextUrl.pathname.replace('/api/', '');
  const searchParams = request.nextUrl.searchParams;

  // Remove the XTransformPort param since we're adding our own
  searchParams.delete('XTransformPort');

  // Build URL using relative path with gateway port
  const queryString = searchParams.toString();
  const url = `/api/${path}${queryString ? `?${queryString}&` : '?'}XTransformPort=${BACKEND_PORT}`;

  // Forward auth header
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  let body: string | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    body = await request.text();
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
    });

    const contentType = response.headers.get('content-type');
    const responseHeaders = new Headers();
    if (contentType) {
      responseHeaders.set('content-type', contentType);
    }

    const data = await response.text();
    return new NextResponse(data, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Backend service unavailable' },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  return proxyRequest(request, 'GET');
}

export async function POST(request: NextRequest) {
  return proxyRequest(request, 'POST');
}

export async function PUT(request: NextRequest) {
  return proxyRequest(request, 'PUT');
}

export async function PATCH(request: NextRequest) {
  return proxyRequest(request, 'PATCH');
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request, 'DELETE');
}
