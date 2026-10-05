import { REQUESTABLE_TYPES, REQUEST_BLOCKERS, REQUEST_STATUSES } from '@fi-thnitek/domain';
import { z } from 'zod';
import { LatLng, Place } from './places.js';

export const RequestStatus = z.enum(REQUEST_STATUSES);
export type RequestStatus = z.infer<typeof RequestStatus>;

export const RequestableType = z.enum(REQUESTABLE_TYPES);
export type RequestableType = z.infer<typeof RequestableType>;

export const RequestBlocker = z.enum(REQUEST_BLOCKERS);
export type RequestBlocker = z.infer<typeof RequestBlocker>;

/** Where the passenger is going: a pin, named after a known place when there is one. */
export const RequestDestination = z.object({
  point: LatLng,
  placeId: z.uuid().nullable().default(null),
});

/** POST /v1/requests (R-030). The origin is always the phone's own location, never sent here. */
export const CreateRequestInput = z.object({
  destination: RequestDestination,
  types: z
    .array(RequestableType)
    .min(1)
    .max(2)
    .refine((xs) => new Set(xs).size === xs.length, 'types must be unique'),
  seats: z.number().int().min(1).max(8).default(1),
  note: z.string().trim().max(80).nullable().default(null),
  /** "Show my name and note to drivers": off by default (anonymous). */
  showIdentity: z.boolean().default(false),
});
export type CreateRequestInput = z.input<typeof CreateRequestInput>;

/** The passenger's own request (never shown to anyone else in this shape). */
export const RequestView = z.object({
  id: z.uuid(),
  status: RequestStatus,
  types: z.array(RequestableType),
  seats: z.number().int(),
  note: z.string().nullable(),
  showIdentity: z.boolean(),
  destination: z.object({ point: LatLng, place: Place.nullable() }),
  /** Visible to drivers only once anchored (R-033). */
  anchored: z.boolean(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  renewalsLeft: z.number().int().nonnegative(),
  closedAt: z.iso.datetime().nullable(),
});
export type RequestView = z.infer<typeof RequestView>;

/** How the phone records fixes while the request is open (R-032), from the server thresholds. */
export const PassengerTracking = z.object({
  intervalS: z.number().int().positive(),
  distanceFilterM: z.number().int().positive(),
  bufferMaxMin: z.number().int().positive(),
});
export type PassengerTracking = z.infer<typeof PassengerTracking>;

/** GET /v1/requests/current (P4/P5). */
export const CurrentRequest = z.object({
  request: RequestView.nullable(),
  /** The last closed request of the past 12 h, for the closure screen and "Post again". */
  lastClosed: RequestView.nullable(),
  /** Why posting is unavailable right now (empty when it is available). */
  blockers: z.array(RequestBlocker),
  /** When `PAUSED` is among the blockers: the end of the pause. */
  pausedUntil: z.iso.datetime().nullable(),
  tracking: PassengerTracking,
});
export type CurrentRequest = z.infer<typeof CurrentRequest>;

/** GET /v1/requests/history (R-042): the passenger's own requests of the last 30 days. */
export const RequestHistory = z.object({
  requests: z.array(
    z.object({
      id: z.uuid(),
      status: RequestStatus,
      types: z.array(RequestableType),
      destination: Place.nullable(),
      createdAt: z.iso.datetime(),
      closedAt: z.iso.datetime().nullable(),
    }),
  ),
});
export type RequestHistory = z.infer<typeof RequestHistory>;
