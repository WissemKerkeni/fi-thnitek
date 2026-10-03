import type { LatLng, Place } from '@fi-thnitek/contracts';
import { useSyncExternalStore } from 'react';

/**
 * The destination chosen on P2 or with "pick on map". In memory only (never persisted, never sent until a
 * request exists): a destination is not the user's position, but it is still personal.
 */
export interface Destination {
  point: LatLng;
  /** The searched place, or the closest known place to a pin dropped on the map. */
  place: Place | null;
  /** Pin → `place` distance; 0 when the place itself was chosen. */
  distanceM: number | null;
}

let current: Destination | null = null;
const listeners = new Set<() => void>();

export function setDestination(next: Destination | null): void {
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDestination(): Destination | null {
  return useSyncExternalStore(subscribe, () => current);
}
