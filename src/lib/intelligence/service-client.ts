import { SERVICE_ENDPOINTS } from './types';

export interface ServiceResponse<T> {
  data: T | null;
  error: string | null;
  source: string;
  latency: number;
}

/**
 * Build the request URL for a given service endpoint.
 * - For "direct" endpoints (e.g. goBackend), constructs a full URL:
 *     ${protocol}://${host}:${port}${basePath}${path}
 * - For gateway-routed endpoints, uses the Caddy relative-path pattern:
 *     ${basePath}${path}?XTransformPort=${port}
 */
function buildServiceUrl(
  service: keyof typeof SERVICE_ENDPOINTS,
  path: string,
): string {
  const endpoint = SERVICE_ENDPOINTS[service];

  if ('direct' in endpoint && endpoint.direct) {
    const protocol = ('protocol' in endpoint ? endpoint.protocol : 'http') as string;
    return `${protocol}://${endpoint.host}:${endpoint.port}${endpoint.basePath}${path}`;
  }

  return `${endpoint.basePath}${path}?XTransformPort=${endpoint.port}`;
}

/**
 * Typed client for connecting to microservices.
 * For gateway-routed services, uses relative paths with ?XTransformPort=PORT.
 * For direct services (goBackend), constructs full URLs bypassing the gateway.
 */
export async function fetchService<T>(
  service: keyof typeof SERVICE_ENDPOINTS,
  path: string,
  options?: RequestInit
): Promise<ServiceResponse<T>> {
  const url = buildServiceUrl(service, path);
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
