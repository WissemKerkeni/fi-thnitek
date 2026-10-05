import type { Thresholds } from '../config/thresholds.js';
import type { Point } from '../geo/distance.js';
import { snapToGrid } from '../visibility/passengers.js';

const DAY = 86_400_000;

type RetentionThresholds = Pick<
  Thresholds,
  'request_coarsen_days' | 'session_retention_days' | 'pickup_retention_days' | 'client_error_retention_days'
>;

/** docs/domain-model.md §4: what is older than these instants is coarsened or deleted. */
export function retentionCutoffs(now: Date, t: RetentionThresholds) {
  return {
    /** Closed requests closed before this keep only coarse points. */
    coarsenRequestsBefore: new Date(now.getTime() - t.request_coarsen_days * DAY),
    /** Ended sharing sessions (and their events) ended before this are deleted. */
    purgeSessionsBefore: new Date(now.getTime() - t.session_retention_days * DAY),
    /** Pick-up records older than this are deleted unless an open report needs them. */
    purgePickupsBefore: new Date(now.getTime() - t.pickup_retention_days * DAY),
    /** Crash reports received before this are deleted. */
    purgeClientErrorsBefore: new Date(now.getTime() - t.client_error_retention_days * DAY),
  };
}

/**
 * After `request_coarsen_days`, a closed request keeps only the centre of a ~1 km cell for its anchor
 * and destination (the place id keeps the destination's name); the latest point is dropped.
 */
export function coarsenRequest(
  r: { anchor: Point | null; destination: Point },
  t: Pick<Thresholds, 'request_coarse_grid_m'>,
): { anchor: Point | null; destination: Point } {
  return {
    anchor: r.anchor ? snapToGrid(r.anchor, t.request_coarse_grid_m) : null,
    destination: snapToGrid(r.destination, t.request_coarse_grid_m),
  };
}
