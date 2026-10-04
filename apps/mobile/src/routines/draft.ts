import type { Place } from '@fi-thnitek/contracts';
import { useSyncExternalStore } from 'react';

/** The two places of the routine being edited, chosen through the destination search / pick-on-map. */
export interface RoutinePlaces {
  from: Place | null;
  to: Place | null;
}

let current: RoutinePlaces = { from: null, to: null };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function resetRoutinePlaces(places: RoutinePlaces): void {
  current = places;
  emit();
}

export function setRoutinePlace(which: keyof RoutinePlaces, place: Place): void {
  current = { ...current, [which]: place };
  emit();
}

export function swapRoutinePlaces(): void {
  current = { from: current.to, to: current.from };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRoutinePlaces(): RoutinePlaces {
  return useSyncExternalStore(subscribe, () => current);
}
