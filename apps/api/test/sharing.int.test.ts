import {
  AdminSessionDetail,
  AdminSessionList,
  type FixInput,
  MapView,
  PingsResponse,
  ProblemDetails,
  SharingStatus,
  SignInResponse,
} from '@fi-thnitek/contracts';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SharingService } from '../src/sharing/sharing.service.js';
import { TEST_ADMIN_EMAIL, TEST_TERMS_VERSION, type TestApp, startTestApp } from './test-app.js';

let t: TestApp;
let admin: SignInResponse;
let n = 0;

beforeAll(async () => {
  t = await startTestApp();
  admin = await signIn('admin-sharing', TEST_ADMIN_EMAIL);
});

afterAll(async () => {
  await t?.close();
});

const bearer = (s: SignInResponse) => ({ Authorization: `Bearer ${s.accessToken}` });
const problem = (body: unknown) => ProblemDetails.parse(body);
const HOUR = 3_600_000;

type Signed = SignInResponse & { pushToken: string };

async function signIn(sub = `sharing-${++n}`, email = `${sub}@example.tn`): Promise<Signed> {
  const idToken = await t.googleToken({ sub, email });
  const res = await request(t.server()).post('/v1/auth/google').send({ idToken }).expect(200);
  const s = SignInResponse.parse(res.body);
  await request(t.server())
    .patch('/v1/me')
    .set(bearer(s))
    .send({ displayName: 'Sami', acceptTermsVersion: TEST_TERMS_VERSION })
    .expect(200);
  await request(t.server())
    .put('/v1/me/device')
    .set(bearer(s))
    .send({ installId: uuidv7(), platform: 'android', appVersion: '0.5.0', pushToken: `fcm-${sub}` })
    .expect(204);
  return { ...s, pushToken: `fcm-${sub}` };
}

const pushesTo = (s: Signed, event: string) =>
  t.push.sent.filter((m) => m.tokens.includes(s.pushToken) && m.data.event === event).length;

/** A VERIFIED driver with a vehicle, written directly (the verification flow has its own suite). */
async function verifiedDriver(type: 'TAXI' | 'LOUAGE' | 'BUS' = 'LOUAGE') {
  const s = await signIn();
  const userId = s.me.id;
  await t.pool.query(
    `INSERT INTO driver_profiles (user_id, legal_first_name, legal_last_name, cin_hmac, cin_last4, cin_encrypted, transport_type, status)
     VALUES ($1, 'Samir', 'Ben Ali', $2, '1234', 'x', $3, 'VERIFIED')`,
    [userId, `hmac-${userId}`, type],
  );
  await t.pool.query(
    `INSERT INTO vehicles (id, driver_user_id, transport_type, plate_normalized, plate_display, seats)
     VALUES ($1, $2, $3, $4, $5, 8)`,
    [uuidv7(), userId, type, `p-${userId}`, `${100 + n} تونس 4567`],
  );
  return { ...s, userId };
}

/** A fix `agoS` seconds ago, `northM` metres north of a fixed point in Tunis. */
const fix = (agoS = 0, northM = 0, patch: Partial<FixInput> = {}): FixInput => ({
  ts: Date.now() - agoS * 1000,
  lat: 36.8 + northM / 111_195,
  lng: 10.18,
  accuracyM: 6,
  ...patch,
});

const api = (s: SignInResponse) => ({
  status: () => request(t.server()).get('/v1/driver/sharing').set(bearer(s)),
  start: (body: object = { fix: fix() }) =>
    request(t.server()).post('/v1/driver/sharing/start').set(bearer(s)).send(body),
  full: (isFull: boolean) =>
    request(t.server()).post('/v1/driver/sharing/full').set(bearer(s)).send({ isFull }),
  breakFor: (minutes: number) =>
    request(t.server()).post('/v1/driver/sharing/break').set(bearer(s)).send({ minutes }),
  resume: () => request(t.server()).post('/v1/driver/sharing/resume').set(bearer(s)).send({ fix: fix() }),
  stop: () => request(t.server()).post('/v1/driver/sharing/stop').set(bearer(s)),
  stillWorking: () => request(t.server()).post('/v1/driver/sharing/still-working').set(bearer(s)),
  pings: (fixes: FixInput[], locationServicesOn = true) =>
    request(t.server()).post('/v1/location/pings').set(bearer(s)).send({ fixes, locationServicesOn }),
  map: (bbox = { south: 36.75, west: 10.1, north: 36.85, east: 10.25 }) =>
    request(t.server()).post('/v1/map').set(bearer(s)).send({ bbox }),
});

