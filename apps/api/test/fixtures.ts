import { CurrentRequest, type FixInput, MapView, SignInResponse } from '@fi-thnitek/contracts';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { TEST_ADMIN_EMAIL, TEST_TERMS_VERSION, type TestApp } from './test-app.js';

/**
 * People and places for scenario-style tests: passengers, verified drivers (sharing or not), positions
 * around central Tunis. Each helper goes through the real API except the driver file, which is
 * inserted already VERIFIED (verification has its own tests).
 */
export type Signed = SignInResponse & { userId: string; sub: string; installId: string };

export const TUNIS = { lat: 36.8065, lng: 10.1815 };
export const SOUSSE = { lat: 35.8256, lng: 10.6084 };
export const CITY = { south: 36.75, west: 10.1, north: 36.86, east: 10.26 };

/** A point `northM` metres north and `eastM` east of central Tunis. */
export const at = (northM: number, eastM = 0) => ({
  lat: TUNIS.lat + northM / 111_195,
  lng: TUNIS.lng + eastM / 89_000,
});

export const fix = (p: { lat: number; lng: number }, agoS = 0, patch: Partial<FixInput> = {}): FixInput => ({
  ts: Date.now() - agoS * 1000,
  ...p,
  accuracyM: 6,
  ...patch,
});

export const bearer = (s: SignInResponse) => ({ Authorization: `Bearer ${s.accessToken}` });

export function fixtures(t: TestApp, prefix: string) {
  let n = 0;
  const server = () => t.server();

  async function signIn(name = 'Marwen', installId: string = uuidv7(), email?: string): Promise<Signed> {
    const sub = `${prefix}-${++n}`;
    const idToken = await t.googleToken({ sub, email: email ?? `${sub}@example.tn` });
    const s = SignInResponse.parse(
      (
        await request(server())
          .post('/v1/auth/google')
          .send({ idToken, device: { installId, platform: 'android', appVersion: '1.0.0' } })
          .expect(200)
      ).body,
    );
    await request(server())
      .patch('/v1/me')
      .set(bearer(s))
      .send({ displayName: name, acceptTermsVersion: TEST_TERMS_VERSION })
      .expect(200);
    await t.pool.query(`UPDATE users SET created_at = now() - interval '10 days' WHERE id = $1`, [s.me.id]);
    await t.pool.query(`UPDATE devices SET push_token = $2 WHERE user_id = $1`, [s.me.id, `push-${sub}`]);
    return { ...s, userId: s.me.id, sub, installId };
  }

  async function verifiedDriver(type: 'TAXI' | 'LOUAGE' = 'TAXI', name = 'Sami'): Promise<Signed> {
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
    await request(server())
      .post('/v1/driver/sharing/start')
      .set(bearer(s))
      .send({ fix: fix(p) })
      .expect(200);
    const status = await request(server()).get('/v1/driver/sharing').set(bearer(s)).expect(200);
    return { ...s, sessionId: (status.body as { session: { id: string } }).session.id };
  }

  /** A passenger with an OPEN request anchored at `p` (the anchoring fix is 60 s old). */
  async function waitingPassenger(p: { lat: number; lng: number }, extra: object = {}, who?: Signed) {
    const s = who ?? (await signIn());
    await request(server())
      .post('/v1/requests')
      .set(bearer(s))
      .send({ destination: { point: SOUSSE }, types: ['TAXI'], ...extra })
      .expect(201);
    await pings(s, [fix(p, 60)]);
    const current = await currentRequest(s);
    return { ...s, requestId: current.request!.id };
  }

  const pings = (s: SignInResponse, fixes: FixInput[], locationServicesOn = true) =>
    request(server())
      .post('/v1/location/pings')
      .set(bearer(s))
      .send({ fixes, locationServicesOn })
      .expect(200);

  const currentRequest = async (s: SignInResponse) =>
    CurrentRequest.parse(
      (await request(server()).get('/v1/requests/current').set(bearer(s)).expect(200)).body,
    );

  const map = async (s: SignInResponse) =>
    MapView.parse(
      (await request(server()).post('/v1/map').set(bearer(s)).send({ bbox: CITY }).expect(200)).body,
    );

  const pushesTo = (s: Signed, event: string) =>
    t.push.sent.filter((m) => m.data.event === event && m.tokens.includes(`push-${s.sub}`)).length;

  const admin = () => signIn('Admin', uuidv7(), TEST_ADMIN_EMAIL);

  return {
    signIn,
    admin,
    verifiedDriver,
    sharingDriver,
    waitingPassenger,
    pings,
    currentRequest,
    map,
    pushesTo,
  };
}
