import type { TokenPair } from '@fi-thnitek/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type TokenStore, createApiClient } from './api.js';

const json = (status: number, body: unknown, contentType = 'application/json') =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType },
  });
const problem = (status: number, code: string) =>
  json(
    status,
    { type: `urn:fi-thnitek:problem:${code}`, title: code, status, code },
    'application/problem+json',
  );

const health = {
  status: 'up',
  version: '0.0.0',
  time: '2026-10-02T10:00:00.000Z',
  checks: { database: 'up' },
};
const me = {
  id: '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  displayName: null,
  locale: 'ar',
  status: 'ACTIVE',
  isAdmin: false,
  termsAcceptedVersion: null,
  currentTermsVersion: 'v1',
  needsOnboarding: true,
};
const pair = (n: number): TokenPair => ({
  accessToken: `access-${n}`,
  expiresIn: 900,
  refreshToken: `refresh-${n}`.padEnd(43, 'x'),
});
const device = {
  installId: '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c',
  platform: 'android' as const,
  appVersion: '0.1.0',
};

function memoryStore(initial?: TokenPair): TokenStore & { current: TokenPair | null } {
  const store = {
    current: initial ?? null,
    getAccessToken: () => store.current?.accessToken ?? null,
    getRefreshToken: () => Promise.resolve(store.current?.refreshToken ?? null),
    save: (p: TokenPair) => {
      store.current = p;
      return Promise.resolve();
    },
    clear: () => {
      store.current = null;
      return Promise.resolve();
    },
  };
  return store;
}

const authHeader = (call: unknown[]) =>
  ((call[1] as RequestInit).headers as Record<string, string>).Authorization ?? null;

describe('createApiClient', () => {
  it('calls /v1/health on the base URL and accepts a 503 body', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(json(503, { ...health, status: 'down', checks: { database: 'down' } })),
    );
    const client = createApiClient('http://10.0.2.2:3000/', { fetchImpl });
    await expect(client.getHealth()).resolves.toMatchObject({ status: 'down' });
    expect(fetchImpl).toHaveBeenCalledWith('http://10.0.2.2:3000/v1/health', expect.anything());
  });

  it('stores the tokens returned by Google sign-in', async () => {
    const tokens = memoryStore();
    const fetchImpl = vi.fn(() => Promise.resolve(json(200, { ...pair(1), me })));
    await createApiClient('http://api', { fetchImpl, tokens }).signInWithGoogle('id-token', device);
    expect(tokens.current?.accessToken).toBe('access-1');
  });

  it('sends the bearer token and validates the response', async () => {
    const tokens = memoryStore(pair(1));
    const fetchImpl = vi.fn(() => Promise.resolve(json(200, me)));
    await expect(createApiClient('http://api', { fetchImpl, tokens }).getMe()).resolves.toEqual(me);
    expect(authHeader(fetchImpl.mock.calls[0]!)).toBe('Bearer access-1');
  });

  it('refreshes once on TOKEN_EXPIRED and retries with the new token', async () => {
    const tokens = memoryStore(pair(1));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(problem(401, 'TOKEN_EXPIRED'))
      .mockResolvedValueOnce(json(200, pair(2)))
      .mockResolvedValueOnce(json(200, me));
    await createApiClient('http://api', { fetchImpl, tokens }).getMe();
    expect(fetchImpl.mock.calls[1]![0]).toBe('http://api/v1/auth/refresh');
    expect(authHeader(fetchImpl.mock.calls[2]!)).toBe('Bearer access-2');
    expect(tokens.current?.refreshToken).toBe(pair(2).refreshToken);
  });

  it('shares one refresh between concurrent expired requests (never replays a refresh token)', async () => {
    const tokens = memoryStore(pair(1));
    let refreshCalls = 0;
    const fetchImpl = vi.fn((url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        return Promise.resolve(json(200, pair(2)));
      }
      const auth = (init.headers as Record<string, string>).Authorization;
      return Promise.resolve(auth === 'Bearer access-1' ? problem(401, 'TOKEN_EXPIRED') : json(200, me));
    });
    const client = createApiClient('http://api', { fetchImpl: fetchImpl as unknown as typeof fetch, tokens });
    await Promise.all([client.getMe(), client.getMe(), client.getMe()]);
    expect(refreshCalls).toBe(1);
  });

  it('refreshes first when only a refresh token is stored (app restart)', async () => {
    const tokens = memoryStore({ ...pair(1), accessToken: '' });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, pair(2)))
      .mockResolvedValueOnce(json(200, me));
    await createApiClient('http://api', { fetchImpl, tokens }).getMe();
    expect(fetchImpl.mock.calls[0]![0]).toBe('http://api/v1/auth/refresh');
  });

  it('ends the session when the refresh token was reused or revoked', async () => {
    const tokens = memoryStore(pair(1));
    const onSessionEnded = vi.fn();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(problem(401, 'TOKEN_EXPIRED'))
      .mockResolvedValueOnce(problem(401, 'REFRESH_TOKEN_REUSED'));
    const error = await createApiClient('http://api', { fetchImpl, tokens, onSessionEnded })
      .getMe()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(tokens.current).toBeNull();
    expect((onSessionEnded.mock.calls[0]![0] as ApiError).problem?.code).toBe('REFRESH_TOKEN_REUSED');
  });

  it('ends the session when the account is suspended', async () => {
    const tokens = memoryStore(pair(1));
    const onSessionEnded = vi.fn();
    const fetchImpl = vi.fn(() => Promise.resolve(problem(403, 'ACCOUNT_SUSPENDED')));
    await createApiClient('http://api', { fetchImpl, tokens, onSessionEnded })
      .getMe()
      .catch(() => undefined);
    expect(tokens.current).toBeNull();
    expect(onSessionEnded).toHaveBeenCalledOnce();
  });

  it('clears tokens on logout even if the server call fails', async () => {
    const tokens = memoryStore(pair(1));
    const fetchImpl = vi.fn(() => Promise.reject(new Error('offline')));
    await createApiClient('http://api', { fetchImpl, tokens })
      .logout()
      .catch(() => undefined);
    expect(tokens.current).toBeNull();
  });

  it('rejects bodies that break the contract', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(json(200, { status: 'great' })));
    await expect(createApiClient('http://api', { fetchImpl }).getHealth()).rejects.toThrow();
  });
});
