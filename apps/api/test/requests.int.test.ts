import {
  CurrentRequest,
  type FixInput,
  PingsResponse,
  ProblemDetails,
  RequestHistory,
  SignInResponse,
} from '@fi-thnitek/contracts';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db/client.js';
import { importPlaces } from '../src/places/import-places.js';
import { RequestsService } from '../src/requests/requests.service.js';
import { TEST_TERMS_VERSION, type TestApp, startTestApp } from './test-app.js';

let t: TestApp;
let n = 0;
let sousse = '';

type Signed = SignInResponse & { pushToken: string; userId: string };

beforeAll(async () => {
  t = await startTestApp();
  await importPlaces(createDatabase(t.pool), [
    {
      source: 'test:sousse',
      kind: 'CITY',
      nameAr: 'سوسة',
      nameFr: 'Sousse',
      aliases: [],
      lat: 35.8256,
      lng: 10.6084,
      governorateCode: null,
      popularity: 90,
    },
  ]);
  const { rows } = await t.pool.query<{ id: string }>(`SELECT id FROM places WHERE source = 'test:sousse'`);
  sousse = rows[0]!.id;
});

afterAll(async () => {
  await t?.close();
});

const bearer = (s: SignInResponse) => ({ Authorization: `Bearer ${s.accessToken}` });
const problem = (body: unknown) => ProblemDetails.parse(body);
const pushesTo = (s: Signed, event: string) =>
  t.push.sent.filter((m) => m.tokens.includes(s.pushToken) && m.data.event === event).length;

async function signIn(): Promise<Signed> {
  const sub = `requests-${++n}`;
  const idToken = await t.googleToken({ sub, email: `${sub}@example.tn` });
  const res = await request(t.server()).post('/v1/auth/google').send({ idToken }).expect(200);
  const s = SignInResponse.parse(res.body);
  await request(t.server())
    .patch('/v1/me')
    .set(bearer(s))
    .send({ displayName: 'Amel', acceptTermsVersion: TEST_TERMS_VERSION })
    .expect(200);
  await request(t.server())
    .put('/v1/me/device')
    .set(bearer(s))
    .send({ installId: uuidv7(), platform: 'android', appVersion: '0.6.0', pushToken: `fcm-${sub}` })
    .expect(204);
  // Old enough for the 15-a-day limit unless a test makes it young.
  await t.pool.query(`UPDATE users SET created_at = now() - interval '10 days' WHERE id = $1`, [s.me.id]);
  return { ...s, pushToken: `fcm-${sub}`, userId: s.me.id };
}

async function verifiedDriver(): Promise<Signed> {
  const s = await signIn();
  await t.pool.query(
    `INSERT INTO driver_profiles (user_id, legal_first_name, legal_last_name, cin_hmac, cin_last4, cin_encrypted, transport_type, status)
     VALUES ($1, 'Sami', 'Ben Ali', $2, '1234', 'x', 'LOUAGE', 'VERIFIED')`,
    [s.userId, `hmac-${s.userId}`],
  );
  await t.pool.query(
    `INSERT INTO vehicles (id, driver_user_id, transport_type, plate_normalized, plate_display, seats)
     VALUES ($1, $2, 'LOUAGE', $3, '300 تونس 1234', 8)`,
    [uuidv7(), s.userId, `p-${s.userId}`],
  );
  return s;
}

/** A fix `agoS` seconds ago, `northM` metres north of a spot in Tunis. */
const fix = (agoS = 0, northM = 0, patch: Partial<FixInput> = {}): FixInput => ({
  ts: Date.now() - agoS * 1000,
  lat: 36.8 + northM / 111_195,
  lng: 10.18,
  accuracyM: 8,
  ...patch,
});

const destination = { point: { lat: 35.8256, lng: 10.6084 } };

const api = (s: SignInResponse) => ({
  post: (body: object = { destination: { ...destination, placeId: sousse }, types: ['LOUAGE'] }) =>
    request(t.server()).post('/v1/requests').set(bearer(s)).send(body),
  current: () => request(t.server()).get('/v1/requests/current').set(bearer(s)),
  cancel: () => request(t.server()).post('/v1/requests/current/cancel').set(bearer(s)),
  renew: () => request(t.server()).post('/v1/requests/current/renew').set(bearer(s)),
  history: () => request(t.server()).get('/v1/requests/history').set(bearer(s)),
  pings: (fixes: FixInput[], locationServicesOn = true) =>
    request(t.server()).post('/v1/location/pings').set(bearer(s)).send({ fixes, locationServicesOn }),
});

const currentOf = (body: unknown) => CurrentRequest.parse(body);
const pingsOf = (body: unknown) => PingsResponse.parse(body);

