import {
  type FixInput,
  FinderResponse,
  MapView,
  ProblemDetails,
  SignInResponse,
} from '@fi-thnitek/contracts';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db/client.js';
import { importPlaces } from '../src/places/import-places.js';
import { TEST_TERMS_VERSION, type TestApp, startTestApp } from './test-app.js';

let t: TestApp;
let n = 0;
const place: Record<'tunis' | 'sousse', string> = { tunis: '', sousse: '' };

type Signed = SignInResponse & { userId: string };

const TUNIS = { lat: 36.8065, lng: 10.1815 };
const SOUSSE = { lat: 35.8256, lng: 10.6084 };
/** A point `northM` metres north and `eastM` east of central Tunis. */
const at = (northM: number, eastM = 0) => ({
  lat: TUNIS.lat + northM / 111_195,
  lng: TUNIS.lng + eastM / 89_000,
});
const CITY = { south: 36.75, west: 10.1, north: 36.86, east: 10.26 };

beforeAll(async () => {
  t = await startTestApp();
  const city = (source: string, nameFr: string, nameAr: string, p: { lat: number; lng: number }) => ({
    source,
    kind: 'CITY' as const,
    nameAr,
    nameFr,
    aliases: [],
    ...p,
    governorateCode: null,
    popularity: 90,
  });
  await importPlaces(createDatabase(t.pool), [
    city('test:tunis', 'Tunis', 'تونس', TUNIS),
    city('test:sousse', 'Sousse', 'سوسة', SOUSSE),
  ]);
  const { rows } = await t.pool.query<{ id: string; source: string }>(
    `SELECT id, source FROM places WHERE source LIKE 'test:%'`,
  );
  for (const r of rows) place[r.source.slice(5) as keyof typeof place] = r.id;
});

afterAll(async () => {
  await t?.close();
});

const bearer = (s: SignInResponse) => ({ Authorization: `Bearer ${s.accessToken}` });

async function signIn(name = 'Marwen'): Promise<Signed> {
  const sub = `map-${++n}`;
  const idToken = await t.googleToken({ sub, email: `${sub}@example.tn` });
  const s = SignInResponse.parse(
    (await request(t.server()).post('/v1/auth/google').send({ idToken }).expect(200)).body,
  );
  await request(t.server())
    .patch('/v1/me')
    .set(bearer(s))
    .send({ displayName: name, acceptTermsVersion: TEST_TERMS_VERSION })
    .expect(200);
  await t.pool.query(`UPDATE users SET created_at = now() - interval '10 days' WHERE id = $1`, [s.me.id]);
  return { ...s, userId: s.me.id };
}

const fix = (p: { lat: number; lng: number }, agoS = 0): FixInput => ({
  ts: Date.now() - agoS * 1000,
  ...p,
  accuracyM: 6,
});

async function sharingDriver(
  type: 'TAXI' | 'LOUAGE' | 'BUS',
  p: { lat: number; lng: number },
  extra: object = {},
) {
  const s = await signIn('Sami');
  await t.pool.query(
    `INSERT INTO driver_profiles (user_id, legal_first_name, legal_last_name, cin_hmac, cin_last4, cin_encrypted, transport_type, status)
     VALUES ($1, 'Sami', 'Ben Ali', $2, '1234', 'x', $3, 'VERIFIED')`,
    [s.userId, `hmac-${s.userId}`, type],
  );
  await t.pool.query(
    `INSERT INTO vehicles (id, driver_user_id, transport_type, plate_normalized, plate_display, seats) VALUES ($1, $2, $3, $4, $5, 8)`,
    [uuidv7(), s.userId, type, `p-${s.userId}`, `${n} تونس 1234`],
  );
  await request(t.server())
    .post('/v1/driver/sharing/start')
    .set(bearer(s))
    .send({ fix: fix(p), ...extra })
    .expect(200);
  return s;
}

