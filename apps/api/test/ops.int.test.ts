import { AdminClientErrorList, AdminFieldMetrics, ProblemDetails } from '@fi-thnitek/contracts';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RetentionService } from '../src/retention/retention.service.js';
import { type Signed, at, bearer, fix, fixtures } from './fixtures.js';
import { type TestApp, startTestApp } from './test-app.js';

/** Phase 9 operations: retention (domain-model §4), crash reports, field metrics. */
let t: TestApp;
let f: ReturnType<typeof fixtures>;
let admin: Signed;

beforeAll(async () => {
  t = await startTestApp();
  f = fixtures(t, 'ops');
  admin = await f.admin();
});

afterAll(async () => {
  await t?.close();
});

describe('retention (domain-model §4)', () => {
  it('coarsens closed requests after 30 days, drops the latest point, and leaves recent ones alone', async () => {
    const old = await f.waitingPassenger(at(100));
    await f.pings(old, [fix(at(130), 25), fix(at(135), 5)]); // MOVED_AWAY
    const recent = await f.waitingPassenger(at(200));
    await request(t.server()).post('/v1/requests/current/cancel').set(bearer(recent)).expect(200);
    await t.pool.query(`UPDATE passenger_requests SET closed_at = now() - interval '31 days' WHERE id = $1`, [
      old.requestId,
    ]);

    const counts = await t.app.get(RetentionService).run();
    expect(counts.coarsenedRequests).toBe(1);
    const row = async (id: string) =>
      (
        await t.pool.query<{
          anchor_lat: number;
          last_lat: number | null;
          anchor_accuracy_m: number | null;
          coarsened_at: Date | null;
        }>(
          `SELECT anchor_lat, last_lat, anchor_accuracy_m, coarsened_at FROM passenger_requests WHERE id = $1`,
          [id],
        )
      ).rows[0]!;
    const coarse = await row(old.requestId);
    expect(coarse).toMatchObject({ last_lat: null, anchor_accuracy_m: null });
    expect(coarse.coarsened_at).not.toBeNull();
    expect(coarse.anchor_lat).not.toBeCloseTo(at(100).lat, 4);
    expect(Math.abs(coarse.anchor_lat - at(100).lat)).toBeLessThan(0.01);
    expect((await row(recent.requestId)).coarsened_at).toBeNull();

    // Idempotent: a second run has nothing left to do.
    expect((await t.app.get(RetentionService).run()).coarsenedRequests).toBe(0);
  });

  it('deletes sessions (and their events) ended more than 12 months ago, and old crash reports', async () => {
    const d = await f.sharingDriver(at(300));
    await request(t.server()).post('/v1/driver/sharing/stop').set(bearer(d)).expect(200);
    await t.pool.query(`UPDATE sharing_sessions SET ended_at = now() - interval '366 days' WHERE id = $1`, [
      d.sessionId,
    ]);
    const live = await f.sharingDriver(at(400));
    await t.pool.query(
      `INSERT INTO client_errors (id, fingerprint, name, message, fatal, install_id, platform, app_version, occurred_at, received_at)
       VALUES ($1, 'abcd0123', 'Error', 'old', true, $2, 'android', '1.0.0', now() - interval '91 days', now() - interval '91 days')`,
      [uuidv7(), uuidv7()],
    );

    const counts = await t.app.get(RetentionService).run();
    expect(counts.purgedSessions).toBe(1);
    expect(counts.purgedClientErrors).toBe(1);
    const { rows } = await t.pool.query(
      `SELECT (SELECT count(*)::int FROM sharing_sessions WHERE id = $1) AS old_session,
              (SELECT count(*)::int FROM session_events WHERE session_id = $1) AS old_events,
              (SELECT count(*)::int FROM sharing_sessions WHERE id = $2) AS live_session`,
      [d.sessionId, live.sessionId],
    );
    expect(rows[0]).toEqual({ old_session: 0, old_events: 0, live_session: 1 });
  });
});

describe('crash reports (in-house, PII-scrubbed)', () => {
  const report = (body: object) => request(t.server()).post('/v1/client-errors').send(body);
  const base = { platform: 'android', appVersion: '1.2.0' };
  const crash = (message: string) => ({
    name: 'TypeError',
    message,
    stack: 'TypeError: boom\n    at MapScreen (index.bundle:120:7)',
    screen: '/home',
    fatal: true,
    occurredAt: new Date().toISOString(),
  });

  it('stores crashes without a session, scrubbed again server-side, grouped for the admin', async () => {
    const installId = uuidv7();
    await report({
      ...base,
      installId,
      errors: [
        crash('no fix near 36.80651, 10.18149 for sami@example.tn'),
        crash('no fix near 36.70001, 10.20002 for ali@example.tn'),
      ],
    }).expect(204);
    const { rows } = await t.pool.query<{ message: string }>(
      `SELECT message FROM client_errors WHERE install_id = $1`,
      [installId],
    );
    expect(rows.map((r) => r.message)).toEqual([
      'no fix near [coords] for [email]',
      'no fix near [coords] for [email]',
    ]);

    const groups = AdminClientErrorList.parse(
      (await request(t.server()).get('/v1/admin/client-errors?days=7').set(bearer(admin)).expect(200)).body,
    ).groups;
    expect(groups).toEqual([
      expect.objectContaining({
        name: 'TypeError',
        message: 'no fix near [coords] for [email]',
        count: 2,
        installs: 1,
        appVersions: ['1.2.0'],
        fatal: true,
      }),
    ]);
  });

  it('rate-limits a crash loop per install and keeps the admin view admin-only', async () => {
    const installId = uuidv7();
    for (let i = 0; i < 10; i++)
      await report({ ...base, installId, errors: [crash(`loop ${i}`)] }).expect(204);
    const limited = await report({ ...base, installId, errors: [crash('loop again')] }).expect(429);
    expect(ProblemDetails.parse(limited.body).code).toBe('RATE_LIMITED');

    const user = await f.signIn();
    await request(t.server()).get('/v1/admin/client-errors').set(bearer(user)).expect(403);
  });
});

describe('field metrics (threshold tuning)', () => {
  it('summarises the period with counts and percentiles, next to the thresholds in force', async () => {
    const from = new Date(Date.now() - 3_600_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    const m = AdminFieldMetrics.parse(
      (
        await request(t.server())
          .get(`/v1/admin/field-metrics?from=${from}&to=${to}`)
          .set(bearer(admin))
          .expect(200)
      ).body,
    );
    expect(m.requests.total).toBeGreaterThanOrEqual(2);
    expect(m.requests.byStatus.CANCELLED).toBeGreaterThanOrEqual(1);
    expect(m.requests.anchorDelayS.n).toBeGreaterThanOrEqual(1);
    expect(m.sessions.byEndReason.MANUAL_STOP ?? 0).toBeGreaterThanOrEqual(0);
    expect(m.thresholds).toMatchObject({ anchor_timeout_s: 60, move_away_m: 20, pickup_radius_m: 50 });
    // Aggregates only: no ids, no coordinates.
    expect(JSON.stringify(m)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-|"lat"|"lng"/);
  });
});
