import {
  AdminPickupList,
  AdminReportDetail,
  AdminRiskFlagList,
  AdminSessionDetail,
  PingsResponse,
  ProblemDetails,
  ReportCreated,
  SharingStatus,
  type SignInResponse,
} from '@fi-thnitek/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RequestsService } from '../src/requests/requests.service.js';
import { SharingService } from '../src/sharing/sharing.service.js';
import { type Signed, SOUSSE, at, bearer, fix, fixtures } from './fixtures.js';
import { type TestApp, startTestApp } from './test-app.js';

/**
 * docs/anti-abuse.md §4, one test per scenario, end to end through the API: what is detected, what
 * happens at once, what evidence the admin gets, and what is deliberately left to a human.
 */
let t: TestApp;
let f: ReturnType<typeof fixtures>;
let admin: Signed;

beforeAll(async () => {
  t = await startTestApp();
  f = fixtures(t, 'scn');
  admin = await f.admin();
});

afterAll(async () => {
  await t?.close();
});

const MIN = 60_000;
const problem = (body: unknown) => ProblemDetails.parse(body);
const report = (s: SignInResponse, body: object) =>
  request(t.server()).post('/v1/reports').set(bearer(s)).send(body);
const sharing = async (s: SignInResponse) =>
  SharingStatus.parse((await request(t.server()).get('/v1/driver/sharing').set(bearer(s)).expect(200)).body);
const flagsOf = async (userId: string) =>
  AdminRiskFlagList.parse(
    (await request(t.server()).get(`/v1/admin/risk-flags?userId=${userId}`).set(bearer(admin)).expect(200))
      .body,
  ).flags;
const sessionRow = async (sessionId: string) =>
  (
    await t.pool.query<{ end_reason: string | null; cooldown_applied: boolean }>(
      `SELECT end_reason, cooldown_applied FROM sharing_sessions WHERE id = $1`,
      [sessionId],
    )
  ).rows[0];

