import type { Thresholds } from '../config/thresholds.js';
import { distanceM, type Point } from '../geo/distance.js';
import type { TransportType } from '../verification/documents.js';

/** Local flat projection (metres) around `origin`: precise enough for corridors of a few tens of km. */
function toXY(p: Point, origin: Point): { x: number; y: number } {
  const k = Math.cos((origin.lat * Math.PI) / 180);
  return { x: (p.lng - origin.lng) * 111_320 * k, y: (p.lat - origin.lat) * 110_574 };
}

/**
 * Where `d` falls along the segment from → to: `progress` 0 at `from`, 1 at `to`, and the distance from
 * the segment's line (`offsetM`).
 */
export function alongSegment(from: Point, to: Point, d: Point): { progress: number; offsetM: number } {
  const b = toXY(to, from);
  const p = toXY(d, from);
  const len2 = b.x * b.x + b.y * b.y;
  if (len2 === 0) return { progress: 0, offsetM: Math.hypot(p.x, p.y) };
  const progress = (p.x * b.x + p.y * b.y) / len2;
  const cx = progress * b.x;
  const cy = progress * b.y;
  return { progress, offsetM: Math.hypot(p.x - cx, p.y - cy) };
}

const isTaxi = (type: TransportType) => type === 'TAXI';

export interface FinderDriver {
  type: TransportType;
  position: Point;
  headingTo: Point | null;
  isFull: boolean;
}

/**
 * R-045(a), docs/architecture.md §5.2: a driver is heading to D when their "heading to" is near D, or when
 * D lies in the corridor from their position to their "heading to", ahead of them (and ahead of the
 * passenger, when the passenger's position is known).
 */
export function isHeadingTo(
  driver: Pick<FinderDriver, 'type' | 'position' | 'headingTo'>,
  destination: Point,
  origin: Point | null,
  t: Pick<
    Thresholds,
    | 'finder_near_urban_m'
    | 'finder_near_intercity_m'
    | 'finder_corridor_urban_m'
    | 'finder_corridor_intercity_m'
  >,
): boolean {
  if (!driver.headingTo) return false;
  const near = isTaxi(driver.type) ? t.finder_near_urban_m : t.finder_near_intercity_m;
  if (distanceM(driver.headingTo, destination) <= near) return true;
  const width = isTaxi(driver.type) ? t.finder_corridor_urban_m : t.finder_corridor_intercity_m;
  const d = alongSegment(driver.position, driver.headingTo, destination);
  if (d.offsetM > width || d.progress <= 0 || d.progress > 1) return false;
  if (!origin) return true;
  return d.progress > alongSegment(driver.position, driver.headingTo, origin).progress;
}

/** R-045: drivers further from the passenger than this are not offered (taxi 5 km, louage/bus 15 km). */
export function withinFinderRadius(
  driver: Pick<FinderDriver, 'type' | 'position'>,
  origin: Point | null,
  t: Pick<Thresholds, 'finder_radius_taxi_m' | 'finder_radius_intercity_m'>,
): boolean {
  if (!origin) return true;
  return (
    distanceM(driver.position, origin) <=
    (isTaxi(driver.type) ? t.finder_radius_taxi_m : t.finder_radius_intercity_m)
  );
}

export type FinderGroup = 'HEADING_THERE' | 'TAXI_NEARBY' | null;

/** Which finder list a live driver belongs to, if any (R-045 a/b). */
export function finderGroup(
  driver: FinderDriver,
  destination: Point,
  origin: Point | null,
  t: Pick<
    Thresholds,
    | 'finder_near_urban_m'
    | 'finder_near_intercity_m'
    | 'finder_corridor_urban_m'
    | 'finder_corridor_intercity_m'
    | 'finder_radius_taxi_m'
    | 'finder_radius_intercity_m'
  >,
): FinderGroup {
  if (!withinFinderRadius(driver, origin, t)) return null;
  if (isHeadingTo(driver, destination, origin, t)) return 'HEADING_THERE';
  if (isTaxi(driver.type) && !driver.headingTo) return 'TAXI_NEARBY';
  return null;
}

/** R-045(d): available drivers first, full ones last; then by distance. */
export function finderOrder<T extends { isFull: boolean; distanceM: number | null }>(a: T, b: T): number {
  if (a.isFull !== b.isFull) return a.isFull ? 1 : -1;
  return (a.distanceM ?? Number.POSITIVE_INFINITY) - (b.distanceM ?? Number.POSITIVE_INFINITY);
}

/** R-045(c): a routine goes there when its destination is near D (and its origin near the passenger). */
export function routineMatches(
  routine: { from: Point; to: Point },
  destination: Point,
  origin: Point | null,
  t: Pick<Thresholds, 'finder_routine_m'>,
): boolean {
  if (distanceM(routine.to, destination) > t.finder_routine_m) return false;
  return !origin || distanceM(routine.from, origin) <= t.finder_routine_m;
}
