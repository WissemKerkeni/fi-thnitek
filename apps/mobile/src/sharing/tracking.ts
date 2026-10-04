import type { DeviceTracking, PingsResponse } from '@fi-thnitek/contracts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { signedInApi } from '../auth/client';
import { colors } from '../theme/tokens';
import {
  type BufferState,
  EMPTY_BUFFER,
  type Fix,
  acknowledge,
  appendFixes,
  nextBatch,
  toFix,
} from './buffer';

/**
 * Location while sharing (driver, R-052) or while a request is open (passenger, R-032), CLAUDE.md rule 7:
 * started only by the user's own tap, inside an Android foreground service with a visible notification;
 * never background location. Fixes go to an on-device buffer (oldest first) and are uploaded after each
 * delivery; the server infers which mode applies. A driver account never has requests, so one task serves
 * both.
 */
export const SHARING_TASK = 'fi-thnitek.sharing-location';
const BUFFER_KEY = 'fi-thnitek.sharing.buffer';
const CADENCE_KEY = 'fi-thnitek.sharing.cadence';
/** Uploads per task run at most (each ≤ 400 fixes), so a long backlog drains without blocking the task. */
const MAX_UPLOADS_PER_RUN = 3;

interface LocationTaskData {
  locations: Location.LocationObject[];
}

const stoppedListeners = new Set<(response: PingsResponse) => void>();

/** The server ended the session (or it is on break): the app refreshes its status. */
export function onTrackingStopped(listener: (response: PingsResponse) => void): () => void {
  stoppedListeners.add(listener);
  return () => stoppedListeners.delete(listener);
}

// Must run at startup (imported by app/_layout.tsx) so Android can deliver fixes to it.
TaskManager.defineTask<LocationTaskData>(SHARING_TASK, async ({ data, error }) => {
  if (error || !data) return;
  await record(data.locations.map(toFix));
  await flush();
});

/** Buffer reads and writes are serialised: the task and the screens share it. */
let queue: Promise<unknown> = Promise.resolve();
function withBuffer<T>(fn: (state: BufferState) => [BufferState, T]): Promise<T> {
  const run = queue.then(async () => {
    const raw = await AsyncStorage.getItem(BUFFER_KEY);
    const [next, result] = fn(raw ? (JSON.parse(raw) as BufferState) : EMPTY_BUFFER);
    await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(next));
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

async function cadence(): Promise<DeviceTracking | null> {
  const raw = await AsyncStorage.getItem(CADENCE_KEY);
  return raw ? (JSON.parse(raw) as DeviceTracking) : null;
}

async function record(fixes: Fix[]): Promise<void> {
  const c = await cadence();
  if (!c || fixes.length === 0) return;
  await withBuffer((state) => [appendFixes(state, fixes, c, Date.now()), undefined]);
}

let flushing: Promise<void> | null = null;

/** Uploads the buffer, oldest first. Failures keep the fixes for the next run (the offline buffer). */
export function flush(): Promise<void> {
  flushing ??= upload().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function upload(): Promise<void> {
  const locationServicesOn = await Location.hasServicesEnabledAsync().catch(() => true);
  for (let i = 0; i < MAX_UPLOADS_PER_RUN; i += 1) {
    const batch = await withBuffer((state) => [state, nextBatch(state)]);
    if (batch.length === 0 && locationServicesOn) return;
    let response: PingsResponse;
    try {
      response = await signedInApi.sendPings({ fixes: batch, locationServicesOn });
    } catch {
      return; // Offline, rate limited or signed out: keep the buffer.
    }
    const left = await withBuffer((state) => {
      const next = acknowledge(state, batch);
      return [next, next.pending.length];
    });
    if (response.stop) {
      await stopTracking();
      for (const listener of stoppedListeners) listener(response);
      return;
    }
    if (left === 0) return;
  }
}

export async function isTracking(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(SHARING_TASK);
  } catch {
    return false;
  }
}

/** Starts the foreground service. Call only from a visible screen after the driver's own action. */
export async function startTracking(
  c: DeviceTracking,
  notification: { title: string; body: string },
): Promise<void> {
  await AsyncStorage.setItem(CADENCE_KEY, JSON.stringify(c));
  if (await isTracking()) return;
  await Location.startLocationUpdatesAsync(SHARING_TASK, {
    accuracy: Location.Accuracy.High,
    // Deliver every moving interval even when still; the buffer keeps one per 30 s when stationary.
    timeInterval: c.movingIntervalS * 1000,
    distanceInterval: 0,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: notification.title,
      notificationBody: notification.body,
      notificationColor: colors.primary,
      // Swiping the app away stops the service: the server then sees the gap (R-057).
      killServiceOnDestroy: true,
    },
  });
}

/** Stops the service and forgets unsent fixes (they would be refused after a stop or break anyway). */
export async function stopTracking(): Promise<void> {
  if (await isTracking()) await Location.stopLocationUpdatesAsync(SHARING_TASK).catch(() => undefined);
  await withBuffer(() => [EMPTY_BUFFER, undefined]);
}

export type PermissionResult = 'granted' | 'denied' | 'services-off';

/** While-in-use permission only (no background location, CLAUDE.md rule 7), and GPS switched on. */
export async function ensureLocationPermission(): Promise<PermissionResult> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== Location.PermissionStatus.GRANTED) return 'denied';
  if (!(await Location.hasServicesEnabledAsync())) {
    // Android shows the system "turn on location" dialog.
    await Location.enableNetworkProviderAsync().catch(() => undefined);
    if (!(await Location.hasServicesEnabledAsync())) return 'services-off';
  }
  return 'granted';
}

const FIX_TIMEOUT_MS = 20_000;

/** A fresh fix for start/resume ("a fresh fix", R-050), or null when none came in time. */
export async function currentFix(): Promise<Fix | null> {
  const fix = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).then(toFix);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS));
  return Promise.race([fix, timeout]).catch(() => null);
}
