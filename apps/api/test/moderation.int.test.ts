import {
  AdminAppealList,
  AdminPickupList,
  AdminReportDetail,
  AdminReportList,
  AdminRiskFlagList,
  AdminStats,
  AdminUserDetail,
  BlockList,
  BlockView,
  CurrentRequest,
  type FixInput,
  FinderResponse,
  MapView,
  ProblemDetails,
  ReportCreated,
  SharingHistory,
  SignInResponse,
} from '@fi-thnitek/contracts';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SanctionsService } from '../src/moderation/sanctions.service.js';
import { ModerationSweepJob } from '../src/moderation/moderation.module.js';
import { TEST_ADMIN_EMAIL, TEST_TERMS_VERSION, type TestApp, startTestApp } from './test-app.js';

let t: TestApp;
let admin: SignInResponse;
let n = 0;

type Signed = SignInResponse & { userId: string; sub: string };

const TUNIS = { lat: 36.8065, lng: 10.1815 };
const SOUSSE = { lat: 35.8256, lng: 10.6084 };
const at = (northM: number, eastM = 0) => ({
  lat: TUNIS.lat + northM / 111_195,
  lng: TUNIS.lng + eastM / 89_000,
});
const CITY = { south: 36.75, west: 10.1, north: 36.86, east: 10.26 };

beforeAll(async () => {
  t = await startTestApp();
  admin = await signIn('Admin', TEST_ADMIN_EMAIL);
});

afterAll(async () => {
  await t?.close();
});

const bearer = (s: SignInResponse) => ({ Authorization: `Bearer ${s.accessToken}` });
const problem = (body: unknown) => ProblemDetails.parse(body);
const pushesTo = (s: Signed, event: string) =>
  t.push.sent.filter((m) => m.data.event === event && m.tokens.includes(`push-${s.sub}`)).length;

async function signIn(name = 'Marwen', email?: string, installId = uuidv7()): Promise<Signed> {
  const sub = `mod-${++n}`;
  const idToken = await t.googleToken({ sub, email: email ?? `${sub}@example.tn` });
  const s = SignInResponse.parse(
    (
      await request(t.server())
        .post('/v1/auth/google')
        .send({ idToken, device: { installId, platform: 'android', appVersion: '1.0.0' } })
        .expect(200)
    ).body,
  );
  await request(t.server())
    .patch('/v1/me')
    .set(bearer(s))
    .send({ displayName: name, acceptTermsVersion: TEST_TERMS_VERSION })
    .expect(200);
  await t.pool.query(`UPDATE users SET created_at = now() - interval '10 days' WHERE id = $1`, [s.me.id]);
  await t.pool.query(`UPDATE devices SET push_token = $2 WHERE user_id = $1`, [s.me.id, `push-${sub}`]);
  return { ...s, userId: s.me.id, sub };
}

const fix = (p: { lat: number; lng: number }, agoS = 0): FixInput => ({
  ts: Date.now() - agoS * 1000,
  ...p,
  accuracyM: 6,
});

async function verifiedDriver(type: 'TAXI' | 'LOUAGE' = 'TAXI', name = 'Sami') {
  const s = await signIn(name);
  await t.pool.query(
    `INSERT INTO driver_profiles (user_id, legal_first_name, legal_last_name, cin_hmac, cin_last4, cin_encrypted, transport_type, status)
     VALUES ($1, $2, 'Ben Ali', $3, '1234', 'x', $4, 'VERIFIED')`,
    [s.userId, name, `hmac-${s.userId}`, type],
  );
  await t.pool.query(
    `INSERT INTO vehicles (id, driver_user_id, transport_type, plate_normalized, plate_display, seats) VALUES ($1, $2, $3, $4, $5, 4)`,
    [uuidv7(), s.userId, type, `p-${s.userId}`, `${n} تونس 1234`],
  );
  return s;
}

