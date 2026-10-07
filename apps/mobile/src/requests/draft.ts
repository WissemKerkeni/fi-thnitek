import type { RequestableType } from '@fi-thnitek/contracts';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** The options of the request sheet (P3), kept for "Post again" and the remembered name toggle (R-030). */
export interface RequestOptions {
  types: RequestableType[];
  seats: number;
  note: string;
  showIdentity: boolean;
}

export const DEFAULT_OPTIONS: RequestOptions = {
  // ADR-225: one type, chosen on the form (it starts from the type shown on the map).
  types: [],
  seats: 1,
  note: '',
  showIdentity: false,
};

let pending: RequestOptions | null = null;

/** "Post again" pre-fills the next sheet once. */
export function setNextRequestOptions(options: RequestOptions): void {
  pending = options;
}

export function takeNextRequestOptions(): RequestOptions | null {
  const next = pending;
  pending = null;
  return next;
}

const IDENTITY_KEY = 'fi-thnitek.request.show-identity';
const EXPLAINER_KEY = 'fi-thnitek.request.explainer-seen';

/** R-030: the last choice of "show my name and note" is remembered (off by default). */
export async function loadShowIdentity(): Promise<boolean> {
  return (await AsyncStorage.getItem(IDENTITY_KEY).catch(() => null)) === 'true';
}

export function saveShowIdentity(value: boolean): void {
  void AsyncStorage.setItem(IDENTITY_KEY, String(value)).catch(() => undefined);
}

/** The "how it works" explanation is shown on the first request only (docs/ux.md P3). */
export async function explainerSeen(): Promise<boolean> {
  return (await AsyncStorage.getItem(EXPLAINER_KEY).catch(() => null)) === 'true';
}

export function markExplainerSeen(): void {
  void AsyncStorage.setItem(EXPLAINER_KEY, 'true').catch(() => undefined);
}
