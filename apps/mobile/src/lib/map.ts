import type { LngLat } from '@maplibre/maplibre-react-native';

/** OpenFreeMap vector style (ADR-012); self-hosted PMTiles later (docs/architecture.md §2). */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/** Tunis city centre (a public landmark, not user data). */
export const TUNIS_CENTER: LngLat = [10.1815, 36.8065];
export const DEFAULT_ZOOM = 12;
