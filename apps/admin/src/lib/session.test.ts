import { describe, expect, it, vi } from 'vitest';
import { AdminApiError, type SessionStorage, createAdminSession } from './session';

const me = {
  id: '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  displayName: 'Admin',
  locale: 'fr',
  status: 'ACTIVE',
  isAdmin: true,
  termsAcceptedVersion: null,
  currentTermsVersion: 'v1',
  needsOnboarding: true,
};
const pair = (n: number) => ({ accessToken: `a${n}`, expiresIn: 900, refreshToken: `r${n}`.padEnd(43, 'x') });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const problem = (status: number, code: string) =>
  new Response(JSON.stringify({ type: 'urn:x', title: code, status, code }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });

function memory(): SessionStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('createAdminSession', () => {
  it('signs in an allow-listed admin', async () => {
    const storage = memory();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, { ...pair(1), me }))
      .mockResolvedValueOnce(json(200, me));
    const session = createAdminSession(storage, fetchImpl, 'http://api');
    await expect(session.signIn('google-id-token')).resolves.toMatchObject({ isAdmin: true });
    expect(session.hasSession()).toBe(true);
    expect(fetchImpl.mock.calls[1]![0]).toBe('http://api/v1/admin/me');
  });

  it('signs a non-admin straight back out', async () => {
    const storage = memory();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, { ...pair(1), me: { ...me, isAdmin: false } }))
      .mockResolvedValueOnce(problem(403, 'ADMIN_REQUIRED'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const session = createAdminSession(storage, fetchImpl, 'http://api');
    const error = await session.signIn('google-id-token').catch((e: unknown) => e);
    expect((error as AdminApiError).code).toBe('ADMIN_REQUIRED');
    expect(session.hasSession()).toBe(false);
    expect(fetchImpl.mock.calls[2]![0]).toBe('http://api/v1/auth/logout');
  });

  it('refreshes an expired access token once and retries', async () => {
    const storage = memory();
    storage.setItem('fi-thnitek.admin.session', JSON.stringify(pair(1)));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(problem(401, 'TOKEN_EXPIRED'))
      .mockResolvedValueOnce(json(200, pair(2)))
      .mockResolvedValueOnce(json(200, me));
    await createAdminSession(storage, fetchImpl, 'http://api').getAdminMe();
    expect(JSON.parse(storage.getItem('fi-thnitek.admin.session')!)).toMatchObject({ accessToken: 'a2' });
  });

  it('drops the session when it was revoked', async () => {
    const storage = memory();
    storage.setItem('fi-thnitek.admin.session', JSON.stringify(pair(1)));
    const fetchImpl = vi.fn().mockResolvedValueOnce(problem(401, 'UNAUTHENTICATED'));
    const session = createAdminSession(storage, fetchImpl, 'http://api');
    await expect(session.getAdminMe()).rejects.toBeInstanceOf(AdminApiError);
    expect(session.hasSession()).toBe(false);
  });
});
