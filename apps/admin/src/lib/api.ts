import { HealthResponse } from '@fi-thnitek/contracts';

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** GET /v1/health. A 503 still carries a HealthResponse saying which check is down. */
export async function fetchHealth(
  baseUrl: string = API_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<HealthResponse> {
  const res = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/v1/health`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok && res.status !== 503) throw new Error(`HTTP ${res.status}`);
  return HealthResponse.parse(await res.json());
}
