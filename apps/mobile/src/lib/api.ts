import { HealthResponse, PROBLEM_JSON, ProblemDetails } from '@fi-thnitek/contracts';
import type { ZodType } from 'zod';

/** A non-2xx response. `problem` is set when the server sent RFC 9457 problem details. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem?: ProblemDetails,
  ) {
    super(problem ? `${problem.code} (${status})` : `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

type Fetch = typeof fetch;

export interface ApiClient {
  getHealth(): Promise<HealthResponse>;
}

export function createApiClient(baseUrl: string, fetchImpl: Fetch = fetch): ApiClient {
  const root = baseUrl.replace(/\/+$/, '');

  async function get<T>(path: string, schema: ZodType<T>, acceptStatuses: number[] = []): Promise<T> {
    const res = await fetchImpl(`${root}/v1${path}`, { headers: { Accept: 'application/json' } });
    const body: unknown = await res.json().catch(() => undefined);
    if (res.ok || acceptStatuses.includes(res.status)) return schema.parse(body);
    const isProblem = res.headers.get('content-type')?.includes(PROBLEM_JSON);
    const problem = isProblem ? ProblemDetails.safeParse(body) : undefined;
    throw new ApiError(res.status, problem?.success ? problem.data : undefined);
  }

  return {
    // 503 still carries a HealthResponse saying which check is down.
    getHealth: () => get('/health', HealthResponse, [503]),
  };
}
