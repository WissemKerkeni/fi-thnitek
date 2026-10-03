import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS as T } from '../config/thresholds.js';
import { distanceM } from '../geo/distance.js';
import { type Fix, MAX_CLOCK_SKEW_MS, evaluateDriverFixes, isFixFresh } from './fixes.js';

const T0 = Date.UTC(2026, 9, 3, 10, 0, 0);
/** ~1.11 m per 1e-5 degree of latitude. */
const fix = (s: number, northM = 0, patch: Partial<Fix> = {}): Fix => ({
  ts: T0 + s * 1000,
  lat: 36.8 + northM / 111_195,
  lng: 10.18,
  accuracyM: 5,
  speedMps: null,
  headingDeg: null,
  isMock: false,
  ...patch,
});

/** A drive at a constant speed, one fix every `stepS` seconds. */
const drive = (fromS: number, count: number, stepS: number, kmh: number, startM = 0) =>
  Array.from({ length: count }, (_, i) => fix(fromS + i * stepS, startM + (kmh / 3.6) * i * stepS));

const evaluate = (
  latest: Fix | null,
  fixes: Fix[],
  extra: Partial<Parameters<typeof evaluateDriverFixes>[0]> = {},
) =>
  evaluateDriverFixes(
    { latest, window: [], fixes, locationServicesOn: true, now: T0 + 3_600_000, ...extra },
    T,
  );

describe('distanceM', () => {
  it('measures short distances to within a metre', () => {
    expect(distanceM(fix(0), fix(0, 20))).toBeCloseTo(20, 0);
    expect(distanceM({ lat: 36.8065, lng: 10.1815 }, { lat: 35.8256, lng: 10.6084 })).toBeGreaterThan(
      115_000,
    );
  });
});

