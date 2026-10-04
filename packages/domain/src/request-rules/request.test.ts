import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS as T } from '../config/thresholds.js';
import { InvalidStateTransitionError } from '../state-machines/fsm.js';
import type { Fix } from '../sharing-rules/fixes.js';
import {
  type RequestTrackState,
  type SweepRequest,
  evaluatePassengerFixes,
  pickupCandidates,
  renewal,
  requestBlockers,
  requestMachine,
  sweepRequest,
} from './request.js';

const T0 = Date.UTC(2026, 9, 5, 8, 0, 0);
/** `northM` metres north and `eastM` east of a spot in Tunis, `s` seconds after T0. */
const fix = (s: number, northM = 0, accuracyM: number | null = 8, patch: Partial<Fix> = {}): Fix => ({
  ts: T0 + s * 1000,
  lat: 36.8 + northM / 111_195,
  lng: 10.18,
  accuracyM,
  speedMps: null,
  headingDeg: null,
  isMock: false,
  ...patch,
});
const ANCHORED: RequestTrackState = {
  anchor: { lat: 36.8, lng: 10.18, accuracyM: 8 },
  awaySince: null,
  lastFixTs: T0,
};
const run = (state: RequestTrackState, fixes: Fix[], locationServicesOn = true) =>
  evaluatePassengerFixes({ state, fixes, locationServicesOn }, T);

describe('requestMachine', () => {
  it('closes only from OPEN, and closed is final', () => {
    expect(requestMachine.transition('OPEN', 'MOVED_AWAY')).toBe('MOVED_AWAY');
    expect(() => requestMachine.transition('EXPIRED', 'CANCELLED')).toThrow(InvalidStateTransitionError);
  });
});

describe('requestBlockers (R-031, R-040, R-041, invariant 3)', () => {
  const now = new Date(T0);
  const ok = {
    verification: null,
    accountActive: true,
    hasOpenRequest: false,
    types: ['TAXI', 'LOUAGE'] as const,
    accountCreatedAt: new Date(T0 - 30 * 86_400_000),
    requestsToday: 0,
    now,
    t: T,
  };

  it('lets a passenger post', () => {
    expect(requestBlockers({ ...ok, types: ['LOUAGE'] })).toEqual([]);
  });

  it('refuses driver accounts, suspended accounts, buses and a second open request', () => {
    expect(requestBlockers({ ...ok, verification: 'VERIFIED' })).toEqual(['DRIVER_ACCOUNT']);
    expect(requestBlockers({ ...ok, verification: 'SUSPENDED' })).toEqual(['DRIVER_ACCOUNT']);
    expect(requestBlockers({ ...ok, verification: 'UNDER_REVIEW' })).toEqual([]);
    expect(requestBlockers({ ...ok, accountActive: false })).toEqual(['ACCOUNT_SUSPENDED']);
    expect(requestBlockers({ ...ok, types: ['BUS'] })).toEqual(['BUS']);
    expect(requestBlockers({ ...ok, types: [] })).toEqual(['BUS']);
    expect(requestBlockers({ ...ok, hasOpenRequest: true })).toEqual(['ALREADY_OPEN']);
  });

  it('allows 5 requests a day for accounts under 3 days, 15 after', () => {
    const young = { ...ok, accountCreatedAt: new Date(T0 - 2 * 86_400_000) };
    expect(requestBlockers({ ...young, requestsToday: 4 })).toEqual([]);
    expect(requestBlockers({ ...young, requestsToday: 5 })).toEqual(['DAILY_LIMIT']);
    expect(requestBlockers({ ...ok, requestsToday: 14 })).toEqual([]);
    expect(requestBlockers({ ...ok, requestsToday: 15 })).toEqual(['DAILY_LIMIT']);
  });
});

describe('anchoring (R-033)', () => {
  const fresh: RequestTrackState = { anchor: null, awaySince: null, lastFixTs: null };

  it('waits for the first fix accurate to 30 m', () => {
    const out = run(fresh, [fix(0, 0, 80), fix(5, 3, 45), fix(10, 1, 28), fix(15, 2, 6)]);
    expect(out).toMatchObject({ kind: 'UPDATE', anchoredNow: true });
    expect(out.state.anchor).toMatchObject({ accuracyM: 28 });
    expect(out.state.lastFixTs).toBe(T0 + 15_000);
  });

  it('stays unanchored with only poor fixes', () => {
    const out = run(fresh, [fix(0, 0, 60), fix(5, 0, null)]);
    expect(out).toMatchObject({ kind: 'UPDATE', anchoredNow: false, state: { anchor: null } });
  });
});

