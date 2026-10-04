import type { BBox } from '@fi-thnitek/contracts';
import type { LngLat, LngLatBounds } from '@maplibre/maplibre-react-native';

/** MapLibre bounds are [west, south, east, north] (GeoJSON order). */
export function bboxOf(bounds: LngLatBounds): BBox {
  const [west, south, east, north] = bounds;
  return { south, west, north, east };
}

/** A starting area around a centre before the map reports its real bounds (~6 km across). */
export function bboxAround([lng, lat]: LngLat, halfDeg = 0.03): BBox {
  return { south: lat - halfDeg, west: lng - halfDeg, north: lat + halfDeg, east: lng + halfDeg };
}

/** Rounded so tiny pans reuse the same query; 1e-3° ≈ 100 m. */
export function bboxKey(b: BBox): string {
  return [b.south, b.west, b.north, b.east].map((v) => v.toFixed(3)).join(',');
}
