import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './api.js';

function respond(status: number, body: unknown, contentType = 'application/json') {
  return vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } })),
  );
}

const health = {
  status: 'up',
  version: '0.0.0',
  time: '2026-10-02T10:00:00.000Z',
  checks: { database: 'up' },
};

describe('createApiClient', () => {
  it('calls /v1/health on the base URL and validates the body', async () => {
    const fetchImpl = respond(200, health);
    const client = createApiClient('http://10.0.2.2:3000/', fetchImpl);
    await expect(client.getHealth()).resolves.toEqual(health);
    expect(fetchImpl).toHaveBeenCalledWith('http://10.0.2.2:3000/v1/health', expect.anything());
  });

  it('returns the health body on 503 so the UI can show which check is down', async () => {
    const down = { ...health, status: 'down', checks: { database: 'down' } };
    await expect(createApiClient('http://api', respond(503, down)).getHealth()).resolves.toEqual(down);
  });

  it('throws ApiError with problem details on errors', async () => {
    const problem = {
      type: 'urn:fi-thnitek:problem:internal-error',
      title: 'Internal error',
      status: 500,
      code: 'INTERNAL_ERROR',
    };
    const client = createApiClient('http://api', respond(500, problem, 'application/problem+json'));
    const error = await client.getHealth().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).problem?.code).toBe('INTERNAL_ERROR');
  });

  it('rejects bodies that break the contract', async () => {
    await expect(
      createApiClient('http://api', respond(200, { status: 'great' })).getHealth(),
    ).rejects.toThrow();
  });
});
