import type { DeviceTracking } from '@fi-thnitek/contracts';
import { distanceM } from '@fi-thnitek/domain';

/** A recorded fix, as uploaded to POST /v1/location/pings. `ts` is epoch ms. */
export interface Fix {
  ts: number;
  lat: number;
  lng: number;
  accuracyM: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  isMock: boolean;
}

/** The subset of expo-location's LocationObject we read (kept local so this file stays pure). */
export interface DeviceLocation {
  timestamp: number;
  mocked?: boolean;
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
  };
}

export function toFix(l: DeviceLocation): Fix {
  const { speed, heading, accuracy } = l.coords;
  return {
    ts: Math.round(l.timestamp),
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    accuracyM: accuracy !== null && accuracy >= 0 ? accuracy : null,
    speedMps: speed !== null && speed >= 0 ? speed : null,
    headingDeg: heading !== null && heading >= 0 && heading <= 360 ? heading : null,
    isMock: l.mocked === true,
  };
}

/** Persisted between task runs: the fixes not yet acknowledged by the server, and the last one kept. */
export interface BufferState {
  pending: Fix[];
  lastKept: Fix | null;
}

export const EMPTY_BUFFER: BufferState = { pending: [], lastKept: null };

/** The OS delivers fixes about every `movingIntervalS`; allow it to be a little early. */
const INTERVAL_TOLERANCE_MS = 1_500;
/** The server accepts at most this many fixes per upload. */
export const MAX_BATCH = 400;
/** Hard cap on the stored buffer (60 min at 10 s is 360). */
const MAX_PENDING = 500;

type Cadence = Pick<
  DeviceTracking,
  'movingIntervalS' | 'stationaryIntervalS' | 'distanceFilterM' | 'bufferMaxMin'
>;

/**
 * R-052 cadence: a fix every `movingIntervalS` while moving (≥ `distanceFilterM` since the last kept fix),
 * every `stationaryIntervalS` otherwise. Mock fixes are always kept: the server must see them (R-059).
 */
export function shouldKeep(last: Fix | null, next: Fix, c: Cadence): boolean {
  if (!last || next.isMock) return true;
  const dt = next.ts - last.ts;
  if (dt <= 0) return false;
  if (dt >= c.stationaryIntervalS * 1000 - INTERVAL_TOLERANCE_MS) return true;
  return dt >= c.movingIntervalS * 1000 - INTERVAL_TOLERANCE_MS && distanceM(last, next) >= c.distanceFilterM;
}

/** Adds new fixes in time order, drops what the server can no longer use (older than the buffer). */
export function appendFixes(
  state: BufferState,
  incoming: readonly Fix[],
  c: Cadence,
  now: number,
): BufferState {
  let { lastKept } = state;
  const pending = [...state.pending];
  for (const fix of [...incoming].sort((a, b) => a.ts - b.ts)) {
    if (shouldKeep(lastKept, fix, c)) {
      pending.push(fix);
      lastKept = fix;
    }
  }
  const oldest = now - c.bufferMaxMin * 60_000;
  return { pending: pending.filter((f) => f.ts >= oldest).slice(-MAX_PENDING), lastKept };
}

/** The next upload: the oldest fixes first (the server checks gaps in order). */
export function nextBatch(state: BufferState): Fix[] {
  return state.pending.slice(0, MAX_BATCH);
}

/** After a successful upload, forget everything up to the last fix sent. */
export function acknowledge(state: BufferState, sent: readonly Fix[]): BufferState {
  const upTo = sent.at(-1)?.ts;
  if (upTo === undefined) return state;
  return { ...state, pending: state.pending.filter((f) => f.ts > upTo) };
}
