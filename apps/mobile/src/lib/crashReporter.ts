import type { ClientErrorReport } from '@fi-thnitek/contracts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deviceInfo } from '../auth/device';
import { API_URL } from './config';
import { enqueueCrash, toCrashReport } from './crashes';

const KEY = 'fi-thnitek.crash-queue';
let screen: string | null = null;
let installed = false;

/** The route on screen, for the next report (set by the root layout). */
export function setCrashScreen(path: string): void {
  screen = path;
}

async function load(): Promise<ClientErrorReport[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as ClientErrorReport[];
  } catch {
    return [];
  }
}

/** Queues a scrubbed report; it is sent on the next launch or return to the app. Never throws. */
export async function recordCrash(error: unknown, fatal: boolean): Promise<void> {
  try {
    const queue = enqueueCrash(await load(), toCrashReport(error, fatal, screen, new Date()));
    await AsyncStorage.setItem(KEY, JSON.stringify(queue));
  } catch {
    // Reporting must never make things worse.
  }
}

/** Sends the queued reports to our own API (no third party, ADR-223) and clears them on success. */
export async function flushCrashes(): Promise<void> {
  const errors = await load();
  if (errors.length === 0) return;
  try {
    const res = await fetch(`${API_URL.replace(/\/+$/, '')}/v1/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...(await deviceInfo()), errors: errors.slice(0, 20) }),
    });
    // 4xx other than 429 will not get better on retry: drop them too.
    if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429))
      await AsyncStorage.removeItem(KEY);
  } catch {
    // Offline: try again next time.
  }
}

/** Catches uncaught JS errors (fatal or not), queues them, then lets React Native handle them as usual. */
export function installCrashReporter(): void {
  if (installed || typeof ErrorUtils === 'undefined') return;
  installed = true;
  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    void recordCrash(error, isFatal ?? false);
    previous(error, isFatal);
  });
}