async function sharingDriver(
  p: { lat: number; lng: number },
  type: 'TAXI' | 'LOUAGE' = 'TAXI',
  name = 'Sami',
) {
  const s = await verifiedDriver(type, name);
  await request(t.server())
    .post('/v1/driver/sharing/start')
    .set(bearer(s))
    .send({ fix: fix(p) })
    .expect(200);
  const status = await request(t.server()).get('/v1/driver/sharing').set(bearer(s)).expect(200);
  return { ...s, sessionId: (status.body as { session: { id: string } }).session.id };
}

async function waitingPassenger(p: { lat: number; lng: number }, extra: object = {}, name = 'Marwen') {
  const s = await signIn(name);
  await request(t.server())
    .post('/v1/requests')
    .set(bearer(s))
    .send({ destination: { point: SOUSSE }, types: ['TAXI'], ...extra })
    .expect(201);
  await request(t.server())
    .post('/v1/location/pings')
    .set(bearer(s))
    .send({ fixes: [fix(p, 60)], locationServicesOn: true })
    .expect(200);
  const current = CurrentRequest.parse(
    (await request(t.server()).get('/v1/requests/current').set(bearer(s)).expect(200)).body,
  );
  return { ...s, requestId: current.request!.id };
}

const statusOf = async (userId: string) =>
  (await t.pool.query<{ status: string }>(`SELECT status FROM users WHERE id = $1`, [userId])).rows[0]
    ?.status;
const report = (s: SignInResponse, body: object) =>
  request(t.server()).post('/v1/reports').set(bearer(s)).send(body);
const map = async (s: SignInResponse) =>
  MapView.parse(
    (await request(t.server()).post('/v1/map').set(bearer(s)).send({ bbox: CITY }).expect(200)).body,
  );
const current = async (s: SignInResponse) =>
  CurrentRequest.parse(
    (await request(t.server()).get('/v1/requests/current').set(bearer(s)).expect(200)).body,
  );

