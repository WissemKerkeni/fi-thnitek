import type { LatLng } from '@fi-thnitek/contracts';

/**
 * The centre of the passenger's map view, used as the finder's "near" (R-045). It is where the passenger
 * is looking, not their location: the passenger map never reads the phone's position (CLAUDE.md rule 7).
 */
let center: LatLng | null = null;

export function setMapCenter(next: LatLng): void {
  center = next;
}

export function mapCenter(): LatLng | null {
  return center;
}