describe('anti-abuse scenarios (docs/anti-abuse.md §4)', () => {
  it('1 · troll request: it expires at 60 min at the latest; 3 "nobody there" pause requesting for 24 h', async () => {
    const lonely = await f.waitingPassenger(at(100));
    await t.app.get(RequestsService).sweep(new Date(Date.now() + 61 * MIN));
    expect((await f.currentRequest(lonely)).lastClosed?.status).toBe('EXPIRED');

    const troll = await f.waitingPassenger(at(150));
    for (const d of [await f.verifiedDriver(), await f.verifiedDriver(), await f.verifiedDriver()]) {
      await report(d, {
        source: 'PASSENGER_MARKER',
        requestId: troll.requestId,
        category: 'NOBODY_THERE',
      }).expect(201);
    }
    const after = await f.currentRequest(troll);
    expect(after.lastClosed?.status).toBe('REMOVED');
    expect(after.blockers).toContain('PAUSED');
  });

  it('2 · passenger takes another vehicle: moving > 20 m closes the request, nobody reviews it', async () => {
    const p = await f.waitingPassenger(at(300));
    const res = PingsResponse.parse((await f.pings(p, [fix(at(330), 25), fix(at(335), 5)])).body);
    expect(res).toMatchObject({ stop: true, reason: 'MOVED_AWAY' });
    expect(await flagsOf(p.userId)).toEqual([]);
  });

  it('3 · drivers race to one passenger: both see the passenger and each other; the farther one is told', async () => {
    const near = await f.sharingDriver(at(510));
    const far = await f.sharingDriver(at(700));
    const p = await f.waitingPassenger(at(500));
    const nearView = await f.map(near);
    const farView = await f.map(far);
    expect(nearView.drivers.map((d) => d.id)).toContain(far.sessionId);
    expect(farView.drivers.map((d) => d.id)).toContain(near.sessionId);
    const seen = (v: typeof nearView) => v.passengers.find((x) => x.id === p.requestId);
    expect(seen(nearView)).toMatchObject({ exact: true, closerDrivers: 0 });
    expect(seen(farView)).toMatchObject({ exact: true, closerDrivers: 1 });
  });

  it('4 · driver hides then peeks: no map without sharing, no passenger mode, 1 h cooldown after a stop', async () => {
    const d = await f.sharingDriver(at(900));
    await request(t.server()).post('/v1/driver/sharing/stop').set(bearer(d)).expect(200);
    const peek = await request(t.server())
      .post('/v1/map')
      .set(bearer(d))
      .send({ bbox: { south: 36.75, west: 10.1, north: 36.86, east: 10.26 } })
      .expect(403);
    expect(problem(peek.body).code).toBe('SHARING_REQUIRED');
    const asPassenger = await request(t.server())
      .post('/v1/requests')
      .set(bearer(d))
      .send({ destination: { point: SOUSSE }, types: ['TAXI'] })
      .expect(403);
    expect(problem(asPassenger.body).code).toBe('REQUEST_NOT_ALLOWED');
    const restart = await request(t.server())
      .post('/v1/driver/sharing/start')
      .set(bearer(d))
      .send({ fix: fix(at(900)) })
      .expect(409);
    expect(problem(restart.body).code).toBe('COOLDOWN_ACTIVE');
    // The admin can lift it on request (e.g. a genuine mistake).
    await request(t.server())
      .post(`/v1/admin/drivers/${d.userId}/clear-cooldown`)
      .set(bearer(admin))
      .expect(204);
    await request(t.server())
      .post('/v1/driver/sharing/start')
      .set(bearer(d))
      .send({ fix: fix(at(900)) })
      .expect(200);
  });

  it('5 · driver kills the app to dodge the cooldown: PING_GAP, with the cooldown counted from the last fix', async () => {
    const silence = async (d: { userId: string; sessionId: string }, minutes: number) => {
      await t.pool.query(
        `UPDATE driver_live_locations SET fix_ts = now() - make_interval(mins => $2), recent_fixes = '[]' WHERE driver_user_id = $1`,
        [d.userId, minutes],
      );
      await t.pool.query(
        `UPDATE sharing_sessions SET last_fix_at = now() - make_interval(mins => $2) WHERE id = $1`,
        [d.sessionId, minutes],
      );
    };

    // Back after 10 min: the first upload reveals the hole.
    const back = await f.sharingDriver(at(1100));
    await silence(back, 10);
    const res = PingsResponse.parse((await f.pings(back, [fix(at(1100))])).body);
    expect(res).toMatchObject({ stop: true, reason: 'PING_GAP' });
    expect(
      Math.abs(new Date(res.cooldownUntil!).getTime() - (Date.now() - 10 * MIN + 60 * MIN)),
    ).toBeLessThan(5_000);
    expect(await sessionRow(back.sessionId)).toEqual({ end_reason: 'PING_GAP', cooldown_applied: true });

    // Never back: hidden at once (no fresh fix), ended by the sweep once the offline buffer is over.
    const gone = await f.sharingDriver(at(1150));
    await silence(gone, 3);
    expect((await f.map(await f.signIn())).drivers.map((x) => x.id)).not.toContain(gone.sessionId);
    await silence(gone, 61);
    await t.app.get(SharingService).sweep();
    expect((await sessionRow(gone.sessionId))?.end_reason).toBe('PING_GAP');
  });

  it('6 · network loss covered by buffered fixes: the session simply continues', async () => {
    const d = await f.sharingDriver(at(1300, 5_000));
    await t.pool.query(
      `UPDATE driver_live_locations SET fix_ts = now() - interval '400 seconds', recent_fixes = '[]' WHERE driver_user_id = $1`,
      [d.userId],
    );
    await t.pool.query(
      `UPDATE sharing_sessions SET last_fix_at = now() - interval '400 seconds' WHERE id = $1`,
      [d.sessionId],
    );
    const buffered = Array.from({ length: 39 }, (_, i) => fix(at(1300, 5_000 + i * 20), 390 - i * 10));
    expect(PingsResponse.parse((await f.pings(d, buffered)).body).stop).toBe(false);
    expect((await sharing(d)).session?.state).toBe('SHARING');
  });

  it('7 · GPS spoofing by a driver: sharing ends with a cooldown and a flag for the admin', async () => {
    const d = await f.sharingDriver(at(1500));
    const res = PingsResponse.parse((await f.pings(d, [fix(at(1505), 0, { isMock: true })])).body);
    expect(res).toMatchObject({ stop: true, reason: 'SPOOF_SUSPECTED' });
    expect(await sessionRow(d.sessionId)).toEqual({ end_reason: 'SPOOF_SUSPECTED', cooldown_applied: true });
    expect((await flagsOf(d.userId)).map((x) => x.type)).toEqual(['MOCK_LOCATION']);
  });

  it('8 · passenger spoofs to dodge the 20 m rule: the request is removed and flagged', async () => {
    const p = await f.waitingPassenger(at(1700));
    const res = PingsResponse.parse((await f.pings(p, [fix(at(1700), 0, { isMock: true })])).body);
    expect(res).toMatchObject({ stop: true, reason: 'REMOVED' });
    expect((await flagsOf(p.userId)).map((x) => x.type)).toEqual(['MOCK_LOCATION']);
  });

  it('9 · driver behaves badly: the passenger reports from history; pick-up records name the drivers nearby', async () => {
    const a = await f.sharingDriver(at(1910), 'TAXI', 'Anis');
    const b = await f.sharingDriver(at(1930), 'TAXI', 'Bilel');
    const p = await f.waitingPassenger(at(1900));
    await f.pings(p, [fix(at(1940), 25), fix(at(1945), 5)]);

    const r = ReportCreated.parse(
      (
        await report(p, {
          source: 'MY_REQUEST',
          requestId: p.requestId,
          category: 'HARASSMENT',
          description: 'Insultes',
        }).expect(201)
      ).body,
    );
    const detail = AdminReportDetail.parse(
      (await request(t.server()).get(`/v1/admin/reports/${r.id}`).set(bearer(admin)).expect(200)).body,
    );
    expect(detail).toMatchObject({ priority: 'HIGH', target: null, request: { id: p.requestId } });
    const pickups = AdminPickupList.parse(
      (
        await request(t.server())
          .get(`/v1/admin/pickups?requestId=${p.requestId}&reportId=${r.id}`)
          .set(bearer(admin))
          .expect(200)
      ).body,
    );
    // Several drivers were close: all are recorded, nearest first, for the admin to ask about.
    expect(pickups.records.map((x) => x.driver.id)).toEqual([a.userId, b.userId]);
  });

  it('10 · passenger abuses a driver: the driver reports from the session; pick-ups around that time lead to the request', async () => {
    const d = await f.sharingDriver(at(2110), 'TAXI', 'Chokri');
    const p = await f.waitingPassenger(at(2100));
    await f.pings(p, [fix(at(2140), 25), fix(at(2145), 5)]);
    const r = ReportCreated.parse(
      (
        await report(d, {
          source: 'MY_SESSION',
          sessionId: d.sessionId,
          approxAt: new Date().toISOString(),
          category: 'HARASSMENT',
        }).expect(201)
      ).body,
    );
    const from = new Date(Date.now() - 30 * MIN).toISOString();
    const to = new Date(Date.now() + 30 * MIN).toISOString();
    const pickups = AdminPickupList.parse(
      (
        await request(t.server())
          .get(`/v1/admin/pickups?driverUserId=${d.userId}&from=${from}&to=${to}&reportId=${r.id}`)
          .set(bearer(admin))
          .expect(200)
      ).body,
    );
    expect(pickups.records).toEqual([
      expect.objectContaining({ requestId: p.requestId, passenger: { id: p.userId, name: 'Marwen' } }),
    ]);
  });

  it('11 · stalking a passenger: exact positions only reach matching sharing drivers; a block hides them', async () => {
    const stalker = await f.signIn('Curieux');
    const louageDriver = await f.sharingDriver(at(2310), 'LOUAGE');
    const taxi = await f.sharingDriver(at(2320));
    const p = await f.waitingPassenger(at(2300));
    const find = async (s: SignInResponse) => (await f.map(s)).passengers.find((x) => x.id === p.requestId);
    expect(await find(stalker)).toMatchObject({ exact: false });
    expect(await find(louageDriver)).toMatchObject({ exact: false });
    expect(await find(taxi)).toMatchObject({ exact: true });

    await request(t.server())
      .post('/v1/blocks')
      .set(bearer(p))
      .send({ source: 'DRIVER_MARKER', sessionId: taxi.sessionId })
      .expect(201);
    expect(await find(taxi)).toBeUndefined();
  });

  it('12 · stalking a driver: no history anywhere, and a block hides the driver from that person', async () => {
    const d = await f.sharingDriver(at(2510), 'TAXI', 'Dali');
    const stalker = await f.signIn('Curieux');
    const marker = (await f.map(stalker)).drivers.find((x) => x.id === d.sessionId);
    expect(marker).toBeDefined();
    // Only the latest point exists: the driver's live row holds one position.
    const { rows } = await t.pool.query(
      `SELECT count(*)::int AS n FROM driver_live_locations WHERE driver_user_id = $1`,
      [d.userId],
    );
    expect(rows[0]).toEqual({ n: 1 });
    await request(t.server())
      .post('/v1/blocks')
      .set(bearer(d))
      .send({ source: 'DRIVER_MARKER', sessionId: d.sessionId })
      .expect(400);
    await report(stalker, {
      source: 'DRIVER_MARKER',
      sessionId: d.sessionId,
      category: 'OTHER',
      block: true,
    }).expect(201);
    expect((await f.map(stalker)).drivers.map((x) => x.id)).not.toContain(d.sessionId);
  });

  it('13 · several driver accounts: a CIN or plate already registered is refused', async () => {
    const first = await f.signIn();
    await request(t.server())
      .put('/v1/driver/profile')
      .set(bearer(first))
      .send({ legalFirstName: 'Ali', legalLastName: 'Trabelsi', cin: '05556677', transportType: 'TAXI' })
      .expect(200);
    const second = await f.signIn();
    const dup = await request(t.server())
      .put('/v1/driver/profile')
      .set(bearer(second))
      .send({ legalFirstName: 'Ali', legalLastName: 'Trabelsi', cin: '0555 6677', transportType: 'TAXI' })
      .expect(409);
    expect(problem(dup.body).code).toBe('CIN_ALREADY_REGISTERED');
  });

  it('14 · a banned person returns with a new Google account on the same phone: requesting is blocked', async () => {
    const banned = await f.signIn('Banni');
    await request(t.server())
      .post(`/v1/admin/users/${banned.userId}/sanctions`)
      .set(bearer(admin))
      .send({ type: 'BAN', reason: 'Harcèlement répété' })
      .expect(201);
    const returning = await f.signIn('Nouveau', banned.installId);
    expect((await f.currentRequest(returning)).blockers).toContain('DEVICE_LIMIT');
    await request(t.server())
      .post('/v1/requests')
      .set(bearer(returning))
      .send({ destination: { point: SOUSSE }, types: ['TAXI'] })
      .expect(403);
  });

  it('15 · a legitimate driver falsely reported twice: nothing automatic happens', async () => {
    const d = await f.sharingDriver(at(2900));
    for (let i = 0; i < 2; i++) {
      await report(await f.signIn(), {
        source: 'DRIVER_MARKER',
        sessionId: d.sessionId,
        category: 'UNSAFE',
      }).expect(201);
    }
    expect(await flagsOf(d.userId)).toEqual([]);
    expect((await sharing(d)).session?.state).toBe('SHARING');
  });

  it('16 · driver abuses breaks: breaks cannot be ended early and are counted for the admin, nothing automatic', async () => {
    const d = await f.sharingDriver(at(3100));
    await request(t.server())
      .post('/v1/driver/sharing/break')
      .set(bearer(d))
      .send({ minutes: 30 })
      .expect(200);
    const early = await request(t.server())
      .post('/v1/driver/sharing/resume')
      .set(bearer(d))
      .send({ fix: fix(at(3100)) })
      .expect(409);
    expect(problem(early.body).code).toBe('BREAK_NOT_OVER');
    const detail = AdminSessionDetail.parse(
      (await request(t.server()).get(`/v1/admin/sessions/${d.sessionId}`).set(bearer(admin)).expect(200))
        .body,
    );
    expect(detail.breaksCount).toBe(1);
    expect(detail.events.map((e) => e.type)).toContain('BREAK_STARTED');
    expect(await flagsOf(d.userId)).toEqual([]);
  });

  it('17 · drivers argue over a passenger: they can report each other; only an admin decides', async () => {
    const a = await f.sharingDriver(at(3300));
    const b = await f.sharingDriver(at(3320));
    await report(a, { source: 'DRIVER_MARKER', sessionId: b.sessionId, category: 'HARASSMENT' }).expect(201);
    await report(b, { source: 'DRIVER_MARKER', sessionId: a.sessionId, category: 'HARASSMENT' }).expect(201);
    expect((await sharing(a)).session?.state).toBe('SHARING');
    expect((await sharing(b)).session?.state).toBe('SHARING');
    expect([...(await flagsOf(a.userId)), ...(await flagsOf(b.userId))]).toEqual([]);
  });
});