const statusOf = (body: unknown) => SharingStatus.parse(body);
const pingsOf = (body: unknown) => PingsResponse.parse(body);

async function sessionRow(userId: string) {
  const { rows } = await t.pool.query(
    `SELECT * FROM sharing_sessions WHERE driver_user_id = $1 ORDER BY started_at DESC LIMIT 1`,
    [userId],
  );
  return rows[0] as Record<string, unknown>;
}

async function liveRows(userId: string) {
  const { rows } = await t.pool.query(`SELECT * FROM driver_live_locations WHERE driver_user_id = $1`, [
    userId,
  ]);
  return rows as { recent_fixes: unknown[]; lat: number }[];
}

/** Moves the stored latest fix `seconds` into the past (the start fix itself must be fresh). */
async function backdateLatest(userId: string, seconds: number) {
  await t.pool.query(
    `UPDATE driver_live_locations SET fix_ts = now() - make_interval(secs => $2), recent_fixes = '[]' WHERE driver_user_id = $1`,
    [userId, seconds],
  );
  await t.pool.query(
    `UPDATE sharing_sessions SET last_fix_at = now() - make_interval(secs => $2) WHERE driver_user_id = $1 AND ended_at IS NULL`,
    [userId, seconds],
  );
}

async function cooldownOf(userId: string): Promise<Date | null> {
  const { rows } = await t.pool.query<{ cooldown_until: Date | null }>(
    `SELECT cooldown_until FROM driver_profiles WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.cooldown_until ?? null;
}

describe('start sharing (R-050)', () => {
  it('is unavailable to a passenger account and explains why', async () => {
    const passenger = await signIn();
    const status = statusOf((await api(passenger).status().expect(200)).body);
    expect(status.session).toBeNull();
    expect(status.blockers).toEqual(['NOT_VERIFIED', 'NO_VEHICLE']);
    const res = await api(passenger).start().expect(403);
    expect(problem(res.body).code).toBe('SHARING_NOT_ALLOWED');
  });

  it('needs a fresh, real fix', async () => {
    const d = await verifiedDriver();
    expect(
      problem(
        (
          await api(d)
            .start({ fix: fix(180) })
            .expect(422)
        ).body,
      ),
    ).toMatchObject({
      code: 'FIX_REJECTED',
      detail: 'FIX_STALE',
    });
    expect(
      problem(
        (
          await api(d)
            .start({ fix: fix(0, 0, { isMock: true }) })
            .expect(422)
        ).body,
      ).detail,
    ).toBe('FIX_MOCKED');
  });

  it('starts once, stores the start fix as the latest point, and refuses a second start', async () => {
    const d = await verifiedDriver('BUS');
    const status = statusOf((await api(d).start({ fix: fix(), lineLabel: 'L20' }).expect(200)).body);
    expect(status.session).toMatchObject({
      state: 'SHARING',
      transportType: 'BUS',
      isFull: false,
      fresh: true,
      lineLabel: 'L20',
      stillWorkingPending: false,
    });
    expect(status.tracking).toEqual({
      movingIntervalS: 10,
      stationaryIntervalS: 30,
      distanceFilterM: 10,
      bufferMaxMin: 60,
    });
    expect(await liveRows(d.userId)).toHaveLength(1);
    expect(problem((await api(d).start().expect(409)).body).code).toBe('ALREADY_SHARING');
  });

  it('ignores the bus line for taxis and louages', async () => {
    const d = await verifiedDriver('TAXI');
    const status = statusOf((await api(d).start({ fix: fix(), lineLabel: 'L20' }).expect(200)).body);
    expect(status.session?.lineLabel).toBeNull();
  });
});

describe('Full (R-054)', () => {
  it('toggles without any penalty and logs the change', async () => {
    const d = await verifiedDriver();
    await api(d).start().expect(200);
    expect(statusOf((await api(d).full(true).expect(200)).body).session?.isFull).toBe(true);
    expect(statusOf((await api(d).full(false).expect(200)).body).session?.isFull).toBe(false);
    await api(d).stop().expect(200);
    const session = await sessionRow(d.userId);
    const { rows } = await t.pool.query<{ type: string }>(
      `SELECT type FROM session_events WHERE session_id = $1 ORDER BY at, id`,
      [session.id],
    );
    expect(rows.map((r) => r.type)).toEqual(['STARTED', 'FULL_ON', 'FULL_OFF', 'ENDED']);
  });
});

describe('location pings (docs/architecture.md §4.2)', () => {
  it('stores only the latest point and a 2-minute window (no history)', async () => {
    const d = await verifiedDriver();
    await api(d)
      .start({ fix: fix(100) })
      .expect(200);
    const batch = Array.from({ length: 10 }, (_, i) => fix(90 - i * 10, (i + 1) * 80));
    expect(pingsOf((await api(d).pings(batch).expect(200)).body)).toEqual({
      stop: false,
      reason: null,
      cooldownUntil: null,
    });
    const rows = await liveRows(d.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lat).toBeCloseTo(batch.at(-1)!.lat, 6);
    expect(rows[0]!.recent_fixes.length).toBeLessThanOrEqual(13);
    // A resent batch changes nothing.
    expect(pingsOf((await api(d).pings(batch).expect(200)).body).stop).toBe(false);
    expect(await liveRows(d.userId)).toHaveLength(1);
  });

  it('answers stop:true and stores nothing outside an active mode', async () => {
    const passenger = await signIn();
    expect(pingsOf((await api(passenger).pings([fix()]).expect(200)).body)).toEqual({
      stop: true,
      reason: 'NOT_SHARING',
      cooldownUntil: null,
    });
    expect(await liveRows(passenger.me.id)).toHaveLength(0);
  });

  it('ends the session for an uncovered gap, with the cooldown counted from the last good fix (R-057)', async () => {
    const d = await verifiedDriver();
    await api(d).start().expect(200);
    await backdateLatest(d.userId, 600);
    const res = pingsOf(
      (
        await api(d)
          .pings([fix(590), fix(10)])
          .expect(200)
      ).body,
    );
    expect(res.stop).toBe(true);
    expect(res.reason).toBe('PING_GAP');
    const expected = Date.now() - 590_000 + HOUR;
    expect(Math.abs(new Date(res.cooldownUntil!).getTime() - expected)).toBeLessThan(5_000);
    expect(await liveRows(d.userId)).toHaveLength(0);
    expect(await sessionRow(d.userId)).toMatchObject({
      state: 'ENDED',
      end_reason: 'PING_GAP',
      cooldown_applied: true,
    });

    // No restart during the cooldown; later pings keep telling the phone why.
    expect(problem((await api(d).start().expect(409)).body).code).toBe('COOLDOWN_ACTIVE');
    const status = statusOf((await api(d).status().expect(200)).body);
    expect(status.blockers).toEqual(['COOLDOWN']);
    expect(status.lastEnded?.reason).toBe('PING_GAP');
    expect(pingsOf((await api(d).pings([fix()]).expect(200)).body)).toMatchObject({
      stop: true,
      reason: 'PING_GAP',
    });
    expect(pushesTo(d, 'SHARING_ENDED')).toBe(1);
  });

  it('keeps a session whose outage was covered by buffered fixes', async () => {
    const d = await verifiedDriver();
    await api(d).start().expect(200);
    await backdateLatest(d.userId, 400);
    const buffered = Array.from({ length: 39 }, (_, i) => fix(390 - i * 10, i * 50));
    expect(pingsOf((await api(d).pings(buffered).expect(200)).body).stop).toBe(false);
    expect(statusOf((await api(d).status().expect(200)).body).session?.state).toBe('SHARING');
  });

  it('ends on a mock location with a cooldown and an admin flag without coordinates (R-059)', async () => {
    const d = await verifiedDriver();
    await api(d).start().expect(200);
    const res = pingsOf(
      (
        await api(d)
          .pings([fix(0, 5, { ts: Date.now() + 1000, isMock: true })])
          .expect(200)
      ).body,
    );
    expect(res).toMatchObject({ stop: true, reason: 'SPOOF_SUSPECTED' });
    expect(res.cooldownUntil).not.toBeNull();
    const { rows } = await t.pool.query<{ type: string; evidence: unknown }>(
      `SELECT type, evidence FROM risk_flags WHERE user_id = $1`,
      [d.userId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe('MOCK_LOCATION');
    expect(JSON.stringify(rows[0]!.evidence)).not.toMatch(/lat|lng/);
  });

  it('ends on an impossible jump', async () => {
    const d = await verifiedDriver();
    await api(d)
      .start({ fix: fix(20) })
      .expect(200);
    const res = pingsOf(
      (
        await api(d)
          .pings([fix(10, 5000)])
          .expect(200)
      ).body,
    );
    expect(res.reason).toBe('SPOOF_SUSPECTED');
    const { rows } = await t.pool.query<{ type: string }>(`SELECT type FROM risk_flags WHERE user_id = $1`, [
      d.userId,
    ]);
    expect(rows.map((r) => r.type)).toEqual(['IMPOSSIBLE_JUMP']);
  });

  it('ends when location services are switched off', async () => {
    const d = await verifiedDriver();
    await api(d)
      .start({ fix: fix(10) })
      .expect(200);
    expect(
      pingsOf(
        (
          await api(d)
            .pings([fix(0)], false)
            .expect(200)
        ).body,
      ).reason,
    ).toBe('LOCATION_OFF');
    expect(await cooldownOf(d.userId)).not.toBeNull();
  });
});

describe('breaks (R-055)', () => {
  it('freezes the driver where the break began, takes no location, and can be ended early (ADR-227)', async () => {
    const d = await verifiedDriver();
    await api(d).start().expect(200);
    await api(d).full(true).expect(200);
    expect(problem((await api(d).breakFor(45).expect(400)).body).code).toBe('VALIDATION_FAILED');

    const status = statusOf((await api(d).breakFor(30).expect(200)).body);
    expect(status.session).toMatchObject({ state: 'ON_BREAK', fresh: false });
    expect(new Date(status.session!.breakUntil!).getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
    // The frozen point stays (for the map); the 2-minute window is cleared.
    const frozen = await liveRows(d.userId);
    expect(frozen).toHaveLength(1);
    expect(frozen[0]!.recent_fixes).toEqual([]);

    expect(
      pingsOf(
        (
          await api(d)
            .pings([fix(0, 300)])
            .expect(200)
        ).body,
      ),
    ).toEqual({
      stop: true,
      reason: 'ON_BREAK',
      cooldownUntil: null,
    });
    expect((await liveRows(d.userId))[0]!.lat).toBe(frozen[0]!.lat);
    expect(problem((await api(d).full(false).expect(409)).body).code).toBe('INVALID_STATE_TRANSITION');

    // Resume at any time, well before the end.
    const resumed = statusOf((await api(d).resume().expect(200)).body);
    expect(resumed.session).toMatchObject({ state: 'SHARING', fresh: true, breakUntil: null });
    expect(await cooldownOf(d.userId)).toBeNull();
  });

  it('resumes by itself when the break time is over, without cooldown (ADR-227)', async () => {
    const d = await verifiedDriver();
    await api(d).start().expect(200);
    await api(d).breakFor(60).expect(200);
    await t.pool.query(
      `UPDATE sharing_sessions SET break_until = now() - interval '1 minute' WHERE driver_user_id = $1 AND ended_at IS NULL`,
      [d.userId],
    );
    await t.app.get(SharingService).sweep();
    const status = statusOf((await api(d).status().expect(200)).body);
    expect(status.session).toMatchObject({ state: 'SHARING', breakUntil: null, fresh: false });
    expect(pushesTo(d, 'BREAK_OVER')).toBe(1);
    expect(await cooldownOf(d.userId)).toBeNull();
    // The phone's next fix is taken as a fresh start (no gap counted over the break).
    expect(pingsOf((await api(d).pings([fix()]).expect(200)).body).stop).toBe(false);
    expect(statusOf((await api(d).status().expect(200)).body).session).toMatchObject({ fresh: true });
  });
});

describe('stop (R-056) and the admin cooldown clear', () => {
  it('applies a 1 h cooldown that only an admin can clear (audited)', async () => {
    const d = await verifiedDriver();
    await api(d).start().expect(200);
    const stopped = statusOf((await api(d).stop().expect(200)).body);
    expect(stopped.session).toBeNull();
    expect(stopped.lastEnded?.reason).toBe('MANUAL_STOP');
    expect(new Date(stopped.cooldownUntil!).getTime() - Date.now()).toBeGreaterThan(59 * 60_000);
    expect(problem((await api(d).stop().expect(409)).body).code).toBe('NOT_SHARING');

    await request(t.server()).post(`/v1/admin/drivers/${d.userId}/clear-cooldown`).set(bearer(d)).expect(403);
    await request(t.server())
      .post(`/v1/admin/drivers/${d.userId}/clear-cooldown`)
      .set(bearer(admin))
      .expect(204);
    await api(d).start().expect(200);
    const { rows } = await t.pool.query(
      `SELECT action FROM audit.audit_logs WHERE target_id = $1 AND action = 'driver.cooldown.clear'`,
      [d.userId],
    );
    expect(rows).toHaveLength(1);
  });
});

describe('sweep (every 30 s)', () => {
  const sweep = (now?: Date) => t.app.get(SharingService).sweep(now);

  it('ends a session silent for longer than the offline buffer, from the last good fix', async () => {
    const d = await verifiedDriver();
    await api(d).start().expect(200);
    await t.pool.query(
      `UPDATE sharing_sessions SET last_fix_at = now() - interval '61 minutes' WHERE driver_user_id = $1 AND ended_at IS NULL`,
      [d.userId],
    );
    await sweep();
    // The driver has been off the map for an hour already: the cooldown is over.
    expect(await sessionRow(d.userId)).toMatchObject({ end_reason: 'PING_GAP', cooldown_applied: false });
    await api(d).start().expect(200);
  });

  it('reminds once when a break is over', async () => {
    const d = await verifiedDriver();
    await api(d).start().expect(200);
    await api(d).breakFor(30).expect(200);
    await t.pool.query(
      `UPDATE sharing_sessions SET break_until = now() - interval '1 minute' WHERE driver_user_id = $1 AND ended_at IS NULL`,
      [d.userId],
    );
    await sweep();
    await sweep();
    expect(pushesTo(d, 'BREAK_OVER')).toBe(1);
  });

  it('asks "Still working?" after 12 h and ends unanswered sessions without cooldown (R-058)', async () => {
    const d = await verifiedDriver();
    await api(d).start().expect(200);
    await t.pool.query(
      `UPDATE sharing_sessions SET started_at = now() - interval '12 hours 1 minute' WHERE driver_user_id = $1 AND ended_at IS NULL`,
      [d.userId],
    );
    await sweep();
    expect(pushesTo(d, 'STILL_WORKING')).toBe(1);
    expect(statusOf((await api(d).status().expect(200)).body).session?.stillWorkingPending).toBe(true);
    expect(statusOf((await api(d).stillWorking().expect(200)).body).session?.stillWorkingPending).toBe(false);

    const other = await verifiedDriver();
    await api(other).start().expect(200);
    await t.pool.query(
      `UPDATE sharing_sessions SET started_at = now() - interval '12 hours 11 minutes',
         still_working_prompted_at = now() - interval '11 minutes' WHERE driver_user_id = $1 AND ended_at IS NULL`,
      [other.userId],
    );
    await sweep();
    expect(await sessionRow(other.userId)).toMatchObject({
      end_reason: 'MAX_DURATION',
      cooldown_applied: false,
    });
    expect(await cooldownOf(other.userId)).toBeNull();
  });

  it('ends the session of a driver suspended meanwhile, without cooldown', async () => {
    const d = await verifiedDriver();
    await api(d).start().expect(200);
    await t.pool.query(`UPDATE driver_profiles SET status = 'SUSPENDED' WHERE user_id = $1`, [d.userId]);
    await sweep();
    expect(await sessionRow(d.userId)).toMatchObject({ end_reason: 'SUSPENDED', cooldown_applied: false });
  });
});

describe('live map drivers (R-022, R-026, invariant 4)', () => {
  it('shows sharing drivers with their name to passengers, and drivers on a break frozen and marked', async () => {
    const d = await verifiedDriver('LOUAGE');
    const id = statusOf((await api(d).start().expect(200)).body).session!.id;
    await api(d).full(true).expect(200);
    const passenger = await signIn();
    const seen = MapView.parse((await api(passenger).map().expect(200)).body);
    const marker = seen.drivers.find((m) => m.id === id);
    expect(marker).toMatchObject({ type: 'LOUAGE', isFull: true, lineLabel: null });
    expect(marker?.name).toBe('Sami');
    expect(Object.keys(marker!)).not.toContain('userId');

    await api(d).breakFor(30).expect(200);
    const after = MapView.parse((await api(passenger).map().expect(200)).body);
    const onBreak = after.drivers.find((m) => m.id === marker!.id);
    expect(onBreak).toMatchObject({ onBreak: true, lat: marker!.lat, lng: marker!.lng });
    expect(new Date(onBreak!.breakUntil!).getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses the map to a driver account that is not sharing (403 SHARING_REQUIRED)', async () => {
    const d = await verifiedDriver();
    expect(problem((await api(d).map().expect(403)).body).code).toBe('SHARING_REQUIRED');
    await api(d).start().expect(200);
    const seen = MapView.parse((await api(d).map().expect(200)).body);
    const own = statusOf((await api(d).status().expect(200)).body).session!.id;
    expect(seen.drivers.map((m) => m.id)).not.toContain(own);
    await api(d).breakFor(30).expect(200);
    expect(problem((await api(d).map().expect(403)).body).code).toBe('SHARING_REQUIRED');
  });

  it('asks to zoom in beyond the span limit and keeps coordinates out of the URL', async () => {
    const passenger = await signIn();
    const wide = MapView.parse(
      (await api(passenger).map({ south: 35, west: 9, north: 37, east: 11 }).expect(200)).body,
    );
    expect(wide).toMatchObject({ clustered: true, drivers: [], passengers: [] });
    await request(t.server()).get('/v1/map?south=36').set(bearer(passenger)).expect(404);
  });
});

describe('admin sessions', () => {
  it('lists sessions with their events, ends one without cooldown, and is admin-only', async () => {
    const d = await verifiedDriver();
    await api(d).start().expect(200);
    const id = statusOf((await api(d).status().expect(200)).body).session!.id;

    await request(t.server()).get('/v1/admin/sessions').set(bearer(d)).expect(403);
    const list = AdminSessionList.parse(
      (
        await request(t.server())
          .get(`/v1/admin/sessions?active=true&driverUserId=${d.userId}`)
          .set(bearer(admin))
          .expect(200)
      ).body,
    );
    expect(list.sessions.map((s) => s.id)).toEqual([id]);
    expect(list.sessions[0]).toMatchObject({ driverName: 'Samir Ben Ali', state: 'SHARING' });

    const ended = AdminSessionDetail.parse(
      (await request(t.server()).post(`/v1/admin/sessions/${id}/end`).set(bearer(admin)).expect(200)).body,
    );
    expect(ended).toMatchObject({ state: 'ENDED', endReason: 'ADMIN', cooldownApplied: false });
    expect(ended.events.map((e) => e.type)).toEqual(['STARTED', 'ENDED']);
    expect(JSON.stringify(ended)).not.toMatch(/"lat"|"lng"/);
    await request(t.server()).post(`/v1/admin/sessions/${id}/end`).set(bearer(admin)).expect(409);
  });
});