/** A passenger with an OPEN request anchored at `p`. */
async function waitingPassenger(p: { lat: number; lng: number }, body: object) {
  const s = await signIn('Marwen');
  await request(t.server())
    .post('/v1/requests')
    .set(bearer(s))
    .send({ destination: { point: SOUSSE, placeId: place.sousse }, ...body })
    .expect(201);
  await request(t.server())
    .post('/v1/location/pings')
    .set(bearer(s))
    .send({ fixes: [fix(p)], locationServicesOn: true })
    .expect(200);
  return s;
}

const map = async (s: SignInResponse, bbox = CITY) =>
  MapView.parse((await request(t.server()).post('/v1/map').set(bearer(s)).send({ bbox }).expect(200)).body);

let louageRequest: Signed;
let taxiRequest: Signed;
let louageDriver: Signed;

describe('per-viewer passenger serialisation (R-023, R-024, invariant 6)', () => {
  beforeAll(async () => {
    louageRequest = await waitingPassenger(at(0), { types: ['LOUAGE'], seats: 2, note: 'Valise' });
    taxiRequest = await waitingPassenger(at(1000, 500), {
      types: ['TAXI'],
      showIdentity: true,
      note: 'Devant la pharmacie',
    });
    louageDriver = await sharingDriver('LOUAGE', at(450));
  });

  const idOf = async (s: Signed) =>
    (
      await t.pool.query<{ id: string }>(
        `SELECT id FROM passenger_requests WHERE passenger_user_id = $1 AND status = 'OPEN'`,
        [s.userId],
      )
    ).rows[0]!.id;

  it('gives a matching sharing driver the exact spot, but no name without consent', async () => {
    const view = await map(louageDriver);
    const p = view.passengers.find((x) => x.exact);
    expect(p).toMatchObject({
      exact: true,
      lat: at(0).lat,
      lng: at(0).lng,
      seats: 2,
      distanceM: 450,
      closerDrivers: 0,
      name: null,
      note: null,
      destination: { nameFr: 'Sousse' },
    });
    // The taxi-only request stays approximate for a louage driver.
    const other = view.passengers.find((x) => !x.exact)!;
    expect(other.exact).toBe(false);
    expect(other.id).toBe(await idOf(taxiRequest));
  });

  it('shows the name and note to matching drivers only when the passenger allowed it', async () => {
    const taxi = await sharingDriver('TAXI', at(900, 500));
    const view = await map(taxi);
    const named = view.passengers.find((x) => x.exact)!;
    expect(named).toMatchObject({ name: 'Marwen', note: 'Devant la pharmacie' });
    expect(view.passengers.find((x) => !x.exact)?.id).toBe(await idOf(louageRequest));
  });

  it('counts available, matching drivers closer than the viewer', async () => {
    const closer = await sharingDriver('LOUAGE', at(150));
    const full = await sharingDriver('LOUAGE', at(100));
    await request(t.server())
      .post('/v1/driver/sharing/full')
      .set(bearer(full))
      .send({ isFull: true })
      .expect(200);
    const view = await map(louageDriver);
    expect(view.passengers.find((x) => x.exact)).toMatchObject({ closerDrivers: 1 });
    await request(t.server()).post('/v1/driver/sharing/stop').set(bearer(closer)).expect(200);
    await request(t.server()).post('/v1/driver/sharing/stop').set(bearer(full)).expect(200);
  });

  it('keeps everyone else on a ~100 m cell with no name or note', async () => {
    const bus = await sharingDriver('BUS', at(300));
    const passenger = await signIn('Leila');
    for (const viewer of [bus, passenger]) {
      const view = await map(viewer);
      expect(view.passengers).toHaveLength(2);
      for (const p of view.passengers) expect(p.exact).toBe(false);
      const json = JSON.stringify(view.passengers);
      expect(json).not.toMatch(/Marwen|Valise|pharmacie/);
      expect(json).not.toContain(String(at(0).lat));
    }
  });

  it('never shows a closed or not yet anchored request', async () => {
    const unanchored = await signIn();
    await request(t.server())
      .post('/v1/requests')
      .set(bearer(unanchored))
      .send({ destination: { point: SOUSSE }, types: ['LOUAGE'] })
      .expect(201);
    const before = (await map(louageDriver)).passengers.length;
    await request(t.server()).post('/v1/requests/current/cancel').set(bearer(louageRequest)).expect(200);
    const after = await map(louageDriver);
    expect(after.passengers).toHaveLength(before - 1);
    expect(after.passengers.every((p) => !p.exact)).toBe(true);
  });

  it('refuses the map to a driver account not sharing or on break (SHARING_REQUIRED)', async () => {
    const d = await sharingDriver('LOUAGE', at(600));
    await request(t.server())
      .post('/v1/driver/sharing/break')
      .set(bearer(d))
      .send({ minutes: 30 })
      .expect(200);
    const res = await request(t.server()).post('/v1/map').set(bearer(d)).send({ bbox: CITY }).expect(403);
    expect(ProblemDetails.parse(res.body).code).toBe('SHARING_REQUIRED');
  });
});

