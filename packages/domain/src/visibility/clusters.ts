import type { Thresholds } from '../config/thresholds.js';
import type { BoundingBox } from './drivers.js';

export type ClusterKind = 'TAXI' | 'LOUAGE' | 'BUS' | 'PASSENGER';

export interface Cluster {
  /** The centre of the members, so the bubble sits where they are. */
  lat: number;
  lng: number;
  count: number;
  byKind: Record<ClusterKind, number>;
}

/**
 * R-020: beyond the live-map span, markers become counts per grid cell (N × N over the visible area).
 * Only counts and a centre leave the server, never an individual position.
 */
export function clusterPoints(
  points: readonly { lat: number; lng: number; kind: ClusterKind }[],
  bbox: BoundingBox,
  t: Pick<Thresholds, 'map_cluster_cells'>,
): Cluster[] {
  const n = t.map_cluster_cells;
  const dLat = (bbox.north - bbox.south) / n;
  const dLng = (bbox.east - bbox.west) / n;
  const cells = new Map<
    number,
    { lat: number; lng: number; count: number; byKind: Record<ClusterKind, number> }
  >();
  for (const p of points) {
    if (p.lat < bbox.south || p.lat > bbox.north || p.lng < bbox.west || p.lng > bbox.east) continue;
    const row = Math.min(n - 1, Math.floor((p.lat - bbox.south) / dLat));
    const col = Math.min(n - 1, Math.floor((p.lng - bbox.west) / dLng));
    const key = row * n + col;
    const cell = cells.get(key) ?? {
      lat: 0,
      lng: 0,
      count: 0,
      byKind: { TAXI: 0, LOUAGE: 0, BUS: 0, PASSENGER: 0 },
    };
    cell.lat += p.lat;
    cell.lng += p.lng;
    cell.count += 1;
    cell.byKind[p.kind] += 1;
    cells.set(key, cell);
  }
  return [...cells.values()].map((c) => ({
    lat: Math.round((c.lat / c.count) * 1e4) / 1e4,
    lng: Math.round((c.lng / c.count) * 1e4) / 1e4,
    count: c.count,
    byKind: c.byKind,
  }));
}