describe('moved away (R-034) with drift fixtures', () => {
  it('ignores inaccurate fixes, however far (indoor drift)', () => {
    const drift = Array.from({ length: 60 }, (_, i) => fix(5 + i * 5, i % 2 ? 140 : -90, 60));
    expect(run(ANCHORED, drift).kind).toBe('UPDATE');
  });

  it('does not close on one far accurate fix', () => {
    expect(run(ANCHORED, [fix(5, 35)])).toMatchObject({ kind: 'UPDATE', state: { awaySince: T0 + 5000 } });
  });

  it('forgets a far fix once back in range', () => {
    const out = run(ANCHORED, [fix(5, 35), fix(10, 5), fix(30, 35)]);
    expect(out).toMatchObject({ kind: 'UPDATE', state: { awaySince: T0 + 30_000 } });
  });

  it('does not close on two far fixes less than 10 s apart', () => {
    expect(run(ANCHORED, [fix(5, 30), fix(14, 32)]).kind).toBe('UPDATE');
  });

  it('closes on two far fixes at least 10 s apart', () => {
    expect(run(ANCHORED, [fix(5, 30), fix(15, 35)])).toMatchObject({ kind: 'CLOSE', reason: 'MOVED_AWAY' });
  });

  it('keeps the far-since time across batches', () => {
    const first = run(ANCHORED, [fix(5, 30)]);
    expect(run(first.state, [fix(15, 30)])).toMatchObject({ kind: 'CLOSE', reason: 'MOVED_AWAY' });
  });

  it('stays open for someone standing within 20 m for 20 minutes', () => {
    const standing = Array.from({ length: 240 }, (_, i) => fix(5 + i * 5, (i % 7) * 2.5, 12));
    expect(run(ANCHORED, standing).kind).toBe('UPDATE');
  });

  it('ignores resent and out-of-order fixes', () => {
    const out = run({ ...ANCHORED, lastFixTs: T0 + 20_000 }, [fix(5, 30), fix(15, 35), fix(25, 2)]);
    expect(out).toMatchObject({ kind: 'UPDATE', fixes: 1 });
  });
});

describe('other closures', () => {
  it('closes on a mock fix with an admin flag', () => {
    expect(run(ANCHORED, [fix(5, 0, 5, { isMock: true })])).toMatchObject({
      kind: 'CLOSE',
      reason: 'REMOVED',
      flag: 'MOCK_LOCATION',
    });
  });

  it('closes when location services are off', () => {
    expect(run(ANCHORED, [fix(5)], false)).toMatchObject({ kind: 'CLOSE', reason: 'LOCATION_LOST' });
  });
});

describe('sweepRequest', () => {
  const created = new Date(T0);
  const base: SweepRequest = {
    createdAt: created,
    expiresAt: new Date(T0 + 60 * 60_000),
    anchored: true,
    lastPingAt: new Date(T0),
    expiryRemindedAt: null,
  };
  const at = (s: number) => new Date(T0 + s * 1000);

  it('closes without an anchor after 60 s (R-033)', () => {
    expect(sweepRequest({ ...base, anchored: false }, at(60), T)).toEqual({ type: 'NONE' });
    expect(sweepRequest({ ...base, anchored: false }, at(61), T)).toEqual({
      type: 'CLOSE',
      reason: 'NO_GPS_FIX',
    });
  });

  it('closes after 5 min without location (R-035)', () => {
    expect(sweepRequest(base, at(300), T)).toEqual({ type: 'NONE' });
    expect(sweepRequest(base, at(301), T)).toEqual({ type: 'CLOSE', reason: 'LOCATION_LOST' });
  });

  it('reminds 10 min before expiry, once, then expires (R-036)', () => {
    const alive = (s: number) => ({ ...base, lastPingAt: at(s) });
    expect(sweepRequest(alive(2999), at(2999), T)).toEqual({ type: 'NONE' });
    expect(sweepRequest(alive(3000), at(3000), T)).toEqual({ type: 'REMIND_EXPIRY' });
    expect(sweepRequest({ ...alive(3000), expiryRemindedAt: at(3000) }, at(3001), T)).toEqual({
      type: 'NONE',
    });
    expect(sweepRequest(alive(3600), at(3600), T)).toEqual({ type: 'CLOSE', reason: 'EXPIRED' });
  });
});

describe('renewal (R-036)', () => {
  it('adds 60 minutes, at most 3 times, never after expiry', () => {
    const expiresAt = new Date(T0 + 5 * 60_000);
    expect(renewal({ expiresAt, renewCount: 0 }, new Date(T0), T)).toEqual(new Date(T0 + 65 * 60_000));
    expect(renewal({ expiresAt, renewCount: 3 }, new Date(T0), T)).toBeNull();
    expect(renewal({ expiresAt, renewCount: 0 }, expiresAt, T)).toBeNull();
  });
});

describe('pickupCandidates (R-039)', () => {
  const anchor = { lat: 36.8, lng: 10.18 };
  const closedAt = new Date(T0 + 600_000);
  const near = (s: number, northM: number) => ({
    ts: T0 + s * 1000,
    lat: 36.8 + northM / 111_195,
    lng: 10.18,
  });

  it('records every driver within 50 m during the last 2 minutes', () => {
    const out = pickupCandidates(
      anchor,
      [
        { driverUserId: 'a', fixes: [near(500, 300), near(560, 12), near(590, 80)] },
        { driverUserId: 'b', fixes: [near(570, 45)] },
        { driverUserId: 'c', fixes: [near(470, 5)] },
        { driverUserId: 'd', fixes: [near(590, 60)] },
      ],
      closedAt,
      T,
    );
    expect(out).toEqual([
      { driverUserId: 'a', minDistanceM: 12 },
      { driverUserId: 'b', minDistanceM: 45 },
    ]);
  });
});
