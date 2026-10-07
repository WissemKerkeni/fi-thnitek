import type { TransportType } from '@fi-thnitek/contracts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * The vehicle type the passenger map shows (one at a time) and whether waiting passengers are shown.
 * Remembered on the phone; the request form starts from the same type.
 */
export interface MapFilter {
  type: TransportType;
  passengers: boolean;
}

const KEY = 'fi-thnitek.map-filter';
let filter: MapFilter = { type: 'TAXI', passengers: true };
const listeners = new Set<() => void>();

void AsyncStorage.getItem(KEY)
  .then((raw) => {
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<MapFilter>;
    if (saved.type === 'TAXI' || saved.type === 'LOUAGE' || saved.type === 'BUS') {
      setMapFilter({ type: saved.type, passengers: saved.passengers !== false });
    }
  })
  .catch(() => undefined);

export function setMapFilter(next: MapFilter): void {
  filter = next;
  for (const l of listeners) l();
  void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
}

export function mapFilter(): MapFilter {
  return filter;
}

export function useMapFilter(): MapFilter {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => filter,
  );
}
