import { distanceM, normalizeSearchText } from '@fi-thnitek/domain';
import type { PlaceRecord } from './place-record.js';

/** OSM often maps one station twice (a point and an area): same kind and name this close = one place. */
const SAME_PLACE_M = 200;

/**
 * Keeps the first record (by `source` order) of each group of places with the same kind and the same
 * folded French name within 200 m. Unnamed taxi ranks share a generic name, so only ranks closer
 * than 200 m to each other merge: they serve the same street corner.
 */
export function dedupePlaces(records: readonly PlaceRecord[]): PlaceRecord[] {
  const kept: PlaceRecord[] = [];
  const byKey = new Map<string, PlaceRecord[]>();
  for (const r of [...records].sort((a, b) => a.source.localeCompare(b.source))) {
    const key = `${r.kind}|${normalizeSearchText(r.nameFr)}`;
    const same = byKey.get(key) ?? [];
    if (same.some((o) => distanceM(o, r) < SAME_PLACE_M)) continue;
    same.push(r);
    byKey.set(key, same);
    kept.push(r);
  }
  return kept;
}
