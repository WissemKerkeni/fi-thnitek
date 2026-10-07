import { Me, ProblemDetails, SignInResponse, TokenPair } from '@fi-thnitek/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessTokens } from '../src/auth/tokens.js';
import { DEV_JWT_SECRET } from '../src/config/env.js';
import { TEST_ADMIN_EMAIL, TEST_TERMS_VERSION, type TestApp, startTestApp } from './test-app.js';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp();
});

afterAll(async () => {
  await t?.close();
});

const device = {
  installId: '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  platform: 'android',
  appVersion: '0.1.0',
};
let subCounter = 0;

/** Signs in a fresh Google account (unique sub) unless one is given. */
async function signIn(claims: Record<string, unknown> = {}, withDevice = true): Promise<SignInResponse> {
  const sub = (claims.sub as string | undefined) ?? `sub-${++subCounter}`;
  const idToken = await t.googleToken({ email: `${sub}@example.tn`, ...claims, sub });
  const res = await request(t.server())
    .post('/v1/auth/google')
    .send({ idToken, ...(withDevice && { device }) })
    .expect(200);
  return SignInResponse.parse(res.body);
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

function problem(body: unknown): ProblemDetails {
  return ProblemDetails.parse(body);
}

describe('POST /v1/auth/google', () => {
  it('creates the user, the device and a session, and needs onboarding', async () => {
    const res = await signIn({ sub: 'new-user' });
    expect(res.me.needsOnboarding).toBe(true);
    expect(res.me.isAdmin).toBe(false);
    expect(res.expiresIn).toBe(900);

    const { rows } = await t.pool.query(
      `SELECT u.email, d.install_id, count(s.*)::int AS sessions
       FROM users u JOIN devices d ON d.user_id = u.id JOIN sessions s ON s.user_id = u.id
       WHERE u.id = $1 GROUP BY u.email, d.install_id`,
      [res.me.id],
    );
    expect(rows).toEqual([{ email: 'new-user@example.tn', install_id: device.installId, sessions: 1 }]);
  });

  it('returns the same user for the same Google account', async () => {
    const a = await signIn({ sub: 'returning' });
    const b = await signIn({ sub: 'returning' });
    expect(b.me.id).toBe(a.me.id);
  });

  it('rejects an invalid Google token with 401 INVALID_GOOGLE_TOKEN', async () => {
    const idToken = await t.googleToken({ aud: 'someone-else.apps.googleusercontent.com' });
    const res = await request(t.server()).post('/v1/auth/google').send({ idToken }).expect(401);
    expect(problem(res.body).code).toBe('INVALID_GOOGLE_TOKEN');
  });

  it('validates the body', async () => {
    const res = await request(t.server())
      .post('/v1/auth/google')
      .send({ idToken: 'x', device: { ...device, installId: 'not-a-uuid' } })
      .expect(400);
    expect(problem(res.body).code).toBe('VALIDATION_FAILED');
  });
});

describe('authenticated routes', () => {
  it('reject missing, malformed and forged tokens', async () => {
    let res = await request(t.server()).get('/v1/me').expect(401);
    expect(problem(res.body).code).toBe('UNAUTHENTICATED');
    res = await request(t.server()).get('/v1/me').set({ Authorization: 'Basic abc' }).expect(401);
    expect(problem(res.body).code).toBe('UNAUTHENTICATED');

    const { me } = await signIn();
    const forged = await new AccessTokens('x'.repeat(40), 900).sign({ userId: me.id, familyId: me.id });
    res = await request(t.server()).get('/v1/me').set(bearer(forged)).expect(401);
    expect(problem(res.body).code).toBe('UNAUTHENTICATED');
  });

  it('report an expired access token as TOKEN_EXPIRED', async () => {
    const { me } = await signIn();
    const tokens = new AccessTokens(DEV_JWT_SECRET, 900);
    const expired = await tokens.sign({ userId: me.id, familyId: me.id }, new Date(Date.now() - 3_600_000));
    const res = await request(t.server()).get('/v1/me').set(bearer(expired)).expect(401);
    expect(problem(res.body).code).toBe('TOKEN_EXPIRED');
  });

  it('keep the health check public', async () => {
    await request(t.server()).get('/v1/health').expect(200);
  });
});

describe('GET/PATCH /v1/me', () => {
  it('returns only the caller, without email or Google sub (serialisation)', async () => {
    const s = await signIn();
    const res = await request(t.server()).get('/v1/me').set(bearer(s.accessToken)).expect(200);
    expect(Object.keys(res.body as object).sort()).toEqual(Object.keys(Me.shape).sort());
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('@example.tn');
    expect(raw).not.toContain('sub-');
  });

  it('completes onboarding with a name and the current terms version', async () => {
    const s = await signIn();
    let res = await request(t.server())
      .patch('/v1/me')
      .set(bearer(s.accessToken))
      .send({ acceptTermsVersion: 'old-terms' })
      .expect(400);
    expect(problem(res.body).code).toBe('VALIDATION_FAILED');

    res = await request(t.server())
      .patch('/v1/me')
      .set(bearer(s.accessToken))
      .send({ displayName: 'سامي', locale: 'fr', acceptTermsVersion: TEST_TERMS_VERSION })
      .expect(200);
    expect(Me.parse(res.body)).toMatchObject({
      displayName: 'سامي',
      locale: 'fr',
      termsAcceptedVersion: TEST_TERMS_VERSION,
      needsOnboarding: false,
    });

    // ADR-224: English is a supported language (pushes follow it).
    res = await request(t.server())
      .patch('/v1/me')
      .set(bearer(s.accessToken))
      .send({ locale: 'en' })
      .expect(200);
    expect(Me.parse(res.body).locale).toBe('en');
    await request(t.server()).patch('/v1/me').set(bearer(s.accessToken)).send({ locale: 'de' }).expect(400);
  });

  it('sets the role once at first run; a passenger never becomes a driver (ADR-225)', async () => {
    const passenger = await signIn();
    expect(
      Me.parse((await request(t.server()).get('/v1/me').set(bearer(passenger.accessToken)).expect(200)).body)
        .role,
    ).toBeNull();
    const set = await request(t.server())
      .patch('/v1/me')
      .set(bearer(passenger.accessToken))
      .send({ role: 'PASSENGER' })
      .expect(200);
    expect(Me.parse(set.body).role).toBe('PASSENGER');
    // Same role again is fine; switching is refused.
    await request(t.server())
      .patch('/v1/me')
      .set(bearer(passenger.accessToken))
      .send({ role: 'PASSENGER' })
      .expect(200);
    await request(t.server())
      .patch('/v1/me')
      .set(bearer(passenger.accessToken))
      .send({ role: 'DRIVER' })
      .expect(409);
    const file = await request(t.server())
      .put('/v1/driver/profile')
      .set(bearer(passenger.accessToken))
      .send({ legalFirstName: 'Ali', legalLastName: 'Trabelsi', cin: '06665544', transportType: 'TAXI' })
      .expect(403);
    expect(problem(file.body).code).toBe('FORBIDDEN');

    const driver = await signIn();
    await request(t.server())
      .patch('/v1/me')
      .set(bearer(driver.accessToken))
      .send({ role: 'DRIVER' })
      .expect(200);
    const blocked = await request(t.server())
      .post('/v1/requests')
      .set(bearer(driver.accessToken))
      .send({ destination: { point: { lat: 35.8, lng: 10.6 } }, types: ['TAXI'] })
      .expect(403);
    expect(problem(blocked.body).code).toBe('REQUEST_NOT_ALLOWED');
  });

  it('registers and updates the device push token (R-004)', async () => {
    const s = await signIn();
    await request(t.server())
      .put('/v1/me/device')
      .set(bearer(s.accessToken))
      .send({ ...device, appVersion: '0.2.0', pushToken: 'push-1' })
      .expect(204);
    const { rows } = await t.pool.query('SELECT app_version, push_token FROM devices WHERE user_id = $1', [
      s.me.id,
    ]);
    expect(rows).toEqual([{ app_version: '0.2.0', push_token: 'push-1' }]);
  });
});

describe('POST /v1/auth/refresh', () => {
  it('rotates: the new pair works and the old refresh token is single-use', async () => {
    const s = await signIn();
    const res = await request(t.server())
      .post('/v1/auth/refresh')
      .send({ refreshToken: s.refreshToken })
      .expect(200);
    const next = TokenPair.parse(res.body);
    expect(next.refreshToken).not.toBe(s.refreshToken);
    await request(t.server()).get('/v1/me').set(bearer(next.accessToken)).expect(200);
  });

  it('detects reuse of a rotated token and revokes the whole session family', async () => {
    const s = await signIn();
    const res = await request(t.server())
      .post('/v1/auth/refresh')
      .send({ refreshToken: s.refreshToken })
      .expect(200);
    const next = TokenPair.parse(res.body);

    // An attacker replays the old token.
    let replay = await request(t.server())
      .post('/v1/auth/refresh')
      .send({ refreshToken: s.refreshToken })
      .expect(401);
    expect(problem(replay.body).code).toBe('REFRESH_TOKEN_REUSED');

    // The legitimate holder's newer tokens are dead too.
    replay = await request(t.server())
      .post('/v1/auth/refresh')
      .send({ refreshToken: next.refreshToken })
      .expect(401);
    expect(problem(replay.body).code).toBe('REFRESH_TOKEN_INVALID');
    await request(t.server()).get('/v1/me').set(bearer(next.accessToken)).expect(401);
  });

  it('rejects unknown and expired refresh tokens', async () => {
    let res = await request(t.server())
      .post('/v1/auth/refresh')
      .send({ refreshToken: 'x'.repeat(43) })
      .expect(401);
    expect(problem(res.body).code).toBe('REFRESH_TOKEN_INVALID');

    const s = await signIn();
    await t.pool.query(`UPDATE sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1`, [
      s.me.id,
    ]);
    res = await request(t.server())
      .post('/v1/auth/refresh')
      .send({ refreshToken: s.refreshToken })
      .expect(401);
    expect(problem(res.body).code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('lets only one of two concurrent refreshes of the same token win', async () => {
    const s = await signIn();
    const results = await Promise.all(
      [1, 2].map(() => request(t.server()).post('/v1/auth/refresh').send({ refreshToken: s.refreshToken })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });
});

describe('POST /v1/auth/logout', () => {
  it('ends the session immediately and clears the device push token', async () => {
    const s = await signIn();
    await request(t.server())
      .put('/v1/me/device')
      .set(bearer(s.accessToken))
      .send({ ...device, pushToken: 'p' });
    await request(t.server()).post('/v1/auth/logout').set(bearer(s.accessToken)).expect(204);

    await request(t.server()).get('/v1/me').set(bearer(s.accessToken)).expect(401);
    await request(t.server()).post('/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
    const { rows } = await t.pool.query('SELECT push_token FROM devices WHERE user_id = $1', [s.me.id]);
    expect(rows).toEqual([{ push_token: null }]);
  });

  it('leaves the user’s other sessions alone', async () => {
    const a = await signIn({ sub: 'two-phones' });
    const b = await signIn({ sub: 'two-phones' });
    await request(t.server()).post('/v1/auth/logout').set(bearer(a.accessToken)).expect(204);
    await request(t.server()).get('/v1/me').set(bearer(b.accessToken)).expect(200);
  });
});

describe('admin gate', () => {
  it('refuses non-admins with 403 ADMIN_REQUIRED', async () => {
    const s = await signIn();
    const res = await request(t.server()).get('/v1/admin/me').set(bearer(s.accessToken)).expect(403);
    expect(problem(res.body).code).toBe('ADMIN_REQUIRED');
  });

  it('admits allow-listed Google accounts, case-insensitively', async () => {
    const s = await signIn({ sub: 'the-admin', email: TEST_ADMIN_EMAIL.toUpperCase() }, false);
    expect(s.me.isAdmin).toBe(true);
    const res = await request(t.server()).get('/v1/admin/me').set(bearer(s.accessToken)).expect(200);
    expect(Me.parse(res.body).isAdmin).toBe(true);
  });
});

describe('suspended and banned accounts', () => {
  it('lose their sessions immediately and cannot sign in again', async () => {
    const s = await signIn({ sub: 'to-suspend' });
    await t.pool.query(`UPDATE users SET status = 'SUSPENDED' WHERE id = $1`, [s.me.id]);

    let res = await request(t.server()).get('/v1/me').set(bearer(s.accessToken)).expect(403);
    expect(problem(res.body).code).toBe('ACCOUNT_SUSPENDED');

    const idToken = await t.googleToken({ sub: 'to-suspend', email: 'to-suspend@example.tn' });
    res = await request(t.server()).post('/v1/auth/google').send({ idToken }).expect(403);
    expect(problem(res.body).code).toBe('ACCOUNT_SUSPENDED');

    const { rows } = await t.pool.query(
      'SELECT count(*)::int AS live FROM sessions WHERE user_id = $1 AND revoked_at IS NULL',
      [s.me.id],
    );
    expect(rows[0]).toEqual({ live: 0 });
  });

  it('cannot refresh once banned', async () => {
    const s = await signIn();
    await t.pool.query(`UPDATE users SET status = 'BANNED' WHERE id = $1`, [s.me.id]);
    const res = await request(t.server())
      .post('/v1/auth/refresh')
      .send({ refreshToken: s.refreshToken })
      .expect(403);
    expect(problem(res.body).code).toBe('ACCOUNT_BANNED');
  });
});

describe('DELETE /v1/me (R-005)', () => {
  it('anonymises the account, ends sessions, removes devices and writes an audit entry', async () => {
    const s = await signIn({ sub: 'leaver' });
    await request(t.server()).delete('/v1/me').set(bearer(s.accessToken)).expect(204);

    const { rows } = await t.pool.query(
      'SELECT status, email, display_name, google_sub, deleted_at IS NOT NULL AS deleted FROM users WHERE id = $1',
      [s.me.id],
    );
    expect(rows).toEqual([
      { status: 'DELETED', email: null, display_name: null, google_sub: null, deleted: true },
    ]);
    await request(t.server()).get('/v1/me').set(bearer(s.accessToken)).expect(401);

    const devices = await t.pool.query('SELECT 1 FROM devices WHERE user_id = $1', [s.me.id]);
    expect(devices.rowCount).toBe(0);
    const audit = await t.pool.query(`SELECT actor_type, action FROM audit.audit_logs WHERE target_id = $1`, [
      s.me.id,
    ]);
    expect(audit.rows).toEqual([{ actor_type: 'USER', action: 'user.delete' }]);
  });

  it('lets the same Google account start over as a new user', async () => {
    const before = await signIn({ sub: 'comes-back' });
    await request(t.server()).delete('/v1/me').set(bearer(before.accessToken)).expect(204);
    const after = await signIn({ sub: 'comes-back' });
    expect(after.me.id).not.toBe(before.me.id);
    expect(after.me.needsOnboarding).toBe(true);
  });

  it('keeps a banned account banned after deletion (no sanction evasion)', async () => {
    const s = await signIn({ sub: 'banned-leaver' });
    await t.pool.query(`UPDATE users SET status = 'BANNED' WHERE id = $1`, [s.me.id]);
    // Banned users cannot call the API, so this is what an admin-side deletion would leave behind.
    await t.pool.query(
      `UPDATE users SET email = NULL, display_name = NULL, deleted_at = now() WHERE id = $1`,
      [s.me.id],
    );
    const idToken = await t.googleToken({ sub: 'banned-leaver', email: 'banned-leaver@example.tn' });
    const res = await request(t.server()).post('/v1/auth/google').send({ idToken }).expect(403);
    expect(problem(res.body).code).toBe('ACCOUNT_BANNED');
    const { rows } = await t.pool.query('SELECT email FROM users WHERE id = $1', [s.me.id]);
    expect(rows).toEqual([{ email: null }]);
  });
});
