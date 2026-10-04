import type { PlaceKind } from '@fi-thnitek/domain';

/** One place in a dataset file (data/places/*.json), as written by scripts/places-fetch-osm.ts. */
export interface PlaceRecord {
  /** Provenance and upsert key, e.g. `osm:node/123`. */
  source: string;
  kind: PlaceKind;
  nameAr: string;
  nameFr: string;
  aliases: string[];
  lat: number;
  lng: number;
  governorateCode: string | null;
  popularity: number;
}

export interface PlaceDataset {
  source: string;
  license: string;
  generatedAt: string;
  count: number;
  places: PlaceRecord[];
}
