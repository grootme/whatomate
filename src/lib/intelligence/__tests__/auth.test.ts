/**
 * Integration tests for auth.ts
 *
 * Tests API key validation from multiple sources (header, Bearer token,
 * query param), dev mode warning, and strict mode rejection.
 *
 * Environment variables are manipulated directly (process.env) to test
 * the different authentication modes.
 */

import { validateApiKey, withAuth } from '../auth';

// ===== Helper to create mock Request objects =====

function makeRequest(options: {
  url?: string;
  headers?: Record<string, string>;
}): Request {
  const url = options.url ?? 'http://localhost:3000/api/test';
  const headers = new Headers(options.headers ?? {});
  return new Request(url, { headers });
}

// ===== Save/restore environment =====

let originalApiKey: string | undefined;
let originalStrictAuth: string | undefined;

beforeEach(() => {
  originalApiKey = process.env.INTELLIGENCE_API_KEY;
  originalStrictAuth = process.env.INTELLIGENCE_STRICT_AUTH;
});

afterEach(() => {
  if (originalApiKey === undefined) {
    delete process.env.INTELLIGENCE_API_KEY;
  } else {
    process.env.INTELLIGENCE_API_KEY = originalApiKey;
  }
  if (originalStrictAuth === undefined) {
    delete process.env.INTELLIGENCE_STRICT_AUTH;
  } else {
    process.env.INTELLIGENCE_STRICT_AUTH = originalStrictAuth;
  }
});

// ===== validateApiKey() =====

