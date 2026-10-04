import type { Thresholds } from '../config/thresholds.js';
import { distanceM } from '../geo/distance.js';

/** One location fix from the phone. `ts` is epoch milliseconds (UTC). */
export interface Fix {
  ts: number;
  lat: number;
  lng: number;
  /** Horizontal accuracy radius in metres; null when the phone didn't report one. */
  accuracyM: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  isMock: boolean;
}

export type FixFlagType = 'MOCK_LOCATION' | 'IMPOSSIBLE_JUMP';

/** Evidence kept for the admin flag: measurements only, never coordinates. */
export interface FlagEvidence {
  speedKmh?: number;
  dtS?: number;
  accuracyM?: number | null;
}

export type DriverFixOutcome =
  /** Nothing newer than what is stored (duplicates or late arrivals): keep everything as it is. */
  | { kind: 'NOOP' }
  | { kind: 'ACCEPT'; latest: Fix; window: Fix[]; accepted: number }
  | {
      kind: 'END';
      reason: 'PING_GAP' | 'SPOOF_SUSPECTED' | 'LOCATION_OFF';
      /** The last fix that passed every check (the PING_GAP cooldown counts from it). */
      lastGoodTs: number | null;
      flag?: { type: FixFlagType; evidence: FlagEvidence };
    };

export interface DriverFixInput {
  /** The stored latest fix of the session (the start/resume fix or the last accepted one). */
  latest: Fix | null;
  /** The stored rolling window (fixes of the last `driver_fresh_s`). */
  window: readonly Fix[];
  /** An uploaded batch, in any order (the phone's offline buffer may resend). */
  fixes: readonly Fix[];
  locationServicesOn: boolean;
  /** Server time, epoch ms. */
  now: number;
}

/** Fixes stamped further than this in the future are ignored (a wrong phone clock must not move markers). */
export const MAX_CLOCK_SKEW_MS = 120_000;

/**
 * Driver ping rules (docs/architecture.md §4.4, R-057, R-059), applied in timestamp order:
 * - a mock fix, or an implied speed above `spoof_speed_kmh` once both accuracy radii are subtracted, ends
 *   the session as SPOOF_SUSPECTED (with an admin flag);
 * - a hole longer than `ping_gap_s` between consecutive fixes (stored latest included) ends it as PING_GAP:
 *   a gap covered by buffered fixes uploaded later is not a gap;
 * - location services off ends it as LOCATION_OFF (after the batch's valid fixes).
 * Fixes not newer than the stored latest only matter as duplicates and are dropped.
 */
export function evaluateDriverFixes(
  input: DriverFixInput,
  t: Pick<Thresholds, 'ping_gap_s' | 'spoof_speed_kmh' | 'driver_fresh_s'>,
): DriverFixOutcome {
  const after = input.latest?.ts ?? Number.NEGATIVE_INFINITY;
  const fresh = [...input.fixes]
    .filter((f) => f.ts > after && f.ts <= input.now + MAX_CLOCK_SKEW_MS)
    .sort((a, b) => a.ts - b.ts)
    .filter((f, i, all) => i === 0 || f.ts !== all[i - 1]!.ts);

  let prev = input.latest;
  for (const fix of fresh) {
    if (fix.isMock) {
      return {
        kind: 'END',
        reason: 'SPOOF_SUSPECTED',
        lastGoodTs: prev?.ts ?? null,
        flag: { type: 'MOCK_LOCATION', evidence: { accuracyM: fix.accuracyM } },
      };
    }
    if (prev) {
      const dtS = (fix.ts - prev.ts) / 1000;
      if (dtS > t.ping_gap_s) return { kind: 'END', reason: 'PING_GAP', lastGoodTs: prev.ts };
      if (dtS >= 1) {
        const slack = (prev.accuracyM ?? 0) + (fix.accuracyM ?? 0);
        const speedKmh = (Math.max(0, distanceM(prev, fix) - slack) / dtS) * 3.6;
        if (speedKmh > t.spoof_speed_kmh) {
          return {
            kind: 'END',
            reason: 'SPOOF_SUSPECTED',
            lastGoodTs: prev.ts,
            flag: {
              type: 'IMPOSSIBLE_JUMP',
              evidence: { speedKmh: Math.round(speedKmh), dtS: Math.round(dtS) },
            },
          };
        }
      }
    }
    prev = fix;
  }

  if (!input.locationServicesOn) {
    return { kind: 'END', reason: 'LOCATION_OFF', lastGoodTs: prev?.ts ?? null };
  }
  if (fresh.length === 0 || !prev) return { kind: 'NOOP' };

  const since = prev.ts - t.driver_fresh_s * 1000;
  const window = [...input.window, ...fresh].filter((f) => f.ts >= since && f.ts <= prev.ts);
  return { kind: 'ACCEPT', latest: prev, window, accepted: fresh.length };
}

/** "Fresh" = the latest fix is recent enough to show the driver and to use live features (R-053). */
export function isFixFresh(
  latestTs: number | null,
  now: number,
  t: Pick<Thresholds, 'driver_fresh_s'>,
): boolean {
  return latestTs !== null && now - latestTs <= t.driver_fresh_s * 1000;
}