describe('evaluateDriverFixes', () => {
  it('accepts a normal drive and keeps the last 2 minutes as the window', () => {
    const fixes = drive(10, 30, 10, 60);
    const out = evaluate(fix(0), fixes);
    expect(out.kind).toBe('ACCEPT');
    if (out.kind !== 'ACCEPT') return;
    expect(out.latest).toEqual(fixes.at(-1));
    expect(out.accepted).toBe(30);
    expect(out.window.map((f) => f.ts)).toEqual(
      fixes.filter((f) => f.ts >= fixes.at(-1)!.ts - 120_000).map((f) => f.ts),
    );
  });

  it('merges the stored window with the batch', () => {
    const stored = [fix(-20), fix(-10), fix(0)];
    const out = evaluateDriverFixes(
      {
        latest: stored.at(-1)!,
        window: stored,
        fixes: [fix(10)],
        locationServicesOn: true,
        now: T0 + 20_000,
      },
      T,
    );
    expect(out.kind === 'ACCEPT' && out.window.map((f) => (f.ts - T0) / 1000)).toEqual([-20, -10, 0, 10]);
  });

  it('accepts the first batch of a session without a stored fix', () => {
    expect(evaluate(null, [fix(0), fix(10)]).kind).toBe('ACCEPT');
  });

  it('sorts out-of-order batches and drops duplicates and already-stored fixes', () => {
    const out = evaluate(fix(20), [fix(40, 10), fix(10), fix(30, 5), fix(40, 10), fix(20)]);
    expect(out.kind === 'ACCEPT' && out.accepted).toBe(2);
    expect(out.kind === 'ACCEPT' && out.latest.ts).toBe(T0 + 40_000);
  });

  it('is a no-op when nothing is newer than the stored latest', () => {
    expect(evaluate(fix(60), [fix(10), fix(60)])).toEqual({ kind: 'NOOP' });
    expect(evaluate(fix(60), [])).toEqual({ kind: 'NOOP' });
  });

  it('ignores fixes stamped too far in the future', () => {
    const now = T0 + 60_000;
    const out = evaluate(fix(0), [fix(30), { ...fix(0), ts: now + MAX_CLOCK_SKEW_MS + 1 }], { now });
    expect(out.kind === 'ACCEPT' && out.latest.ts).toBe(T0 + 30_000);
  });

  describe('ping gaps (R-057)', () => {
    it('allows a hole of exactly 2 minutes', () => {
      expect(evaluate(fix(0), [fix(120)]).kind).toBe('ACCEPT');
    });

    it('ends the session for an uncovered hole, counting from the last good fix', () => {
      expect(evaluate(fix(0), [fix(121)])).toEqual({ kind: 'END', reason: 'PING_GAP', lastGoodTs: T0 });
    });

    it('detects the hole inside a batch (app killed, reopened later)', () => {
      const out = evaluate(fix(0), [fix(10), fix(20), fix(620), fix(630)]);
      expect(out).toEqual({ kind: 'END', reason: 'PING_GAP', lastGoodTs: T0 + 20_000 });
    });

    it('does not count a network outage covered by buffered fixes (tunnel for 5 min)', () => {
      // The upload arrives 5 minutes late but the phone kept recording every 10 s.
      const buffered = drive(10, 30, 10, 50);
      const out = evaluate(fix(0), buffered, { now: T0 + 310_000 });
      expect(out.kind).toBe('ACCEPT');
    });

    it('accepts a stationary driver at the stationary cadence (30 s)', () => {
      expect(evaluate(fix(0), [fix(30), fix(60), fix(90)]).kind).toBe('ACCEPT');
    });
  });

  describe('spoofing (R-059)', () => {
    it('ends on a mock fix, flags it, and keeps the previous fix as the last good one', () => {
      expect(evaluate(fix(0), [fix(10), fix(20, 50, { isMock: true })])).toEqual({
        kind: 'END',
        reason: 'SPOOF_SUSPECTED',
        lastGoodTs: T0 + 10_000,
        flag: { type: 'MOCK_LOCATION', evidence: { accuracyM: 5 } },
      });
    });

    it('accepts a fast motorway drive (130 km/h)', () => {
      expect(evaluate(fix(0), drive(10, 10, 10, 130, 361)).kind).toBe('ACCEPT');
    });

    it('ends on an impossible jump (2 km in 10 s) with the measured speed as evidence', () => {
      const out = evaluate(fix(0), [fix(10, 2000)]);
      expect(out.kind).toBe('END');
      if (out.kind !== 'END') return;
      expect(out.reason).toBe('SPOOF_SUSPECTED');
      expect(out.flag?.type).toBe('IMPOSSIBLE_JUMP');
      expect(out.flag?.evidence.speedKmh).toBeGreaterThan(700);
      expect(out.flag?.evidence).not.toHaveProperty('lat');
    });

    it('forgives GPS drift within the accuracy radii', () => {
      // 300 m apart in 2 s would be 540 km/h, but both fixes claim ±200 m.
      const out = evaluate(fix(0, 0, { accuracyM: 200 }), [fix(2, 300, { accuracyM: 200 })]);
      expect(out.kind).toBe('ACCEPT');
    });

    it('does not compute a speed for fixes under a second apart', () => {
      expect(evaluate(fix(0), [{ ...fix(0, 500), ts: T0 + 500 }]).kind).toBe('ACCEPT');
    });
  });

  describe('location services off', () => {
    it('ends after storing nothing, from the last valid fix of the batch', () => {
      expect(evaluate(fix(0), [fix(10)], { locationServicesOn: false })).toEqual({
        kind: 'END',
        reason: 'LOCATION_OFF',
        lastGoodTs: T0 + 10_000,
      });
      expect(evaluate(fix(0), [], { locationServicesOn: false })).toEqual({
        kind: 'END',
        reason: 'LOCATION_OFF',
        lastGoodTs: T0,
      });
    });

    it('reports a gap before the switch-off when both happened', () => {
      expect(evaluate(fix(0), [fix(300)], { locationServicesOn: false })).toMatchObject({
        reason: 'PING_GAP',
      });
    });
  });
});

describe('isFixFresh (R-053)', () => {
  it('is fresh for 2 minutes', () => {
    expect(isFixFresh(T0, T0 + 120_000, T)).toBe(true);
    expect(isFixFresh(T0, T0 + 120_001, T)).toBe(false);
    expect(isFixFresh(null, T0, T)).toBe(false);
  });
});