describe('reports (R-070)', () => {
  it('files a marker report with a priority, and the admin queue lists HIGH first', async () => {
    const driver = await sharingDriver(at(300));
    const passenger = await signIn();
    const other = ReportCreated.parse(
      (
        await report(passenger, {
          source: 'DRIVER_MARKER',
          sessionId: driver.sessionId,
          category: 'SPAM',
        }).expect(201)
      ).body,
    );
    const unsafe = ReportCreated.parse(
      (
        await report(passenger, {
          source: 'DRIVER_MARKER',
          sessionId: driver.sessionId,
          category: 'UNSAFE',
          description: 'Conduite dangereuse',
        }).expect(201)
      ).body,
    );
    expect(unsafe.blocked).toBe(false);

    const queue = AdminReportList.parse(
      (await request(t.server()).get('/v1/admin/reports?status=OPEN').set(bearer(admin)).expect(200)).body,
    );
    const ids = queue.reports.map((r) => r.id);
    expect(ids.indexOf(unsafe.id)).toBeLessThan(ids.indexOf(other.id));
    const detail = AdminReportDetail.parse(
      (await request(t.server()).get(`/v1/admin/reports/${unsafe.id}`).set(bearer(admin)).expect(200)).body,
    );
    expect(detail).toMatchObject({
      priority: 'HIGH',
      category: 'UNSAFE',
      reporter: { id: passenger.userId, name: 'Marwen' },
      target: { id: driver.userId, name: 'Sami Ben Ali' },
      session: { id: driver.sessionId, driver: { id: driver.userId } },
      targetReports30d: 1,
    });
  });

  it('refuses reporting yourself, "nobody there" from a passenger, and unknown markers', async () => {
    const driver = await sharingDriver(at(400));
    const self = await report(driver, {
      source: 'DRIVER_MARKER',
      sessionId: driver.sessionId,
      category: 'OTHER',
    }).expect(422);
    expect(problem(self.body).code).toBe('REPORT_NOT_ALLOWED');

    const passenger = await signIn();
    const p2 = await waitingPassenger(at(450));
    const nobody = await report(passenger, {
      source: 'PASSENGER_MARKER',
      requestId: p2.requestId,
      category: 'NOBODY_THERE',
    }).expect(422);
    expect(problem(nobody.body).detail).toBe('CATEGORY_NOT_ALLOWED');

    await report(passenger, { source: 'DRIVER_MARKER', sessionId: uuidv7(), category: 'OTHER' }).expect(404);
  });

  it('reports from the own history, with no known target, and only on own items', async () => {
    const p = await waitingPassenger(at(500));
    const stranger = await signIn();
    await report(stranger, { source: 'MY_REQUEST', requestId: p.requestId, category: 'OTHER' }).expect(404);
    const own = ReportCreated.parse(
      (await report(p, { source: 'MY_REQUEST', requestId: p.requestId, category: 'HARASSMENT' }).expect(201))
        .body,
    );
    const detail = AdminReportDetail.parse(
      (await request(t.server()).get(`/v1/admin/reports/${own.id}`).set(bearer(admin)).expect(200)).body,
    );
    expect(detail.target).toBeNull();
    expect(detail.request).toMatchObject({ id: p.requestId, passenger: { id: p.userId }, status: 'OPEN' });

    const d = await sharingDriver(at(-500));
    const history = SharingHistory.parse(
      (await request(t.server()).get('/v1/driver/sharing/history').set(bearer(d)).expect(200)).body,
    );
    expect(history.sessions.map((s) => s.id)).toEqual([d.sessionId]);
    const outside = await report(d, {
      source: 'MY_SESSION',
      sessionId: d.sessionId,
      approxAt: new Date(Date.now() - 3_600_000).toISOString(),
      category: 'OTHER',
    }).expect(422);
    expect(problem(outside.body).detail).toBe('OUTSIDE_SESSION');
    await report(d, {
      source: 'MY_SESSION',
      sessionId: d.sessionId,
      approxAt: new Date().toISOString(),
      category: 'HARASSMENT',
    }).expect(201);
  });

  it('caps reports per Tunis day', async () => {
    const p = await waitingPassenger(at(600));
    for (let i = 0; i < 10; i++) {
      await report(p, { source: 'MY_REQUEST', requestId: p.requestId, category: 'OTHER' }).expect(201);
    }
    const capped = await report(p, {
      source: 'MY_REQUEST',
      requestId: p.requestId,
      category: 'OTHER',
    }).expect(429);
    expect(problem(capped.body).code).toBe('REPORT_LIMIT');
  });
});