describe('clusters, caching', () => {
  it('returns counts only beyond the live span (R-020)', async () => {
    const passenger = await signIn();
    const view = await map(passenger, { south: 34, west: 8, north: 38, east: 12 });
    expect(view).toMatchObject({ clustered: true, drivers: [], passengers: [] });
    const total = view.clusters.reduce((sum, c) => sum + c.count, 0);
    expect(total).toBeGreaterThanOrEqual(3);
    expect(view.clusters.some((c) => c.byKind.PASSENGER > 0 && c.byKind.LOUAGE > 0)).toBe(true);
  });

  it('answers an unchanged poll with a bodiless 304', async () => {
    const passenger = await signIn();
    const wide = { south: 30, west: 7, north: 31, east: 8 };
    const first = await request(t.server())
      .post('/v1/map')
      .set(bearer(passenger))
      .send({ bbox: wide })
      .expect(200);
    const etag = first.headers.etag as string;
    expect(etag).toMatch(/^W\//);
    const again = await request(t.server())
      .post('/v1/map')
      .set(bearer(passenger))
      .set('If-None-Match', etag)
      .send({ bbox: wide })
      .expect(304);
    expect(again.text).toBeFalsy();
  });
});

describe('destination finder (R-045)', () => {
  it('lists drivers heading there, taxis nearby, and scheduled departures', async () => {
    const heading = await sharingDriver('LOUAGE', at(-300), { headingToPlaceId: place.sousse });
    const full = await sharingDriver('LOUAGE', at(-200), { headingToPlaceId: place.sousse });
    await request(t.server())
      .post('/v1/driver/sharing/full')
      .set(bearer(full))
      .send({ isFull: true })
      .expect(200);
    await sharingDriver('TAXI', at(-100));
    await request(t.server())
      .post('/v1/driver/routines')
      .set(bearer(heading))
      .send({
        fromPlaceId: place.tunis,
        toPlaceId: place.sousse,
        schedule: {
          kind: 'WEEKLY',
          days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
          localTime: '07:00',
        },
        seats: 8,
      })
      .expect(201);

    const passenger = await signIn();
    const res = FinderResponse.parse(
      (
        await request(t.server())
          .post('/v1/finder')
          .set(bearer(passenger))
          .send({ destination: { point: SOUSSE, placeId: place.sousse }, near: TUNIS })
          .expect(200)
      ).body,
    );
    const louages = res.headingThere.filter((d) => d.type === 'LOUAGE');
    expect(louages.length).toBeGreaterThanOrEqual(2);
    expect(louages.at(-1)?.isFull).toBe(true);
    expect(louages[0]).toMatchObject({ isFull: false, headingTo: { nameFr: 'Sousse' } });
    expect(res.taxisNearby.some((d) => d.type === 'TAXI')).toBe(true);
    expect(res.scheduled[0]).toMatchObject({
      type: 'LOUAGE',
      from: { nameFr: 'Tunis' },
      to: { nameFr: 'Sousse' },
      seats: 8,
    });
    expect(JSON.stringify(res)).not.toMatch(/userId|driverUserId/);
  });
});
