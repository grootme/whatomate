import { SERVICE_ENDPOINTS } from './types';

export interface ServiceResponse<T> {
  data: T | null;
  error: string | null;
  source: string;
  latency: number;
}

/**
 * Typed client for connecting to microservices through the Caddy gateway.
 * Uses relative paths with ?XTransformPort=PORT as required by the gateway.
 */
export async function fetchService<T>(
  service: keyof typeof SERVICE_ENDPOINTS,
  path: string,
  options?: RequestInit
): Promise<ServiceResponse<T>> {
  const endpoint = SERVICE_ENDPOINTS[service];
  const url = `${endpoint.basePath}${path}?XTransformPort=${endpoint.port}`;
  const start = Date.now();

  try {
    const response = await fetch(url, {
      ...options,
      signal: options?.signal ?? AbortSignal.timeout(10000), // 10s default timeout
    });

    if (!response.ok) {
      return {
        data: null,
        error: `HTTP ${response.status}`,
        source: service,
        latency: Date.now() - start,
      };
    }

    const data = await response.json();
    return { data, error: null, source: service, latency: Date.now() - start };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Service unavailable',
      source: service,
      latency: Date.now() - start,
    };
  }
}

/**
 * Fetch from multiple services in parallel, returning an array of responses.
 * Each response is independent — errors in one don't affect others.
 */
export async function fetchMultipleServices<T>(
  requests: Array<{ service: keyof typeof SERVICE_ENDPOINTS; path: string }>,
  options?: RequestInit
): Promise<ServiceResponse<T>[]> {
  return Promise.all(
    requests.map((req) => fetchService<T>(req.service, req.path, options))
  );
}