describe('automatic actions (anti-abuse §3)', () => {
  it('pauses requesting for 24 h after "nobody there" from 3 distinct drivers, not from one driver twice', async () => {
    const p = await waitingPassenger(at(1000));
    const [d1, d2, d3] = [await verifiedDriver(), await verifiedDriver(), await verifiedDriver()];
    const nobody = { source: 'PASSENGER_MARKER', requestId: p.requestId, category: 'NOBODY_THERE' };
    await report(d1, nobody).expect(201);
    await report(d1, nobody).expect(201);
    await report(d2, nobody).expect(201);
    expect((await current(p)).request?.status).toBe('OPEN');

    await report(d3, nobody).expect(201);
    const after = await current(p);
    expect(after.request).toBeNull();
    expect(after.lastClosed?.status).toBe('REMOVED');
    expect(after.blockers).toContain('PAUSED');
    expect(new Date(after.pausedUntil!).getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    expect(pushesTo(p, 'REQUEST_PAUSED')).toBe(1);

    const refused = await request(t.server())
      .post('/v1/requests')
      .set(bearer(p))
      .send({ destination: { point: SOUSSE }, types: ['TAXI'] })
      .expect(403);
    expect(problem(refused.body).code).toBe('REQUEST_PAUSED');

    const flags = AdminRiskFlagList.parse(
      (
        await request(t.server())
          .get(`/v1/admin/risk-flags?userId=${p.userId}`)
          .set(bearer(admin))
          .expect(200)
      ).body,
    );
    expect(flags.flags).toEqual([
      expect.objectContaining({ type: 'NOBODY_THERE_CLUSTER', evidence: { reporters: 3, windowDays: 7 } }),
    ]);
    // A pause is not a suspension: the account still works.
    const user = AdminUserDetail.parse(
      (await request(t.server()).get(`/v1/admin/users/${p.userId}`).set(bearer(admin)).expect(200)).body,
    );
    expect(user.status).toBe('ACTIVE');
    expect(user.sanctions).toEqual([
      expect.objectContaining({ type: 'REQUEST_PAUSE', createdBy: null, active: true }),
    ]);
  });

  it('flags a driver after reports from 3 distinct users, without any automatic sanction', async () => {
    const d = await sharingDriver(at(1500));
    for (let i = 0; i < 3; i++) {
      const p = await signIn();
      await report(p, { source: 'DRIVER_MARKER', sessionId: d.sessionId, category: 'FAKE_PROFILE' }).expect(
        201,
      );
    }
    const flags = AdminRiskFlagList.parse(
      (
        await request(t.server())
          .get(`/v1/admin/risk-flags?userId=${d.userId}`)
          .set(bearer(admin))
          .expect(200)
      ).body,
    );
    expect(flags.flags.map((f) => f.type)).toEqual(['REPORTS_CLUSTER']);
    expect(
      (await request(t.server()).get('/v1/driver/sharing').set(bearer(d)).expect(200)).body,
    ).toMatchObject({
      session: { id: d.sessionId },
    });

    await request(t.server())
      .post(`/v1/admin/risk-flags/${flags.flags[0]!.id}/review`)
      .set(bearer(admin))
      .expect(204);
    await request(t.server())
      .post(`/v1/admin/risk-flags/${flags.flags[0]!.id}/review`)
      .set(bearer(admin))
      .expect(409);
  });

  it('blocks a third account on one device from requesting (anti-abuse §2)', async () => {
    const device = uuidv7();
    await signIn('Un', undefined, device);
    await signIn('Deux', undefined, device);
    const third = await signIn('Trois', undefined, device);
    expect((await current(third)).blockers).toContain('DEVICE_LIMIT');
    const refused = await request(t.server())
      .post('/v1/requests')
      .set(bearer(third))
      .send({ destination: { point: SOUSSE }, types: ['TAXI'] })
      .expect(403);
    expect(problem(refused.body).code).toBe('REQUEST_NOT_ALLOWED');
  });
});

describe('blocks (R-027, R-071)', () => {
  it('hides both people from each other on the map and in the finder, until unblocked', async () => {
    const d = await sharingDriver(at(2000), 'TAXI', 'Karim');
    const p = await waitingPassenger(at(2050));
    expect((await map(p)).drivers.map((x) => x.id)).toContain(d.sessionId);
    expect((await map(d)).passengers.map((x) => x.id)).toContain(p.requestId);
    const finder = async () =>
      FinderResponse.parse(
        (
          await request(t.server())
            .post('/v1/finder')
            .set(bearer(p))
            .send({ destination: { point: SOUSSE }, near: at(2050) })
            .expect(200)
        ).body,
      );
    expect((await finder()).taxisNearby.map((x) => x.id)).toContain(d.sessionId);

    const block = BlockView.parse(
      (
        await request(t.server())
          .post('/v1/blocks')
          .set(bearer(p))
          .send({ source: 'DRIVER_MARKER', sessionId: d.sessionId })
          .expect(201)
      ).body,
    );
    expect(block).toMatchObject({ kind: 'DRIVER', name: 'Karim' });
    expect((await map(p)).drivers.map((x) => x.id)).not.toContain(d.sessionId);
    expect((await map(d)).passengers.map((x) => x.id)).not.toContain(p.requestId);
    expect((await finder()).taxisNearby.map((x) => x.id)).not.toContain(d.sessionId);

    const list = BlockList.parse(
      (await request(t.server()).get('/v1/blocks').set(bearer(p)).expect(200)).body,
    );
    expect(list.blocks.map((b) => b.id)).toEqual([block.id]);
    // Only the blocker can lift it.
    await request(t.server()).delete(`/v1/blocks/${block.id}`).set(bearer(d)).expect(404);
    await request(t.server()).delete(`/v1/blocks/${block.id}`).set(bearer(p)).expect(204);
    expect((await map(p)).drivers.map((x) => x.id)).toContain(d.sessionId);
  });

  it('blocks from a report; a passenger who stayed anonymous has no name in the list', async () => {
    const d = await sharingDriver(at(2500));
    const p = await waitingPassenger(at(2550), { showIdentity: false });
    const created = ReportCreated.parse(
      (
        await report(d, {
          source: 'PASSENGER_MARKER',
          requestId: p.requestId,
          category: 'SPAM',
          block: true,
        }).expect(201)
      ).body,
    );
    expect(created.blocked).toBe(true);
    const list = BlockList.parse(
      (await request(t.server()).get('/v1/blocks').set(bearer(d)).expect(200)).body,
    );
    expect(list.blocks).toEqual([expect.objectContaining({ kind: 'PASSENGER', name: null })]);
    expect((await map(d)).passengers.map((x) => x.id)).not.toContain(p.requestId);
  });
});

describe('sanctions (R-073, admin only)', () => {
  it('suspends a sharing driver: sessions revoked, sharing ended without cooldown, the reason shown, audited', async () => {
    const d = await sharingDriver(at(3000));
    const before = await request(t.server())
      .post(`/v1/admin/users/${d.userId}/sanctions`)
      .set(bearer(admin))
      .send({ type: 'SUSPENSION', reason: 'Comportement signalé' })
      .expect(400);
    expect(problem(before.body).code).toBe('VALIDATION_FAILED');

    const detail = AdminUserDetail.parse(
      (
        await request(t.server())
          .post(`/v1/admin/users/${d.userId}/sanctions`)
          .set(bearer(admin))
          .send({ type: 'SUSPENSION', reason: 'Comportement signalé', days: 7 })
          .expect(201)
      ).body,
    );
    expect(detail.status).toBe('SUSPENDED');
    // The very next call says why; the refresh token is dead too.
    const refused = problem((await request(t.server()).get('/v1/me').set(bearer(d)).expect(403)).body);
    expect(refused).toMatchObject({
      code: 'ACCOUNT_SUSPENDED',
      sanction: { reason: 'Comportement signalé' },
    });
    const refresh = await request(t.server())
      .post('/v1/auth/refresh')
      .send({ refreshToken: d.refreshToken })
      .expect(403);
    expect(problem(refresh.body).code).toBe('ACCOUNT_SUSPENDED');
    const { rows: live } = await t.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`,
      [d.userId],
    );
    expect(live[0]?.n).toBe(0);
    const { rows: s } = await t.pool.query(
      `SELECT end_reason, cooldown_applied FROM sharing_sessions WHERE id = $1`,
      [d.sessionId],
    );
    expect(s[0]).toEqual({ end_reason: 'SUSPENDED', cooldown_applied: false });
    expect(pushesTo(d, 'ACCOUNT_SUSPENDED')).toBe(1);

    // Signing in again: 403 with the reason and the end date.
    const signInAgain = await request(t.server())
      .post('/v1/auth/google')
      .send({ idToken: await t.googleToken({ sub: d.sub, email: `${d.sub}@example.tn` }) })
      .expect(403);
    const body = problem(signInAgain.body);
    expect(body.code).toBe('ACCOUNT_SUSPENDED');
    expect(body.sanction).toMatchObject({ type: 'SUSPENSION', reason: 'Comportement signalé' });
    expect(new Date(body.sanction!.endsAt!).getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);

    const { rows: audit } = await t.pool.query(
      `SELECT action FROM audit.audit_logs WHERE target_id = $1 ORDER BY created_at`,
      [d.userId],
    );
    expect(audit.map((a: { action: string }) => a.action)).toContain('sanction.create');

    // Revoked early: the account works again.
    const sanctionId = detail.sanctions[0]!.id;
    await request(t.server())
      .post(`/v1/admin/sanctions/${sanctionId}/revoke`)
      .set(bearer(admin))
      .send({ reason: 'Erreur de signalement' })
      .expect(204);
    await request(t.server())
      .post('/v1/auth/google')
      .send({ idToken: await t.googleToken({ sub: d.sub, email: `${d.sub}@example.tn` }) })
      .expect(200);
  });

  it('gives the account back when a suspension runs out (sweep)', async () => {
    const p = await signIn();
    await request(t.server())
      .post(`/v1/admin/users/${p.userId}/sanctions`)
      .set(bearer(admin))
      .send({ type: 'SUSPENSION', reason: 'Spam répété', days: 1 })
      .expect(201);
    await t.app.get(SanctionsService).sweep();
    expect(await statusOf(p.userId)).toBe('SUSPENDED');
    await t.pool.query(`UPDATE sanctions SET ends_at = now() - interval '1 minute' WHERE user_id = $1`, [
      p.userId,
    ]);
    expect(await t.app.get(SanctionsService).sweep()).toBeGreaterThanOrEqual(1);
    expect(await statusOf(p.userId)).toBe('ACTIVE');
  });

  it('bans a waiting passenger: the request is removed; the appeal form works once', async () => {
    const p = await waitingPassenger(at(3500));
    await request(t.server())
      .post(`/v1/admin/users/${p.userId}/sanctions`)
      .set(bearer(admin))
      .send({ type: 'BAN', reason: 'Harcèlement grave' })
      .expect(201);
    const { rows } = await t.pool.query<{ status: string }>(
      `SELECT status FROM passenger_requests WHERE id = $1`,
      [p.requestId],
    );
    expect(rows[0]?.status).toBe('REMOVED');

    const idToken = await t.googleToken({ sub: p.sub, email: `${p.sub}@example.tn` });
    const denied = problem(
      (await request(t.server()).post('/v1/auth/google').send({ idToken }).expect(403)).body,
    );
    expect(denied).toMatchObject({ code: 'ACCOUNT_BANNED', sanction: { type: 'BAN', endsAt: null } });

    await request(t.server())
      .post('/v1/auth/appeal')
      .send({ idToken, message: 'Je conteste cette décision, merci de revoir.' })
      .expect(204);
    await request(t.server())
      .post('/v1/auth/appeal')
      .send({ idToken, message: 'Encore une fois, merci.' })
      .expect(409);
    const active = await signIn();
    await request(t.server())
      .post('/v1/auth/appeal')
      .send({
        idToken: await t.googleToken({ sub: active.sub, email: `${active.sub}@example.tn` }),
        message: 'Je ne suis pas sanctionné.',
      })
      .expect(403);

    const appeals = AdminAppealList.parse(
      (await request(t.server()).get('/v1/admin/appeals?status=OPEN').set(bearer(admin)).expect(200)).body,
    );
    const mine = appeals.appeals.find((a) => a.user.id === p.userId)!;
    expect(mine.sanction).toMatchObject({ type: 'BAN', active: true });
    await request(t.server()).post(`/v1/admin/appeals/${mine.id}/close`).set(bearer(admin)).expect(204);
  });

  it('keeps every moderation endpoint admin-only', async () => {
    const u = await signIn();
    for (const path of [
      '/v1/admin/reports',
      '/v1/admin/pickups?requestId=' + uuidv7(),
      '/v1/admin/users',
      '/v1/admin/stats',
    ]) {
      const res = await request(t.server()).get(path).set(bearer(u)).expect(403);
      expect(problem(res.body).code).toBe('ADMIN_REQUIRED');
    }
    await request(t.server())
      .post(`/v1/admin/users/${u.userId}/sanctions`)
      .set(bearer(u))
      .send({ type: 'WARNING', reason: 'Tentative' })
      .expect(403);
  });
});

describe('pick-up records (R-039, NFR-06)', () => {
  it('are admin-only and audited, and never appear in any user endpoint', async () => {
    const d = await sharingDriver(at(4010), 'TAXI', 'Hedi');
    const p = await waitingPassenger(at(4000));
    const moved = await request(t.server())
      .post('/v1/location/pings')
      .set(bearer(p))
      .send({ fixes: [fix(at(4040), 25), fix(at(4045), 5)], locationServicesOn: true })
      .expect(200);
    expect(moved.body).toMatchObject({ stop: true, reason: 'MOVED_AWAY' });

    const records = AdminPickupList.parse(
      (
        await request(t.server())
          .get(`/v1/admin/pickups?requestId=${p.requestId}`)
          .set(bearer(admin))
          .expect(200)
      ).body,
    );
    expect(records.records).toEqual([
      expect.objectContaining({ requestId: p.requestId, driver: { id: d.userId, name: 'Hedi Ben Ali' } }),
    ]);
    const { rows: audit } = await t.pool.query(
      `SELECT actor_user_id, action FROM audit.audit_logs WHERE action = 'pickup_records.read' AND target_id = $1`,
      [p.requestId],
    );
    expect(audit).toEqual([{ actor_user_id: admin.me.id, action: 'pickup_records.read' }]);

    // Everything the passenger and the driver can read.
    const reads = [
      ['get', '/v1/requests/current', p],
      ['get', '/v1/requests/history', p],
      ['get', '/v1/me', p],
      ['get', '/v1/blocks', p],
      ['post', '/v1/map', p, { bbox: CITY }],
      ['post', '/v1/finder', p, { destination: { point: SOUSSE }, near: at(4000) }],
      ['get', '/v1/driver/sharing', d],
      ['get', '/v1/driver/sharing/history', d],
      ['get', '/v1/me', d],
      ['post', '/v1/map', d, { bbox: CITY }],
    ] as const;
    for (const [method, path, who, body] of reads) {
      const req = request(t.server())[method](path).set(bearer(who));
      const res = await (body ? req.send(body) : req);
      expect(res.status, path).toBeLessThan(300);
      const text = JSON.stringify(res.body);
      expect(text, path).not.toMatch(/pickup|minDistance/i);
      // Neither learns who the other was.
      expect(text, path).not.toContain(who === p ? d.userId : p.userId);
    }
  });

  it('purges records after the retention period unless an open report needs them', async () => {
    const job = t.app.get(ModerationSweepJob);
    const { rows } = await t.pool.query<{ request_id: string }>(
      `SELECT request_id FROM pickup_records LIMIT 1`,
    );
    const requestId = rows[0]!.request_id;
    await t.pool.query(`UPDATE pickup_records SET recorded_at = now() - interval '91 days'`);
    const { rows: owner } = await t.pool.query<{ passenger_user_id: string }>(
      `SELECT passenger_user_id FROM passenger_requests WHERE id = $1`,
      [requestId],
    );
    await t.pool.query(
      `INSERT INTO reports (id, reporter_user_id, source, category, priority, request_id) VALUES ($1, $2, 'MY_REQUEST', 'UNSAFE', 'HIGH', $3)`,
      [uuidv7(), owner[0]?.passenger_user_id, requestId],
    );
    await job.purgePickups();
    const { rows: kept } = await t.pool.query(`SELECT request_id FROM pickup_records`);
    expect(kept.map((r: { request_id: string }) => r.request_id)).toEqual([requestId]);
  });
});

describe('admin stats', () => {
  it('counts users, live activity and the moderation backlog', async () => {
    const stats = AdminStats.parse(
      (await request(t.server()).get('/v1/admin/stats').set(bearer(admin)).expect(200)).body,
    );
    expect(stats.users.total).toBeGreaterThan(10);
    expect(stats.moderation.openReports).toBeGreaterThan(0);
    expect(stats.moderation.unreviewedFlags).toBeGreaterThan(0);
    expect(stats.moderation.banned).toBeGreaterThanOrEqual(1);
  });
});
