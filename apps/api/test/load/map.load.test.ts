import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Signed, at, fixtures } from '../fixtures.js';
import { type TestApp, startTestApp } from '../test-app.js';

/**
 * NFR-02 / architecture §8: the live map stays under 300 ms at the 95th percentile, server-side, for a
 * ~20 km viewport at pilot density (500 sharing drivers, 300 waiting passengers), with viewers polling
 * concurrently. Run with `pnpm --filter @fi-thnitek/api test:load` (not part of the normal suite).
 */
const DRIVERS = 500;
const REQUESTS = 300;
const VIEWERS = 40;
const CALLS = 2_000;
const CONCURRENCY = 25;
/** ~20 km × 20 km around central Tunis. */
const BBOX = { south: 36.72, west: 10.07, north: 36.9, east: 10.29 };

let t: TestApp;
let base = '';
const viewers: Signed[] = [];

beforeAll(async () => {
  t = await startTestApp({ mapCacheMs: 2_000 });
  const f = fixtures(t, 'load');

  // Pilot density, inserted directly (the API path is covered elsewhere).
  await t.pool.query(
    `WITH d AS (
       SELECT gen_random_uuid() AS uid, gen_random_uuid() AS vid, gen_random_uuid() AS sid, i,
              36.72 + random() * 0.18 AS lat, 10.07 + random() * 0.22 AS lng,
              (ARRAY['TAXI','LOUAGE','TAXI'])[1 + (i % 3)]::transport_type AS tt
       FROM generate_series(1, $1) AS i
     ), u AS (
       INSERT INTO users (id, display_name, status) SELECT uid, 'Driver ' || i, 'ACTIVE' FROM d RETURNING id
     ), p AS (
       INSERT INTO driver_profiles (user_id, legal_first_name, legal_last_name, cin_hmac, cin_last4, cin_encrypted, transport_type, status)
       SELECT uid, 'Load', 'Driver', 'h-' || uid, '0000', 'x', tt, 'VERIFIED' FROM d RETURNING user_id
     ), v AS (
       INSERT INTO vehicles (id, driver_user_id, transport_type, plate_normalized, plate_display, seats)
       SELECT vid, uid, tt, 'lp-' || uid, i || ' تونس 1', 4 FROM d RETURNING id
     ), s AS (
       INSERT INTO sharing_sessions (id, driver_user_id, vehicle_id, transport_type, state, is_full, last_fix_at)
       SELECT sid, uid, vid, tt, 'SHARING', (i % 7 = 0), now() FROM d RETURNING id
     )
     INSERT INTO driver_live_locations (driver_user_id, session_id, transport_type, point, lat, lng, accuracy_m, fix_ts)
     SELECT uid, sid, tt, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, lat, lng, 8, now() FROM d`,
    [DRIVERS],
  );
  await t.pool.query(
    `WITH r AS (
       SELECT gen_random_uuid() AS uid, i, 36.72 + random() * 0.18 AS lat, 10.07 + random() * 0.22 AS lng
       FROM generate_series(1, $1) AS i
     ), u AS (
       INSERT INTO users (id, display_name, status) SELECT uid, 'Passenger ' || i, 'ACTIVE' FROM r RETURNING id
     )
     INSERT INTO passenger_requests (id, passenger_user_id, transport_types, destination_point, destination_lat, destination_lng,
       seats, show_identity, status, anchor_point, anchor_lat, anchor_lng, anchor_accuracy_m, visible_at, expires_at)
     SELECT gen_random_uuid(), uid, ARRAY['TAXI','LOUAGE']::transport_type[],
       ST_SetSRID(ST_MakePoint(10.6084, 35.8256), 4326)::geography, 35.8256, 10.6084,
       1 + (i % 3), (i % 2 = 0), 'OPEN', ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, lat, lng, 8, now(),
       now() + interval '1 hour'
     FROM r`,
    [REQUESTS],
  );
  // Fresh fixes: a seeded driver older than `driver_fresh_s` would vanish mid-run.
  await t.pool.query(`UPDATE driver_live_locations SET fix_ts = now() + interval '10 minutes'`);

  // Passengers and sharing drivers look at the map (drivers get the heavier exact serialisation).
  for (let i = 0; i < VIEWERS; i++) {
    viewers.push(i % 4 === 0 ? await f.sharingDriver(at(i * 30)) : await f.signIn(`Viewer`));
  }
  await t.pool.query(`UPDATE driver_live_locations SET fix_ts = now() + interval '10 minutes'`);
  await t.pool.query('ANALYZE');

  await t.app.listen(0, '127.0.0.1');
  // Longer than the client's idle sockets, so a reused connection is never closed under it (ECONNRESET).
  const server = t.app.getHttpServer() as { keepAliveTimeout: number; headersTimeout: number };
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  base = `http://127.0.0.1:${((t.app.getHttpServer() as Server).address() as AddressInfo).port}/v1`;
}, 600_000);

afterAll(async () => {
  await t?.close();
});

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

describe('live map under pilot load (NFR-02)', () => {
  it(`answers ${CALLS} polls of a 20 km view with p95 < 300 ms`, async () => {
    const call = (viewer: Signed) =>
      fetch(`${base}/map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${viewer.accessToken}` },
        body: JSON.stringify({ bbox: BBOX }),
      });
    const poll = async (viewer: Signed) => {
      let started = performance.now();
      let res: Response;
      try {
        res = await call(viewer);
      } catch {
        // A socket reset by the OS between calls: retry once and time the retry only.
        started = performance.now();
        res = await call(viewer);
      }
      const body = (await res.json()) as { drivers: unknown[]; passengers: unknown[]; clustered: boolean };
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      return {
        ms: performance.now() - started,
        drivers: body.drivers.length,
        passengers: body.passengers.length,
        clustered: body.clustered,
      };
    };

    // Warm-up (connections, query plans).
    for (const v of viewers.slice(0, 5)) await poll(v);

    const timings: number[] = [];
    let sample: Awaited<ReturnType<typeof poll>> | null = null;
    let next = 0;
    const startedAll = performance.now();
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (next < CALLS) {
          const v = viewers[next++ % viewers.length]!;
          const r = await poll(v);
          timings.push(r.ms);
          sample ??= r;
        }
      }),
    );
    const seconds = (performance.now() - startedAll) / 1000;
    const sorted = [...timings].sort((a, b) => a - b);
    const report = {
      calls: sorted.length,
      throughputPerS: Math.round(sorted.length / seconds),
      p50: Math.round(percentile(sorted, 50)),
      p95: Math.round(percentile(sorted, 95)),
      p99: Math.round(percentile(sorted, 99)),
      max: Math.round(sorted[sorted.length - 1]!),
      markers: sample,
    };
    // The point of this test is the report: printed for the release notes (docs/operations.md §7).
    // eslint-disable-next-line no-console
    console.log('map load', report);

    expect(sample).toMatchObject({ clustered: false });
    // NFR-01: at most 300 markers per kind on the phone.
    expect(sample!.drivers).toBe(300);
    expect(report.p95).toBeLessThan(300);
  }, 600_000);
});
