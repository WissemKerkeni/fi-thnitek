import type { Thresholds } from '../config/thresholds.js';
import { distanceM, type Point } from '../geo/distance.js';
import { defineMachine } from '../state-machines/fsm.js';
import type { Fix } from '../sharing-rules/fixes.js';
import type { TransportType } from '../verification/documents.js';
import { type VerificationState, isDriverOnlyAccount } from '../verification/verification.js';

/** docs/domain-model.md § Passengers. */
export const REQUEST_STATUSES = [
  'OPEN',
  'MOVED_AWAY',
  'LOCATION_LOST',
  'NO_GPS_FIX',
  'EXPIRED',
  'CANCELLED',
  'REMOVED',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type RequestCloseReason = Exclude<RequestStatus, 'OPEN'>;

/** Only taxis and louages can be requested; never buses (R-041, invariant 2). */
export const REQUESTABLE_TYPES = ['TAXI', 'LOUAGE'] as const satisfies readonly TransportType[];
export type RequestableType = (typeof REQUESTABLE_TYPES)[number];

export const requestMachine = defineMachine<RequestStatus, RequestCloseReason>('passenger_request', {
  OPEN: {
    MOVED_AWAY: 'MOVED_AWAY',
    LOCATION_LOST: 'LOCATION_LOST',
    NO_GPS_FIX: 'NO_GPS_FIX',
    EXPIRED: 'EXPIRED',
    CANCELLED: 'CANCELLED',
    REMOVED: 'REMOVED',
  },
  MOVED_AWAY: {},
  LOCATION_LOST: {},
  NO_GPS_FIX: {},
  EXPIRED: {},
  CANCELLED: {},
  REMOVED: {},
});

const MIN = 60_000;
const DAY = 86_400_000;

export type RequestBlocker = 'DRIVER_ACCOUNT' | 'ACCOUNT_SUSPENDED' | 'ALREADY_OPEN' | 'DAILY_LIMIT' | 'BUS';

/** R-031, R-040, R-041 and invariant 3: what prevents posting a request. */
export function requestBlockers(c: {
  verification: VerificationState | null;
  accountActive: boolean;
  hasOpenRequest: boolean;
  types: readonly TransportType[];
  accountCreatedAt: Date;
  requestsToday: number;
  now: Date;
  t: Pick<Thresholds, 'request_daily_limit_new' | 'request_daily_limit' | 'request_new_account_days'>;
}): RequestBlocker[] {
  const blockers: RequestBlocker[] = [];
  if (!c.accountActive) blockers.push('ACCOUNT_SUSPENDED');
  if (isDriverOnlyAccount(c.verification)) blockers.push('DRIVER_ACCOUNT');
  if (c.types.length === 0 || c.types.some((t) => !(REQUESTABLE_TYPES as readonly string[]).includes(t))) {
    blockers.push('BUS');
  }
  if (c.hasOpenRequest) blockers.push('ALREADY_OPEN');
  const young = c.now.getTime() - c.accountCreatedAt.getTime() < c.t.request_new_account_days * DAY;
  if (c.requestsToday >= (young ? c.t.request_daily_limit_new : c.t.request_daily_limit))
    blockers.push('DAILY_LIMIT');
  return blockers;
}

/** The anchor: the first accurate fix after posting; the request is visible to drivers from then on. */
export interface Anchor extends Point {
  accuracyM: number;
}

export interface RequestTrackState {
  anchor: Anchor | null;
  /** When the passenger was first seen beyond the move-away distance (fix time, epoch ms). */
  awaySince: number | null;
  /** The newest fix already processed (epoch ms); older ones in a resent batch are ignored. */
  lastFixTs: number | null;
}

export type PassengerFixOutcome =
  | { kind: 'UPDATE'; state: RequestTrackState; latest: Fix | null; anchoredNow: boolean; fixes: number }
  | {
      kind: 'CLOSE';
      reason: 'MOVED_AWAY' | 'LOCATION_LOST' | 'REMOVED';
      state: RequestTrackState;
      latest: Fix | null;
      flag?: 'MOCK_LOCATION';
    };

/**
 * Passenger rules (docs/architecture.md §4.3, R-033…R-035), in timestamp order:
 * - the first fix with accuracy ≤ `anchor_max_accuracy_m` becomes the anchor;
 * - fixes worse than `move_away_min_accuracy_m` are ignored (indoor drift never closes a request);
 * - beyond `move_away_m` from the anchor twice, at least `move_away_confirm_s` apart → MOVED_AWAY;
 *   coming back in range in between cancels the first far fix;
 * - a mock fix closes the request (REMOVED) with an admin flag; location services off → LOCATION_LOST.
 */
export function evaluatePassengerFixes(
  input: { state: RequestTrackState; fixes: readonly Fix[]; locationServicesOn: boolean },
  t: Pick<
    Thresholds,
    'anchor_max_accuracy_m' | 'move_away_min_accuracy_m' | 'move_away_m' | 'move_away_confirm_s'
  >,
): PassengerFixOutcome {
  let { anchor, awaySince } = input.state;
  const after = input.state.lastFixTs ?? Number.NEGATIVE_INFINITY;
  const fresh = [...input.fixes]
    .filter((f) => f.ts > after)
    .sort((a, b) => a.ts - b.ts)
    .filter((f, i, all) => i === 0 || f.ts !== all[i - 1]!.ts);
  let anchoredNow = false;
  let latest: Fix | null = null;
  const stateNow = (): RequestTrackState => ({
    anchor,
    awaySince,
    lastFixTs: latest?.ts ?? input.state.lastFixTs,
  });

  for (const fix of fresh) {
    if (fix.isMock)
      return { kind: 'CLOSE', reason: 'REMOVED', state: stateNow(), latest, flag: 'MOCK_LOCATION' };
    latest = fix;
    if (!anchor) {
      if (fix.accuracyM !== null && fix.accuracyM <= t.anchor_max_accuracy_m) {
        anchor = { lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM };
        anchoredNow = true;
      }
      continue;
    }
    if (fix.accuracyM === null || fix.accuracyM > t.move_away_min_accuracy_m) continue;
    if (distanceM(anchor, fix) > t.move_away_m) {
      if (awaySince !== null && fix.ts - awaySince >= t.move_away_confirm_s * 1000) {
        return { kind: 'CLOSE', reason: 'MOVED_AWAY', state: stateNow(), latest };
      }
      awaySince ??= fix.ts;
    } else {
      awaySince = null;
    }
  }

  if (!input.locationServicesOn) return { kind: 'CLOSE', reason: 'LOCATION_LOST', state: stateNow(), latest };
  return { kind: 'UPDATE', state: stateNow(), latest, anchoredNow, fixes: fresh.length };
}

export interface SweepRequest {
  createdAt: Date;
  expiresAt: Date;
  anchored: boolean;
  /** Server time of the last ping that carried at least one fix. */
  lastPingAt: Date | null;
  expiryRemindedAt: Date | null;
}

export type RequestSweepAction =
  | { type: 'NONE' }
  | { type: 'CLOSE'; reason: 'NO_GPS_FIX' | 'LOCATION_LOST' | 'EXPIRED' }
  | { type: 'REMIND_EXPIRY' };

/** The 30 s job (docs/architecture.md §4.3): closures first, then the "Renew?" reminder (R-036). */
export function sweepRequest(
  r: SweepRequest,
  now: Date,
  t: Pick<Thresholds, 'anchor_timeout_s' | 'location_lost_min' | 'request_expiry_reminder_min'>,
): RequestSweepAction {
  if (now >= r.expiresAt) return { type: 'CLOSE', reason: 'EXPIRED' };
  if (!r.anchored && now.getTime() - r.createdAt.getTime() > t.anchor_timeout_s * 1000) {
    return { type: 'CLOSE', reason: 'NO_GPS_FIX' };
  }
  const alive = (r.lastPingAt ?? r.createdAt).getTime();
  if (now.getTime() - alive > t.location_lost_min * MIN) return { type: 'CLOSE', reason: 'LOCATION_LOST' };
  if (!r.expiryRemindedAt && r.expiresAt.getTime() - now.getTime() <= t.request_expiry_reminder_min * MIN) {
    return { type: 'REMIND_EXPIRY' };
  }
  return { type: 'NONE' };
}

/** R-036: renewing adds the TTL to the current expiry, at most `request_max_renewals` times. */
export function renewal(
  r: { expiresAt: Date; renewCount: number },
  now: Date,
  t: Pick<Thresholds, 'request_ttl_min' | 'request_max_renewals'>,
): Date | null {
  if (r.renewCount >= t.request_max_renewals || now >= r.expiresAt) return null;
  return new Date(r.expiresAt.getTime() + t.request_ttl_min * MIN);
}

/**
 * R-039: on MOVED_AWAY, every sharing driver who was within `pickup_radius_m` of the anchor during the
 * last 2 minutes (their rolling window) is recorded, all of them when several qualify.
 */
export function pickupCandidates(
  anchor: Point,
  drivers: readonly { driverUserId: string; fixes: readonly Pick<Fix, 'ts' | 'lat' | 'lng'>[] }[],
  closedAt: Date,
  t: Pick<Thresholds, 'pickup_radius_m' | 'driver_fresh_s'>,
): { driverUserId: string; minDistanceM: number }[] {
  const since = closedAt.getTime() - t.driver_fresh_s * 1000;
  const out: { driverUserId: string; minDistanceM: number }[] = [];
  for (const d of drivers) {
    let min = Number.POSITIVE_INFINITY;
    for (const f of d.fixes) {
      if (f.ts < since || f.ts > closedAt.getTime()) continue;
      min = Math.min(min, distanceM(anchor, f));
    }
    if (min <= t.pickup_radius_m) out.push({ driverUserId: d.driverUserId, minDistanceM: Math.round(min) });
  }
  return out;
}
