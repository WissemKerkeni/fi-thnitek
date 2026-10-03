import { describe, expect, it } from 'vitest';
import {
  type BufferState,
  EMPTY_BUFFER,
  type Fix,
  MAX_BATCH,
  acknowledge,
  appendFixes,
  nextBatch,
  shouldKeep,
  toFix,
} from './buffer';

const C = { movingIntervalS: 10, stationaryIntervalS: 30, distanceFilterM: 10, bufferMaxMin: 60 };
const T0 = Date.UTC(2026, 9, 3, 10, 0, 0);
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

describe('toFix', () => {
  it('maps expo-location fields and drops the platform sentinels (-1)', () => {
    expect(
      toFix({
        timestamp: T0 + 0.4,
        mocked: true,
        coords: { latitude: 36.8, longitude: 10.18, accuracy: 7, speed: -1, heading: -1 },
      }),
    ).toEqual({
      ts: T0,
      lat: 36.8,
      lng: 10.18,
      accuracyM: 7,
      speedMps: null,
      headingDeg: null,
      isMock: true,
    });
  });
});

describe('shouldKeep (R-052 cadence)', () => {
  it('keeps the first fix and mock fixes', () => {
    expect(shouldKeep(null, fix(0), C)).toBe(true);
    expect(shouldKeep(fix(0), fix(1, 0, { isMock: true }), C)).toBe(true);
  });

  it('keeps a fix every ~10 s while moving', () => {
    expect(shouldKeep(fix(0), fix(9, 50), C)).toBe(true);
    expect(shouldKeep(fix(0), fix(5, 50), C)).toBe(false);
  });

  it('keeps a fix every ~30 s while stationary', () => {
    expect(shouldKeep(fix(0), fix(10, 3), C)).toBe(false);
    expect(shouldKeep(fix(0), fix(29, 3), C)).toBe(true);
  });

  it('ignores out-of-order fixes', () => {
    expect(shouldKeep(fix(10), fix(5, 100), C)).toBe(false);
  });
});

describe('the offline buffer', () => {
  it('throttles a stationary hour down to the 30 s cadence, staying well inside the 2 min gap rule', () => {
    const everyTenSeconds = Array.from({ length: 360 }, (_, i) => fix(i * 10, (i % 3) * 2));
    const state = appendFixes(EMPTY_BUFFER, everyTenSeconds, C, T0 + 3_600_000);
    const gaps = state.pending.slice(1).map((f, i) => f.ts - state.pending[i]!.ts);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(30_000);
    expect(state.pending.length).toBeLessThan(130);
  });

  it('drops fixes older than the buffer can hold', () => {
    const state = appendFixes(EMPTY_BUFFER, [fix(0), fix(40)], C, T0 + 3_600_000 + 20_000);
    expect(state.pending.map((f) => f.ts)).toEqual([T0 + 40_000]);
  });

  it('uploads the oldest fixes first and forgets them once acknowledged', () => {
    const fixes = Array.from({ length: 450 }, (_, i) => fix(i * 10, i * 20));
    let state: BufferState = appendFixes(EMPTY_BUFFER, fixes, C, T0 + 4_500_000);
    const first = nextBatch(state);
    expect(first).toHaveLength(Math.min(MAX_BATCH, state.pending.length));
    expect(first[0]!.ts).toBe(state.pending[0]!.ts);
    state = acknowledge(state, first);
    expect(state.pending.every((f) => f.ts > first.at(-1)!.ts)).toBe(true);
    expect(acknowledge(state, [])).toBe(state);
  });

  it('keeps throttling across task runs through lastKept', () => {
    const a = appendFixes(EMPTY_BUFFER, [fix(0)], C, T0);
    const b = appendFixes(acknowledge(a, a.pending), [fix(5, 1)], C, T0 + 5_000);
    expect(b.pending).toEqual([]);
    expect(b.lastKept?.ts).toBe(T0);
  });
});
