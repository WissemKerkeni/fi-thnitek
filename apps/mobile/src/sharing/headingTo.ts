import type { Place } from '@fi-thnitek/contracts';
import { useSyncExternalStore } from 'react';

/**
 * "Heading to" chosen before starting (R-051), in memory only. While a session is active the choice
 * goes straight to the server instead (PATCH /v1/driver/sharing).
 */
let current: Place | null = null;
const listeners = new Set<() => void>();

export function setHeadingTo(place: Place | null): void {
  current = place;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHeadingTo(): Place | null {
  return useSyncExternalStore(subscribe, () => current);
}