async function requestRow(userId: string) {
  const { rows } = await t.pool.query(
    `SELECT * FROM passenger_requests WHERE passenger_user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  return rows[0] as Record<string, unknown>;
}

describe('posting a request (R-030, R-031, R-041, invariants 1–3)', () => {
  it('is anonymous by default and hidden until anchored', async () => {
    const p = await signIn();
    const res = currentOf((await api(p).post().expect(201)).body);
    expect(res.request).toMatchObject({
      status: 'OPEN',
      types: ['LOUAGE'],
      seats: 1,
      showIdentity: false,
      anchored: false,
      renewalsLeft: 3,
      destination: { place: { nameFr: 'Sousse' } },
    });
    expect(res.tracking).toEqual({ intervalS: 5, distanceFilterM: 3, bufferMaxMin: 5 });
  });

  it('allows a single open request', async () => {
    const p = await signIn();
    await api(p).post().expect(201);
    expect(problem((await api(p).post().expect(409)).body).code).toBe('REQUEST_ALREADY_OPEN');
  });

  it('never accepts a bus request', async () => {
    const p = await signIn();
    expect(
      problem(
        (
          await api(p)
            .post({ destination, types: ['BUS'] })
            .expect(400)
        ).body,
      ).code,
    ).toBe('VALIDATION_FAILED');
  });

  it('refuses verified driver accounts', async () => {
    const d = await verifiedDriver();
    expect(problem((await api(d).post().expect(403)).body)).toMatchObject({
      code: 'REQUEST_NOT_ALLOWED',
      detail: 'DRIVER_ACCOUNT',
    });
  });

  it('limits young accounts to 5 requests a day (R-040)', async () => {
    const p = await signIn();
    await t.pool.query(`UPDATE users SET created_at = now() WHERE id = $1`, [p.userId]);
    for (let i = 0; i < 5; i += 1) {
      await api(p).post().expect(201);
      await api(p).cancel().expect(200);
    }
    expect(problem((await api(p).post().expect(429)).body).code).toBe('REQUEST_LIMIT');
    expect(currentOf((await api(p).current().expect(200)).body).blockers).toEqual(['DAILY_LIMIT']);
  });
});

describe('pings and the 20 m rule (R-033, R-034)', () => {
  it('anchors on the first accurate fix, ignores drift, then closes after moving away twice ≥ 10 s apart', async () => {
    const p = await signIn();
    await api(p).post().expect(201);
    expect(
      pingsOf(
        (
          await api(p)
            .pings([fix(60, 0, { accuracyM: 70 }), fix(55, 1)])
            .expect(200)
        ).body,
      ).stop,
    ).toBe(false);
    expect(currentOf((await api(p).current().expect(200)).body).request?.anchored).toBe(true);

    const drift = [fix(50, 140, { accuracyM: 60 }), fix(45, -90, { accuracyM: 80 }), fix(40, 35)];
    expect(pingsOf((await api(p).pings(drift).expect(200)).body).stop).toBe(false);

    const closed = pingsOf(
      (
        await api(p)
          .pings([fix(25, 40), fix(15, 45)])
          .expect(200)
      ).body,
    );
    expect(closed).toEqual({ stop: true, reason: 'MOVED_AWAY', cooldownUntil: null });
    const after = currentOf((await api(p).current().expect(200)).body);
    expect(after.request).toBeNull();
    expect(after.lastClosed?.status).toBe('MOVED_AWAY');
    expect(pushesTo(p, 'REQUEST_CLOSED')).toBe(1);

    // Pings after closure: stop, nothing stored.
    expect(
      pingsOf(
        (
          await api(p)
            .pings([fix(0, 500)])
            .expect(200)
        ).body,
      ),
    ).toMatchObject({ stop: true, reason: 'MOVED_AWAY' });
    expect((await requestRow(p.userId)).last_lat).not.toBeCloseTo(36.8 + 500 / 111_195, 5);
  });

  it('closes on a mock location with an admin flag', async () => {
    const p = await signIn();
    await api(p).post().expect(201);
    await api(p)
      .pings([fix(10)])
      .expect(200);
    expect(
      pingsOf(
        (
          await api(p)
            .pings([fix(0, 0, { isMock: true })])
            .expect(200)
        ).body,
      ).reason,
    ).toBe('REMOVED');
    const { rows } = await t.pool.query<{ type: string; request_id: string }>(
      `SELECT type, request_id FROM risk_flags WHERE user_id = $1`,
      [p.userId],
    );
    expect(rows).toEqual([{ type: 'MOCK_LOCATION', request_id: (await requestRow(p.userId)).id }]);
  });

  it('closes when location services are switched off', async () => {
    const p = await signIn();
    await api(p).post().expect(201);
    expect(
      pingsOf(
        (
          await api(p)
            .pings([fix(0)], false)
            .expect(200)
        ).body,
      ).reason,
    ).toBe('LOCATION_LOST');
  });
});

describe('silent pick-up records (R-039, invariant 10)', () => {
  it('records sharing drivers within 50 m of the anchor, never shown to the passenger', async () => {
    const d = await verifiedDriver();
    await request(t.server())
      .post('/v1/driver/sharing/start')
      .set(bearer(d))
      .send({ fix: fix(20, 15) })
      .expect(200);
    const far = await verifiedDriver();
    await request(t.server())
      .post('/v1/driver/sharing/start')
      .set(bearer(far))
      .send({ fix: fix(20, 900) })
      .expect(200);

    const p = await signIn();
    await api(p).post().expect(201);
    await api(p)
      .pings([fix(30, 0)])
      .expect(200);
    await api(p)
      .pings([fix(20, 40), fix(5, 45)])
      .expect(200);

    const { rows } = await t.pool.query<{ driver_user_id: string; min_distance_m: number }>(
      `SELECT driver_user_id, min_distance_m FROM pickup_records`,
    );
    expect(rows).toEqual([{ driver_user_id: d.userId, min_distance_m: 15 }]);

    const exposed = JSON.stringify([
      (await api(p).current().expect(200)).body,
      (await api(p).history().expect(200)).body,
    ]);
    expect(exposed).not.toContain(d.userId);
    expect(exposed).not.toMatch(/pickup|Sami/i);
  });
});

describe('sweep (R-033, R-035, R-036)', () => {
  const sweep = () => t.app.get(RequestsService).sweep();

  it('closes without an accurate fix after 60 s (NO_GPS_FIX)', async () => {
    const p = await signIn();
    await api(p).post().expect(201);
    await t.pool.query(
      `UPDATE passenger_requests SET created_at = now() - interval '61 seconds' WHERE passenger_user_id = $1`,
      [p.userId],
    );
    await sweep();
    expect((await requestRow(p.userId)).status).toBe('NO_GPS_FIX');
  });

  it('closes after 5 minutes without location (LOCATION_LOST)', async () => {
    const p = await signIn();
    await api(p).post().expect(201);
    await api(p)
      .pings([fix(0)])
      .expect(200);
    await t.pool.query(
      `UPDATE passenger_requests SET last_ping_at = now() - interval '301 seconds' WHERE passenger_user_id = $1`,
      [p.userId],
    );
    await sweep();
    expect((await requestRow(p.userId)).status).toBe('LOCATION_LOST');
  });

  it('asks to renew 10 minutes before expiry, once, then expires', async () => {
    const p = await signIn();
    await api(p).post().expect(201);
    await api(p)
      .pings([fix(0)])
      .expect(200);
    await t.pool.query(
      `UPDATE passenger_requests SET expires_at = now() + interval '9 minutes' WHERE passenger_user_id = $1`,
      [p.userId],
    );
    await sweep();
    await sweep();
    expect(pushesTo(p, 'REQUEST_EXPIRING')).toBe(1);
    await t.pool.query(
      `UPDATE passenger_requests SET expires_at = now() - interval '1 second' WHERE passenger_user_id = $1`,
      [p.userId],
    );
    await sweep();
    expect((await requestRow(p.userId)).status).toBe('EXPIRED');
  });
});

describe('renew and cancel (R-036, R-037)', () => {
  it('renews three times by 60 minutes each, then refuses', async () => {
    const p = await signIn();
    const first = currentOf((await api(p).post().expect(201)).body).request!;
    const renewed = currentOf((await api(p).renew().expect(200)).body).request!;
    expect(new Date(renewed.expiresAt).getTime() - new Date(first.expiresAt).getTime()).toBe(3_600_000);
    expect(renewed.renewalsLeft).toBe(2);
    await api(p).renew().expect(200);
    await api(p).renew().expect(200);
    expect(problem((await api(p).renew().expect(409)).body).code).toBe('RENEW_NOT_ALLOWED');
  });

  it('cancels, then has nothing left to cancel', async () => {
    const p = await signIn();
    await api(p).post().expect(201);
    expect(currentOf((await api(p).cancel().expect(200)).body).lastClosed?.status).toBe('CANCELLED');
    expect(problem((await api(p).cancel().expect(409)).body).code).toBe('NO_OPEN_REQUEST');
    expect(pushesTo(p, 'REQUEST_CLOSED')).toBe(0);
  });
});

describe('history (R-042)', () => {
  it('lists the passenger’s own requests of the last 30 days', async () => {
    const p = await signIn();
    await api(p).post().expect(201);
    await api(p).cancel().expect(200);
    await api(p)
      .post({ destination, types: ['TAXI', 'LOUAGE'], showIdentity: true, note: 'Valise' })
      .expect(201);
    const history = RequestHistory.parse((await api(p).history().expect(200)).body);
    expect(history.requests.map((r) => r.status)).toEqual(['OPEN', 'CANCELLED']);
    expect(history.requests[1]?.destination?.nameFr).toBe('Sousse');
  });
});
