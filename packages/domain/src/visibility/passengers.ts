import type { Thresholds } from '../config/thresholds.js';
import { distanceM, type Point } from '../geo/distance.js';
import type { TransportType } from '../verification/documents.js';

const M_PER_DEG_LAT = 111_320;

/**
 * Snaps a point to the centre of its ~`gridM` cell (R-023). Deterministic, so the approximate marker does
 * not jitter between polls, and the exact spot cannot be averaged out of repeated answers.
 */
export function snapToGrid(p: Point, gridM: number): Point {
  const latStep = gridM / M_PER_DEG_LAT;
  const lat = (Math.floor(p.lat / latStep) + 0.5) * latStep;
  // Columns are sized at the cell's latitude so cells stay ~square.
  const lngStep = gridM / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  const lng = (Math.floor(p.lng / lngStep) + 0.5) * lngStep;
  return { lat: round6(lat), lng: round6(lng) };
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** Who is looking at the map. Driver accounts reach this only while sharing with a fresh fix. */
export type Viewer =
  { kind: 'PUBLIC' } | { kind: 'SHARING_DRIVER'; userId: string; type: TransportType; position: Point };

export interface RequestSource {
  id: string;
  passengerUserId: string;
  types: readonly TransportType[];
  anchor: Point;
  destination: { nameAr: string; nameFr: string } | null;
  seats: number;
  visibleAt: Date;
  showIdentity: boolean;
  /** The passenger's display name and note; only serialised with `showIdentity`. */
  name: string | null;
  note: string | null;
}

export interface SharingDriverPosition {
  userId: string;
  type: TransportType;
  isFull: boolean;
  position: Point;
}

/** What drivers who may pick the passenger up see (R-024). */
export interface ExactPassengerMarker {
  id: string;
  exact: true;
  lat: number;
  lng: number;
  types: TransportType[];
  destination: { nameAr: string; nameFr: string } | null;
  seats: number;
  waitingMin: number;
  distanceM: number;
  /** Other sharing, non-full drivers of a matching type closer to the passenger than the viewer. */
  closerDrivers: number;
  name: string | null;
  note: string | null;
}

/** What everyone else sees (R-023): a ~100 m cell and the destination, never a name or note. */
export interface ApproxPassengerMarker {
  id: string;
  exact: false;
  lat: number;
  lng: number;
  types: TransportType[];
  destination: { nameAr: string; nameFr: string } | null;
}

export type PassengerMarker = ExactPassengerMarker | ApproxPassengerMarker;

/** Exact coordinates only for sharing (not on break) taxi/louage drivers of a requested type (invariant 6). */
export function seesExactPosition(viewer: Viewer, r: Pick<RequestSource, 'types'>): boolean {
  return viewer.kind === 'SHARING_DRIVER' && viewer.type !== 'BUS' && r.types.includes(viewer.type);
}

/**
 * Per-viewer serialisation of one OPEN, anchored request (docs/architecture.md §5.1). Returns null for the
 * passenger's own request (they know where they are), and for a sharing driver of another type (a taxi
 * driver never sees louage requests; bus drivers see none, ADR-226): drivers only see passengers they
 * can take. Everyone else sees an approximate cell.
 */
export function passengerMarker(
  r: RequestSource,
  viewer: Viewer,
  sharingDrivers: readonly SharingDriverPosition[],
  now: Date,
  t: Pick<Thresholds, 'approx_grid_m'>,
): PassengerMarker | null {
  if (viewer.kind === 'SHARING_DRIVER' && viewer.userId === r.passengerUserId) return null;
  if (viewer.kind === 'SHARING_DRIVER' && !seesExactPosition(viewer, r)) return null;
  if (viewer.kind !== 'SHARING_DRIVER') {
    const cell = snapToGrid(r.anchor, t.approx_grid_m);
    return {
      id: r.id,
      exact: false,
      lat: cell.lat,
      lng: cell.lng,
      types: [...r.types],
      destination: r.destination,
    };
  }
  const mine = distanceM(viewer.position, r.anchor);
  const closerDrivers = sharingDrivers.filter(
    (d) =>
      d.userId !== viewer.userId &&
      !d.isFull &&
      r.types.includes(d.type) &&
      distanceM(d.position, r.anchor) < mine,
  ).length;
  return {
    id: r.id,
    exact: true,
    lat: r.anchor.lat,
    lng: r.anchor.lng,
    types: [...r.types],
    destination: r.destination,
    seats: r.seats,
    waitingMin: Math.max(0, Math.floor((now.getTime() - r.visibleAt.getTime()) / 60_000)),
    distanceM: Math.round(mine),
    closerDrivers,
    name: r.showIdentity ? r.name : null,
    note: r.showIdentity ? r.note : null,
  };
}
