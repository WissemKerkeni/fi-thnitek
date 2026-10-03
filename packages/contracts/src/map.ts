import { z } from 'zod';
import { TransportType } from './verification.js';

/** The visible map area. Sent in the POST body (never in the URL: CLAUDE.md rule 8). */
export const BBox = z
  .object({
    south: z.number().min(-90).max(90),
    west: z.number().min(-180).max(180),
    north: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180),
  })
  .refine((b) => b.north > b.south && b.east > b.west, 'north/east must exceed south/west');
export type BBox = z.infer<typeof BBox>;

/** POST /v1/map/drivers (R-020…R-022), polled every 5 s while the map is visible. */
export const MapDriversRequest = z.object({ bbox: BBox });
export type MapDriversRequest = z.infer<typeof MapDriversRequest>;

/** A sharing driver as everyone sees them (R-022): the name is always present. */
export const MapDriver = z.object({
  /** The sharing session id (stable while the driver shares; not the user id). */
  id: z.uuid(),
  type: TransportType,
  lat: z.number(),
  lng: z.number(),
  headingDeg: z.number().nullable(),
  name: z.string(),
  isFull: z.boolean(),
  headingTo: z.object({ nameAr: z.string(), nameFr: z.string() }).nullable(),
  lineLabel: z.string().nullable(),
  plateDisplay: z.string(),
  updatedAgoS: z.number().int().nonnegative(),
});
export type MapDriver = z.infer<typeof MapDriver>;

export const MapDriversResponse = z.object({
  drivers: z.array(MapDriver),
  /** The area is wider than the live-map limit: zoom in to see drivers. */
  tooWide: z.boolean(),
});
export type MapDriversResponse = z.infer<typeof MapDriversResponse>;
