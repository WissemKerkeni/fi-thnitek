import type { Thresholds } from '../config/thresholds.js';
import { distanceM } from '../geo/distance.js';
import { isFixFresh } from '../sharing-rules/fixes.js';
import type { SharingState } from '../sharing-rules/session.js';
import type { TransportType } from '../verification/documents.js';
import { type VerificationState, isDriverOnlyAccount } from '../verification/verification.js';

export interface MapViewer {
  verification: VerificationState | null;
  /** The viewer's own active session, if any. */
  session: { state: Exclude<SharingState, 'ENDED'>; lastFixTs: number | null } | null;
}

export type MapAccess = 'ALLOWED' | 'SHARING_REQUIRED';

/**
 * R-026 / invariant 4: a driver account sees the live map only while sharing (not on break) with a fresh
 * fix. Everyone else (passengers, drivers whose file is not approved yet) may look at it.
 */
export function liveMapAccess(
  viewer: MapViewer,
  now: number,
  t: Pick<Thresholds, 'driver_fresh_s'>,
): MapAccess {
  if (!isDriverOnlyAccount(viewer.verification)) return 'ALLOWED';
  const s = viewer.session;
  return s?.state === 'SHARING' && isFixFresh(s.lastFixTs, now, t) ? 'ALLOWED' : 'SHARING_REQUIRED';
}

/** Drivers are on the map only while sharing (not on break) with a fresh fix (R-020, R-055). */
export function isDriverVisible(
  state: SharingState,
  lastFixTs: number | null,
  now: number,
  t: Pick<Thresholds, 'driver_fresh_s'>,
): boolean {
  return state === 'SHARING' && isFixFresh(lastFixTs, now, t);
}

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** True when the visible area is too large for live markers (R-020: "zoom in"). */
export function isMapSpanTooWide(b: BoundingBox, t: Pick<Thresholds, 'map_max_span_km'>): boolean {
  const midLat = (b.north + b.south) / 2;
  const widthM = distanceM({ lat: midLat, lng: b.west }, { lat: midLat, lng: b.east });
  const heightM = distanceM({ lat: b.south, lng: b.west }, { lat: b.north, lng: b.west });
  return Math.max(widthM, heightM) > t.map_max_span_km * 1000;
}

export interface DriverMarkerSource {
  sessionId: string;
  type: TransportType;
  lat: number;
  lng: number;
  headingDeg: number | null;
  displayName: string | null;
  legalFirstName: string;
  isFull: boolean;
  headingTo: { nameAr: string; nameFr: string } | null;
  lineLabel: string | null;
  plateDisplay: string;
  fixTs: number;
  /** The next routine departure in the next 7 days (R-066), if any. */
  nextRoutine?: { toNameAr: string; toNameFr: string; at: Date } | null;
}

export interface DriverMarker {
  id: string;
  type: TransportType;
  lat: number;
  lng: number;
  headingDeg: number | null;
  name: string;
  isFull: boolean;
  headingTo: { nameAr: string; nameFr: string } | null;
  lineLabel: string | null;
  plateDisplay: string;
  updatedAgoS: number;
  nextRoutine: { toNameAr: string; toNameFr: string; at: string } | null;
}

/**
 * What every viewer sees of a sharing driver (R-022, invariant 9): the name is always present (the chosen
 * display name, else the legal first name), the bus line only for buses, and no user id, CIN or document.
 */
export function driverMarker(s: DriverMarkerSource, now: number): DriverMarker {
  return {
    id: s.sessionId,
    type: s.type,
    lat: s.lat,
    lng: s.lng,
    headingDeg: s.headingDeg,
    name: s.displayName?.trim() || s.legalFirstName,
    isFull: s.isFull,
    headingTo: s.headingTo,
    lineLabel: s.type === 'BUS' ? s.lineLabel : null,
    plateDisplay: s.plateDisplay,
    updatedAgoS: Math.max(0, Math.round((now - s.fixTs) / 1000)),
    nextRoutine: s.nextRoutine
      ? {
          toNameAr: s.nextRoutine.toNameAr,
          toNameFr: s.nextRoutine.toNameFr,
          at: s.nextRoutine.at.toISOString(),
        }
      : null,
  };
}