describe('validateApiKey', () => {
  describe('x-api-key header', () => {
    it('validates correct x-api-key header', () => {
      process.env.INTELLIGENCE_API_KEY = 'test-secret-key';
      const request = makeRequest({ headers: { 'x-api-key': 'test-secret-key' } });
      const result = validateApiKey(request);
      expect(result.valid).toBe(true);
      expect(result.keyName).toBe('intelligence-api');
    });

    it('rejects incorrect x-api-key header', () => {
      process.env.INTELLIGENCE_API_KEY = 'test-secret-key';
      const request = makeRequest({ headers: { 'x-api-key': 'wrong-key' } });
      const result = validateApiKey(request);
      expect(result.valid).toBe(false);
    });

    it('rejects when x-api-key header is missing', () => {
      process.env.INTELLIGENCE_API_KEY = 'test-secret-key';
      const request = makeRequest({});
      const result = validateApiKey(request);
      expect(result.valid).toBe(false);
    });
  });

  describe('Bearer token', () => {
    it('validates correct Bearer token', () => {
      process.env.INTELLIGENCE_API_KEY = 'my-bearer-token';
      const request = makeRequest({ headers: { 'authorization': 'Bearer my-bearer-token' } });
      const result = validateApiKey(request);
      expect(result.valid).toBe(true);
      expect(result.keyName).toBe('intelligence-api');
    });

    it('rejects incorrect Bearer token', () => {
      process.env.INTELLIGENCE_API_KEY = 'my-bearer-token';
      const request = makeRequest({ headers: { 'authorization': 'Bearer wrong-token' } });
      const result = validateApiKey(request);
      expect(result.valid).toBe(false);
    });

    it('rejects malformed authorization header (missing Bearer prefix)', () => {
      process.env.INTELLIGENCE_API_KEY = 'my-bearer-token';
      const request = makeRequest({ headers: { 'authorization': 'my-bearer-token' } });
      const result = validateApiKey(request);
      expect(result.valid).toBe(false);
    });

    it('rejects malformed authorization header (wrong scheme)', () => {
      process.env.INTELLIGENCE_API_KEY = 'my-bearer-token';
      const request = makeRequest({ headers: { 'authorization': 'Basic my-bearer-token' } });
      const result = validateApiKey(request);
      expect(result.valid).toBe(false);
    });

    it('is case-insensitive for "Bearer" scheme', () => {
      process.env.INTELLIGENCE_API_KEY = 'my-bearer-token';
      const request = makeRequest({ headers: { 'authorization': 'bearer my-bearer-token' } });
      const result = validateApiKey(request);
      expect(result.valid).toBe(true);
    });
  });

  describe('query parameter', () => {
    it('validates correct apikey query parameter', () => {
      process.env.INTELLIGENCE_API_KEY = 'query-secret';
      const request = makeRequest({ url: 'http://localhost:3000/api/test?apikey=query-secret' });
      const result = validateApiKey(request);
      expect(result.valid).toBe(true);
      expect(result.keyName).toBe('intelligence-api');
    });

    it('rejects incorrect apikey query parameter', () => {
      process.env.INTELLIGENCE_API_KEY = 'query-secret';
      const request = makeRequest({ url: 'http://localhost:3000/api/test?apikey=wrong' });
      const result = validateApiKey(request);
      expect(result.valid).toBe(false);
    });

    it('rejects when apikey query parameter is missing', () => {
      process.env.INTELLIGENCE_API_KEY = 'query-secret';
      const request = makeRequest({ url: 'http://localhost:3000/api/test' });
      const result = validateApiKey(request);
      expect(result.valid).toBe(false);
    });
  });

  describe('precedence order', () => {
    it('x-api-key header is checked before Bearer token', () => {
      process.env.INTELLIGENCE_API_KEY = 'secret';
      const request = makeRequest({
        headers: {
          'x-api-key': 'secret',
          'authorization': 'Bearer wrong-key',
        },
      });
      const result = validateApiKey(request);
      expect(result.valid).toBe(true);
    });

    it('Bearer token is checked before query parameter', () => {
      process.env.INTELLIGENCE_API_KEY = 'secret';
      const request = makeRequest({
        url: 'http://localhost:3000/api/test?apikey=wrong',
        headers: {
          'authorization': 'Bearer secret',
        },
      });
      const result = validateApiKey(request);
      expect(result.valid).toBe(true);
    });

    it('falls through to query param when header and Bearer fail', () => {
      process.env.INTELLIGENCE_API_KEY = 'secret';
      const request = makeRequest({
        url: 'http://localhost:3000/api/test?apikey=secret',
        headers: {
          'x-api-key': 'wrong',
          'authorization': 'Bearer wrong',
        },
      });
      const result = validateApiKey(request);
      expect(result.valid).toBe(true);
    });
  });

  describe('dev mode (no INTELLIGENCE_API_KEY set)', () => {
    it('allows all requests with dev key name', () => {
      delete process.env.INTELLIGENCE_API_KEY;
      delete process.env.INTELLIGENCE_STRICT_AUTH;

      const request = makeRequest({});
      const result = validateApiKey(request);
      expect(result.valid).toBe(true);
      expect(result.keyName).toBe('intelligence-api-dev');
    });

    it('allows requests without any credentials', () => {
      delete process.env.INTELLIGENCE_API_KEY;
      delete process.env.INTELLIGENCE_STRICT_AUTH;

      const request = makeRequest({});
      const result = validateApiKey(request);
      expect(result.valid).toBe(true);
    });
  });

  describe('strict mode (INTELLIGENCE_STRICT_AUTH=true)', () => {
    it('rejects all requests when no API key is configured', () => {
      delete process.env.INTELLIGENCE_API_KEY;
      process.env.INTELLIGENCE_STRICT_AUTH = 'true';

      const request = makeRequest({});
      const result = validateApiKey(request);
      expect(result.valid).toBe(false);
    });

    it('rejects even when headers are provided but no key is configured', () => {
      delete process.env.INTELLIGENCE_API_KEY;
      process.env.INTELLIGENCE_STRICT_AUTH = 'true';

      const request = makeRequest({ headers: { 'x-api-key': 'any-key' } });
      const result = validateApiKey(request);
      expect(result.valid).toBe(false);
    });

    it('allows requests when API key is configured AND matches', () => {
      process.env.INTELLIGENCE_API_KEY = 'configured-key';
      process.env.INTELLIGENCE_STRICT_AUTH = 'true';

      const request = makeRequest({ headers: { 'x-api-key': 'configured-key' } });
      const result = validateApiKey(request);
      expect(result.valid).toBe(true);
    });
  });
});

// ===== withAuth() HOF =====

describe('withAuth', () => {
  it('calls the handler when authentication succeeds', async () => {
    delete process.env.INTELLIGENCE_API_KEY;
    delete process.env.INTELLIGENCE_STRICT_AUTH;

    let handlerCalled = false;
    const handler = withAuth(async (_req: Request) => {
      handlerCalled = true;
      return new Response('OK');
    });

    const request = makeRequest({});
    await handler(request);
    expect(handlerCalled).toBe(true);
  });

  it('returns 401 when authentication fails', async () => {
    process.env.INTELLIGENCE_API_KEY = 'secret';
    delete process.env.INTELLIGENCE_STRICT_AUTH;

    let handlerCalled = false;
    const handler = withAuth(async (_req: Request) => {
      handlerCalled = true;
      return new Response('OK');
    });

    const request = makeRequest({});
    const response = await handler(request);
    expect(handlerCalled).toBe(false);
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toContain('Unauthorized');
  });
});
