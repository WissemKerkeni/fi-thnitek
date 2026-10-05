import { PLACE_KINDS } from '@fi-thnitek/domain';
import { z } from 'zod';

export const PlaceKind = z.enum(PLACE_KINDS);
export type PlaceKind = z.infer<typeof PlaceKind>;

/** WGS84. Sent in request bodies only, never in URLs (CLAUDE.md rule 8). */
export const LatLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLng>;

/** A public place (city, station…): its position is not personal data. */
export const Place = z.object({
  id: z.uuid(),
  kind: PlaceKind,
  nameAr: z.string(),
  nameFr: z.string(),
  governorateCode: z.string().nullable(),
  location: LatLng,
});
export type Place = z.infer<typeof Place>;

/** POST /v1/places/search (R-011). `near` only biases the ranking; it is not stored or logged. */
export const PlaceSearchRequest = z.object({
  q: z.string().trim().min(1).max(80),
  near: LatLng.optional(),
  kinds: z.array(PlaceKind).max(PLACE_KINDS.length).optional(),
  limit: z.number().int().min(1).max(20).default(8),
});
export type PlaceSearchRequest = z.input<typeof PlaceSearchRequest>;

/** A search result; `distanceM` from `near` when it was given (ADR-224). */
export const PlaceHit = Place.extend({ distanceM: z.number().int().nullable() });
export type PlaceHit = z.infer<typeof PlaceHit>;

/**
 * `nearestKind` is set when the query asked for a type of place only ("station louage", "taxi"):
 * the results are then the nearest places of that kind to `near`, closest first.
 */
export const PlaceSearchResponse = z.object({
  places: z.array(PlaceHit),
  nearestKind: PlaceKind.nullable(),
});
export type PlaceSearchResponse = z.infer<typeof PlaceSearchResponse>;

/** POST /v1/places/nearest: "pick on map" names the dropped pin after the closest place. */
export const NearestPlaceRequest = z.object({
  point: LatLng,
  maxDistanceM: z.number().int().min(100).max(50_000).default(5_000),
});
export type NearestPlaceRequest = z.input<typeof NearestPlaceRequest>;

export const NearestPlaceResponse = z.object({
  place: Place.nullable(),
  distanceM: z.number().nullable(),
});
export type NearestPlaceResponse = z.infer<typeof NearestPlaceResponse>;

// ---------- Admin ("Content → Places") ----------

export const AdminPlace = Place.extend({
  aliases: z.array(z.string()),
  popularity: z.number().int().min(0).max(100),
  /** Provenance, e.g. `osm:node/123` or `admin`. */
  source: z.string(),
});
export type AdminPlace = z.infer<typeof AdminPlace>;

export const PlaceInput = z.object({
  kind: PlaceKind,
  nameAr: z.string().trim().min(1).max(120),
  nameFr: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  location: LatLng,
  governorateCode: z
    .string()
    .regex(/^TN-\d{2}$/)
    .nullable()
    .default(null),
  popularity: z.number().int().min(0).max(100).optional(),
});
export type PlaceInput = z.input<typeof PlaceInput>;

export const AdminPlaceList = z.object({ places: z.array(AdminPlace), total: z.number().int() });
export type AdminPlaceList = z.infer<typeof AdminPlaceList>;

/** GET /v1/admin/places query string (names only, never coordinates). */
export const AdminPlaceQuery = z.object({
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type AdminPlaceQuery = z.input<typeof AdminPlaceQuery>;
