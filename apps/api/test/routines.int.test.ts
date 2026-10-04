import {
  type FixInput,
  MapDriversResponse,
  ProblemDetails,
  RoutineList,
  RoutineView,
  SharingStatus,
  SignInResponse,
} from '@fi-thnitek/contracts';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db/client.js';
import { importPlaces } from '../src/places/import-places.js';
import { RoutinesService } from '../src/routines/routines.service.js';
import { TEST_ADMIN_EMAIL, TEST_TERMS_VERSION, type TestApp, startTestApp } from './test-app.js';

let t: TestApp;
let admin: SignInResponse;
let n = 0;
const place: Record<'tunis' | 'sousse' | 'sfax', string> = { tunis: '', sousse: '', sfax: '' };

type Signed = SignInResponse & { pushToken: string; userId: string };

beforeAll(async () => {
  t = await startTestApp();
  admin = await signIn('admin-routines', TEST_ADMIN_EMAIL);
  const fixture = (source: string, nameFr: string, nameAr: string, lat: number, lng: number) => ({
    source,
    kind: 'CITY' as const,
    nameAr,
    nameFr,
    aliases: [],
    lat,
    lng,
    governorateCode: null,
    popularity: 90,
  });
  await importPlaces(createDatabase(t.pool), [
    fixture('test:tunis', 'Tunis', 'تونس', 36.8008, 10.18),
    fixture('test:sousse', 'Sousse', 'سوسة', 35.8256, 10.6084),
    fixture('test:sfax', 'Sfax', 'صفاقس', 34.74, 10.76),
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
const problem = (body: unknown) => ProblemDetails.parse(body);
const pushesTo = (s: Signed, event: string) =>
  t.push.sent.filter((m) => m.tokens.includes(s.pushToken) && m.data.event === event).length;

async function signIn(sub = `routines-${++n}`, email = `${sub}@example.tn`): Promise<Signed> {
  const idToken = await t.googleToken({ sub, email });
  const res = await request(t.server()).post('/v1/auth/google').send({ idToken }).expect(200);
  const s = SignInResponse.parse(res.body);
  await request(t.server())
    .patch('/v1/me')
    .set(bearer(s))
    .send({ displayName: 'Hedi', acceptTermsVersion: TEST_TERMS_VERSION })
    .expect(200);
  await request(t.server())
    .put('/v1/me/device')
    .set(bearer(s))
    .send({ installId: uuidv7(), platform: 'android', appVersion: '0.6.0', pushToken: `fcm-${sub}` })
    .expect(204);
  return { ...s, pushToken: `fcm-${sub}`, userId: s.me.id };
}

async function verifiedDriver(): Promise<Signed> {
  const s = await signIn();
  await t.pool.query(
    `INSERT INTO driver_profiles (user_id, legal_first_name, legal_last_name, cin_hmac, cin_last4, cin_encrypted, transport_type, status)
     VALUES ($1, 'Hedi', 'Trabelsi', $2, '1234', 'x', 'LOUAGE', 'VERIFIED')`,
    [s.userId, `hmac-${s.userId}`],
  );
  await t.pool.query(
    `INSERT INTO vehicles (id, driver_user_id, transport_type, plate_normalized, plate_display, seats)
     VALUES ($1, $2, 'LOUAGE', $3, '200 تونس 1234', 8)`,
    [uuidv7(), s.userId, `p-${s.userId}`],
  );
  return s;
}

/** Tunis-local "HH:MM" `minutesFromNow` from now (UTC+1). */
const tunisTime = (minutesFromNow = 0) =>
  new Date(Date.now() + 3_600_000 + minutesFromNow * 60_000).toISOString().slice(11, 16);
const ALL_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const weekly = (overrides: object = {}) => ({
  fromPlaceId: place.tunis,
  toPlaceId: place.sousse,
  schedule: { kind: 'WEEKLY', days: ['MON', 'TUE', 'WED', 'THU', 'FRI'], localTime: '07:00' },
  ...overrides,
});

const api = (s: SignInResponse) => ({
  list: () => request(t.server()).get('/v1/driver/routines').set(bearer(s)),
  create: (body: object) => request(t.server()).post('/v1/driver/routines').set(bearer(s)).send(body),
  update: (id: string, body: object) =>
    request(t.server()).put(`/v1/driver/routines/${id}`).set(bearer(s)).send(body),
  remove: (id: string) => request(t.server()).delete(`/v1/driver/routines/${id}`).set(bearer(s)),
  stillRunning: (id: string, running: boolean) =>
    request(t.server()).post(`/v1/driver/routines/${id}/still-running`).set(bearer(s)).send({ running }),
});

const fix = (): FixInput => ({ ts: Date.now(), lat: 36.8, lng: 10.18, accuracyM: 6 });

describe('routine routes (R-065)', () => {
  it('are for verified drivers only', async () => {
    const passenger = await signIn();
    expect(problem((await api(passenger).create(weekly()).expect(403)).body).detail).toBe('NOT_VERIFIED');
  });

  it('creates a weekly routine with its departures of the next 7 days', async () => {
    const d = await verifiedDriver();
    const view = RoutineView.parse(
      (
        await api(d)
          .create(weekly({ seats: 6, note: 'Départ Moncef Bey' }))
          .expect(201)
      ).body,
    );
    expect(view).toMatchObject({
      transportType: 'LOUAGE',
      from: { nameFr: 'Tunis' },
      to: { nameFr: 'Sousse' },
      schedule: { kind: 'WEEKLY', days: ['MON', 'TUE', 'WED', 'THU', 'FRI'], localTime: '07:00' },
      seats: 6,
      note: 'Départ Moncef Bey',
      active: true,
      hidden: false,
      stillRunningPending: false,
    });
    expect(view.nextOccurrences.length).toBeGreaterThanOrEqual(4);
    for (const at of view.nextOccurrences) expect(at.slice(11, 16)).toBe('06:00');
  });

  it('validates places and schedules', async () => {
    const d = await verifiedDriver();
    expect(
      problem(
        (
          await api(d)
            .create(weekly({ toPlaceId: place.tunis }))
            .expect(400)
        ).body,
      ).detail,
    ).toBe('SAME_PLACES');
    const past = { kind: 'ONE_OFF', at: new Date(Date.now() - 60_000).toISOString() };
    expect(
      problem(
        (
          await api(d)
            .create(weekly({ schedule: past }))
            .expect(400)
        ).body,
      ).detail,
    ).toBe('IN_THE_PAST');
    expect(
      problem(
        (
          await api(d)
            .create(weekly({ toPlaceId: uuidv7() }))
            .expect(400)
        ).body,
      ).detail,
    ).toBe('Unknown place');
  });

  it('allows at most 5 routines', async () => {
    const d = await verifiedDriver();
    for (let i = 0; i < 5; i += 1) await api(d).create(weekly()).expect(201);
    expect(problem((await api(d).create(weekly()).expect(409)).body).code).toBe('ROUTINE_LIMIT');
    expect(RoutineList.parse((await api(d).list().expect(200)).body)).toMatchObject({ max: 5 });
  });

  it('edits and deletes only its own routines', async () => {
    const d = await verifiedDriver();
    const other = await verifiedDriver();
    const { id } = RoutineView.parse((await api(d).create(weekly()).expect(201)).body);
    const oneOff = { kind: 'ONE_OFF', at: new Date(Date.now() + 2 * 86_400_000).toISOString() };
    const edited = RoutineView.parse(
      (
        await api(d)
          .update(id, weekly({ toPlaceId: place.sfax, schedule: oneOff }))
          .expect(200)
      ).body,
    );
    expect(edited).toMatchObject({ to: { nameFr: 'Sfax' }, schedule: { kind: 'ONE_OFF' } });
    expect(edited.nextOccurrences).toHaveLength(1);
    await api(other).update(id, weekly()).expect(404);
    await api(other).remove(id).expect(404);
    await api(d).remove(id).expect(204);
    expect(RoutineList.parse((await api(d).list().expect(200)).body).routines).toEqual([]);
  });
});

describe('heading-to pre-fill and use (R-051, R-067)', () => {
  it('suggests the routine departing now and marks it used when sharing heads there', async () => {
    const d = await verifiedDriver();
    const { id } = RoutineView.parse(
      (
        await api(d)
          .create(weekly({ schedule: { kind: 'WEEKLY', days: ALL_DAYS, localTime: tunisTime(20) } }))
          .expect(201)
      ).body,
    );
    const status = SharingStatus.parse(
      (await request(t.server()).get('/v1/driver/sharing').set(bearer(d)).expect(200)).body,
    );
    expect(status.suggestedHeadingTo?.nameFr).toBe('Sousse');

    await t.pool.query(`UPDATE driver_routines SET last_used_at = now() - interval '20 days' WHERE id = $1`, [
      id,
    ]);
    await request(t.server())
      .post('/v1/driver/sharing/start')
      .set(bearer(d))
      .send({ fix: fix(), headingToPlaceId: place.sousse })
      .expect(200);
    const { rows } = await t.pool.query<{ last_used_at: Date }>(
      `SELECT last_used_at FROM driver_routines WHERE id = $1`,
      [id],
    );
    expect(Date.now() - rows[0]!.last_used_at.getTime()).toBeLessThan(60_000);

    // R-022 / R-066: the driver card shows the next departure.
    const passenger = await signIn();
    const map = MapDriversResponse.parse(
      (
        await request(t.server())
          .post('/v1/map/drivers')
          .set(bearer(passenger))
          .send({ bbox: { south: 36.75, west: 10.1, north: 36.85, east: 10.25 } })
          .expect(200)
      ).body,
    );
    const mine = map.drivers.find((m) => m.plateDisplay === '200 تونس 1234' && m.nextRoutine);
    expect(mine?.nextRoutine?.toNameFr).toBe('Sousse');
  });

  it('suggests nothing far from any departure', async () => {
    const d = await verifiedDriver();
    await api(d)
      .create(weekly({ schedule: { kind: 'WEEKLY', days: ALL_DAYS, localTime: tunisTime(180) } }))
      .expect(201);
    const status = SharingStatus.parse(
      (await request(t.server()).get('/v1/driver/sharing').set(bearer(d)).expect(200)).body,
    );
    expect(status.suggestedHeadingTo).toBeNull();
  });
});

describe('staleness (R-067)', () => {
  const sweep = () => t.app.get(RoutinesService).staleSweep();

  it('asks after 30 unused days, hides 7 days later, and comes back when confirmed', async () => {
    const d = await verifiedDriver();
    const { id } = RoutineView.parse((await api(d).create(weekly()).expect(201)).body);
    await t.pool.query(
      `UPDATE driver_routines SET created_at = now() - interval '31 days', last_used_at = now() - interval '31 days' WHERE id = $1`,
      [id],
    );
    await sweep();
    expect(pushesTo(d, 'ROUTINE_STALE')).toBe(1);
    let view = RoutineList.parse((await api(d).list().expect(200)).body).routines[0]!;
    expect(view).toMatchObject({ stillRunningPending: true, hidden: false });

    await t.pool.query(
      `UPDATE driver_routines SET stale_prompted_at = now() - interval '8 days' WHERE id = $1`,
      [id],
    );
    await sweep();
    view = RoutineList.parse((await api(d).list().expect(200)).body).routines[0]!;
    expect(view).toMatchObject({ hidden: true, stillRunningPending: false, nextOccurrences: [] });

    view = RoutineView.parse((await api(d).stillRunning(id, true).expect(200)).body);
    expect(view).toMatchObject({ hidden: false, active: true, stillRunningPending: false });
    expect(view.nextOccurrences.length).toBeGreaterThan(0);
  });

  it('switches the routine off when the driver answers no', async () => {
    const d = await verifiedDriver();
    const { id } = RoutineView.parse((await api(d).create(weekly()).expect(201)).body);
    expect(RoutineView.parse((await api(d).stillRunning(id, false).expect(200)).body)).toMatchObject({
      active: false,
      nextOccurrences: [],
    });
  });
});

describe('places in use', () => {
  it('cannot be deleted by an admin while a routine points at them', async () => {
    const d = await verifiedDriver();
    await api(d)
      .create(weekly({ toPlaceId: place.sfax }))
      .expect(201);
    const res = await request(t.server())
      .delete(`/v1/admin/places/${place.sfax}`)
      .set(bearer(admin))
      .expect(409);
    expect(problem(res.body).code).toBe('CONFLICT');
  });
});
