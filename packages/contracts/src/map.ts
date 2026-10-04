import { z } from 'zod';
import { LatLng } from './places.js';
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

/** POST /v1/map (R-020…R-027), polled every 5 s while the map is visible. */
export const MapRequest = z.object({ bbox: BBox });
export type MapRequest = z.infer<typeof MapRequest>;

const PlaceNames = z.object({ nameAr: z.string(), nameFr: z.string() });

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
  headingTo: PlaceNames.nullable(),
  lineLabel: z.string().nullable(),
  plateDisplay: z.string(),
  updatedAgoS: z.number().int().nonnegative(),
  /** R-022 / R-066: the driver's next routine departure in the next 7 days. */
  nextRoutine: z
    .object({ toNameAr: z.string(), toNameFr: z.string(), at: z.iso.datetime() })
    .nullable(),
});
export type MapDriver = z.infer<typeof MapDriver>;

/** R-024: what sharing taxi/louage drivers of a requested type see. Name/note only if the passenger chose. */
export const ExactPassenger = z.object({
  id: z.uuid(),
  exact: z.literal(true),
  lat: z.number(),
  lng: z.number(),
  types: z.array(TransportType),
  destination: PlaceNames.nullable(),
  seats: z.number().int(),
  waitingMin: z.number().int().nonnegative(),
  distanceM: z.number().int().nonnegative(),
  /** Other available drivers of a matching type closer to this passenger than you. */
  closerDrivers: z.number().int().nonnegative(),
  name: z.string().nullable(),
  note: z.string().nullable(),
});
export type ExactPassenger = z.infer<typeof ExactPassenger>;

/** R-023: what everyone else sees: a ~100 m cell and the destination, never a name or note. */
export const ApproxPassenger = z.object({
  id: z.uuid(),
  exact: z.literal(false),
  lat: z.number(),
  lng: z.number(),
  types: z.array(TransportType),
  destination: PlaceNames.nullable(),
});
export type ApproxPassenger = z.infer<typeof ApproxPassenger>;

export const MapPassenger = z.discriminatedUnion('exact', [ExactPassenger, ApproxPassenger]);
export type MapPassenger = z.infer<typeof MapPassenger>;

/** R-020: beyond the live span, counts per cell instead of markers. */
export const MapCluster = z.object({
  lat: z.number(),
  lng: z.number(),
  count: z.number().int().positive(),
  byKind: z.object({
    TAXI: z.number().int(),
    LOUAGE: z.number().int(),
    BUS: z.number().int(),
    PASSENGER: z.number().int(),
  }),
});
export type MapCluster = z.infer<typeof MapCluster>;

export const MapView = z.object({
  /** True when the area is too wide for markers: only `clusters` are filled. */
  clustered: z.boolean(),
  drivers: z.array(MapDriver),
  passengers: z.array(MapPassenger),
  clusters: z.array(MapCluster),
});
export type MapView = z.infer<typeof MapView>;

// ---------- Destination finder (R-045, P2) ----------

/** POST /v1/finder. `near` is where the passenger is looking from (the map centre), never stored. */
export const FinderRequest = z.object({
  destination: z.object({ point: LatLng, placeId: z.uuid().nullable().default(null) }),
  near: LatLng.nullable().default(null),
});
export type FinderRequest = z.input<typeof FinderRequest>;

export const FinderDriver = MapDriver.extend({ distanceM: z.number().int().nullable() });
export type FinderDriver = z.infer<typeof FinderDriver>;

export const FinderDeparture = z.object({
  routineId: z.uuid(),
  driverName: z.string(),
  type: TransportType,
  plateDisplay: z.string(),
  from: PlaceNames,
  to: PlaceNames,
  at: z.iso.datetime(),
  seats: z.number().int().nullable(),
  note: z.string().nullable(),
});
export type FinderDeparture = z.infer<typeof FinderDeparture>;

export const FinderResponse = z.object({
  /** (a) Sharing drivers heading there now: available first, full last. */
  headingThere: z.array(FinderDriver),
  /** (b) Taxis nearby without a "heading to". */
  taxisNearby: z.array(FinderDriver),
  /** (c) Routine departures in the next 7 days, by time. */
  scheduled: z.array(FinderDeparture),
});
export type FinderResponse = z.infer<typeof FinderResponse>;
