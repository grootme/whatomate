import { NextResponse } from 'next/server';

/**
 * Validates an API key from the incoming request.
 *
 * Checks (in order of precedence):
 *   1. `x-api-key` header
 *   2. `Authorization: Bearer <key>` header
 *   3. `apikey` query parameter
 *
 * If `INTELLIGENCE_API_KEY` is not set in the environment the request is
 * always allowed (dev mode).
 */
export function validateApiKey(request: Request): {
  valid: boolean;
  keyName?: string;
} {
  const expectedKey = process.env.INTELLIGENCE_API_KEY;

  // Dev mode – no key configured, allow all requests
  if (!expectedKey) {
    return { valid: true, keyName: 'intelligence-api' };
  }

  // 1. x-api-key header
  const headerKey = request.headers.get('x-api-key');
  if (headerKey && headerKey === expectedKey) {
    return { valid: true, keyName: 'intelligence-api' };
  }

  // 2. Authorization: Bearer <key>
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (
      parts.length === 2 &&
      parts[0].toLowerCase() === 'bearer' &&
      parts[1] === expectedKey
    ) {
      return { valid: true, keyName: 'intelligence-api' };
    }
  }

  // 3. apikey query parameter
  const url = new URL(request.url);
  const queryKey = url.searchParams.get('apikey');
  if (queryKey && queryKey === expectedKey) {
    return { valid: true, keyName: 'intelligence-api' };
  }

  return { valid: false };
}

/**
 * Higher-order function that wraps a Next.js route handler with API-key
 * authentication. If the key is invalid a 401 JSON response is returned
 * immediately.
 */
export function withAuth<T extends (...args: any[]) => any>(handler: T): T {
  return ((...args: Parameters<T>) => {
    // The first argument of a Next.js route handler is always the Request
    const request: Request = args[0];
    const { valid } = validateApiKey(request);

    if (!valid) {
      return NextResponse.json(
        {
          error:
            'Unauthorized. Provide x-api-key header or apikey query param.',
        },
        { status: 401 },
      );
    }

    return handler(...args);
  }) as T;
}
