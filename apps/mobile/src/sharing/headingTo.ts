import type { Place } from '@fi-thnitek/contracts';
import { useSyncExternalStore } from 'react';

/**
 * "Heading to" chosen before starting (R-051), in memory only. While a session is active the choice
 * goes straight to the server instead (PATCH /v1/driver/sharing).
 */
interface State {
  place: Place | null;
  /** True while the place came from the routine suggestion (not picked by the driver). */
  suggested: boolean;
}

let current: State = { place: null, suggested: false };
/** A suggestion the driver removed is not offered again (until the app restarts). */
let dismissedSuggestion: string | null = null;
const listeners = new Set<() => void>();

function set(next: State): void {
  current = next;
  for (const listener of listeners) listener();
}

export function setHeadingTo(place: Place | null): void {
  if (!place && current.suggested && current.place) dismissedSuggestion = current.place.id;
  set({ place, suggested: false });
}

/** R-051: pre-fill from the routine departing around now, unless the driver chose or removed one. */
export function applySuggestedHeadingTo(place: Place | null): void {
  if (!place || current.place || place.id === dismissedSuggestion) return;
  set({ place, suggested: true });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHeadingTo(): Place | null {
  return useSyncExternalStore(subscribe, () => current.place);
}

export function useHeadingToSuggested(): boolean {
  return useSyncExternalStore(subscribe, () => current.suggested);
}
