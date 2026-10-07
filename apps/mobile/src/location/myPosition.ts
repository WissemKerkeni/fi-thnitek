import type { LatLng } from '@fi-thnitek/contracts';
import * as Location from 'expo-location';
import { useSyncExternalStore } from 'react';

/**
 * ADR-224: the phone's own position, read on the device while the app is open (no background, no
 * service), to open the map where the person is and to measure distances. It is never stored or
 * logged by the app or the server; it leaves the phone only as `near` in a search body.
 */
let position: LatLng | null = null;
const listeners = new Set<() => void>();

function publish(next: LatLng): void {
  position = next;
  for (const l of listeners) l();
}

export type LocationStatus = 'ok' | 'denied' | 'blocked' | 'services-off';

/** Without asking: is location usable right now? `blocked` = refused for good (settings only). */
export async function locationStatus(): Promise<LocationStatus> {
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    return permission.canAskAgain ? 'denied' : 'blocked';
  }
  return (await Location.hasServicesEnabledAsync()) ? 'ok' : 'services-off';
}

/** Asks for the permission and, on Android, to switch location on. */
export async function requestLocation(): Promise<LocationStatus> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    return permission.canAskAgain ? 'denied' : 'blocked';
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    await Location.enableNetworkProviderAsync().catch(() => undefined);
    if (!(await Location.hasServicesEnabledAsync())) return 'services-off';
  }
  return 'ok';
}

/** The last known position at once (if any), then a fresh one. Resolves with the freshest. */
export async function refreshPosition(): Promise<LatLng | null> {
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
    if (last) publish({ lat: last.coords.latitude, lng: last.coords.longitude });
    const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    publish({ lat: fresh.coords.latitude, lng: fresh.coords.longitude });
  } catch {
    // Keep the last one: an indoor timeout must not blank the map.
  }
  return position;
}

export function myPosition(): LatLng | null {
  return position;
}

export function useMyPosition(): LatLng | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => position,
  );
}
