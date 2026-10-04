import { SESSION_END_REASONS, SESSION_EVENT_TYPES } from '@fi-thnitek/domain';
import { z } from 'zod';
import { Place } from './places.js';
import { TransportType } from './verification.js';

export const SessionEndReason = z.enum(SESSION_END_REASONS);
export type SessionEndReason = z.infer<typeof SessionEndReason>;

export const SessionEventType = z.enum(SESSION_EVENT_TYPES);
export type SessionEventType = z.infer<typeof SessionEventType>;

export const StartBlocker = z.enum([
  'NOT_VERIFIED',
  'ACCOUNT_SUSPENDED',
  'NO_VEHICLE',
  'ALREADY_SHARING',
  'COOLDOWN',
]);
export type StartBlocker = z.infer<typeof StartBlocker>;

/** One location fix (sent in bodies only, never in URLs: CLAUDE.md rule 8). `ts` is epoch milliseconds. */
export const FixInput = z.object({
  ts: z.number().int().positive(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(100_000).nullable(),
  speedMps: z.number().min(0).max(1_000).nullable().default(null),
  headingDeg: z.number().min(0).max(360).nullable().default(null),
  isMock: z.boolean().default(false),
});
export type FixInput = z.input<typeof FixInput>;

const LineLabel = z.string().trim().min(1).max(24);

/** POST /v1/driver/sharing/start (R-050, R-051). */
export const StartSharingRequest = z.object({
  fix: FixInput,
  headingToPlaceId: z.uuid().nullable().default(null),
  /** Bus only: the line shown on the marker (e.g. "L20"). */
  lineLabel: LineLabel.nullable().default(null),
});
export type StartSharingRequest = z.input<typeof StartSharingRequest>;

/** PATCH /v1/driver/sharing: "heading to" and the bus line can change while sharing. */
export const UpdateSharingRequest = z.object({
  headingToPlaceId: z.uuid().nullable().optional(),
  lineLabel: LineLabel.nullable().optional(),
});
export type UpdateSharingRequest = z.input<typeof UpdateSharingRequest>;

export const SetFullRequest = z.object({ isFull: z.boolean() });
export type SetFullRequest = z.infer<typeof SetFullRequest>;

export const StartBreakRequest = z.object({ minutes: z.number().int().positive() });
export type StartBreakRequest = z.infer<typeof StartBreakRequest>;

export const ResumeSharingRequest = z.object({ fix: FixInput });
export type ResumeSharingRequest = z.input<typeof ResumeSharingRequest>;

export const SessionView = z.object({
  id: z.uuid(),
  state: z.enum(['SHARING', 'ON_BREAK']),
  transportType: TransportType,
  plateDisplay: z.string(),
  isFull: z.boolean(),
  headingTo: Place.nullable(),
  lineLabel: z.string().nullable(),
  startedAt: z.iso.datetime(),
  lastFixAt: z.iso.datetime().nullable(),
  /** False while no recent fix arrived: the driver is hidden and sees "Reconnecting…". */
  fresh: z.boolean(),
  breakUntil: z.iso.datetime().nullable(),
  /** After this, an unresumed break ends the session (no cooldown). */
  resumeDeadline: z.iso.datetime().nullable(),
  /** "Still working?" is waiting for an answer (R-058). */
  stillWorkingPending: z.boolean(),
});
export type SessionView = z.infer<typeof SessionView>;

/** How the phone records and uploads fixes; comes from the server thresholds (R-052). */
export const DeviceTracking = z.object({
  movingIntervalS: z.number().int().positive(),
  stationaryIntervalS: z.number().int().positive(),
  distanceFilterM: z.number().int().positive(),
  bufferMaxMin: z.number().int().positive(),
});
export type DeviceTracking = z.infer<typeof DeviceTracking>;

/** GET /v1/driver/sharing (D3/D4) and the answer to every sharing action. */
export const SharingStatus = z.object({
  session: SessionView.nullable(),
  /** The driver's vehicle (null until the driver file has one). */
  vehicle: z.object({ transportType: TransportType, plateDisplay: z.string() }).nullable(),
  /** R-051: the destination of a routine departing within ±60 min, to pre-fill "heading to". */
  suggestedHeadingTo: Place.nullable(),
  /** Why "Start sharing" is unavailable (empty when it is available or a session is active). */
  blockers: z.array(StartBlocker),
  cooldownUntil: z.iso.datetime().nullable(),
  lastEnded: z.object({ reason: SessionEndReason, endedAt: z.iso.datetime() }).nullable(),
  breakOptionsMin: z.array(z.number().int().positive()),
  tracking: DeviceTracking,
});
export type SharingStatus = z.infer<typeof SharingStatus>;

/** POST /v1/location/pings: a batch from the phone's offline buffer, oldest first (≤ 60 min at 10 s). */
export const PingsRequest = z.object({
  fixes: z.array(FixInput).max(500),
  locationServicesOn: z.boolean(),
});
export type PingsRequest = z.input<typeof PingsRequest>;

/** Why the phone must stop: a driver session end, a passenger request closure, or no active mode. */
export const PingStopReason = z.union([
  SessionEndReason,
  z.enum(['MOVED_AWAY', 'LOCATION_LOST', 'NO_GPS_FIX', 'EXPIRED', 'CANCELLED', 'REMOVED']),
  z.enum(['NOT_SHARING', 'ON_BREAK']),
]);
export type PingStopReason = z.infer<typeof PingStopReason>;

/** `stop: true` → the phone stops its location service and drops its buffer. */
export const PingsResponse = z.object({
  stop: z.boolean(),
  reason: PingStopReason.nullable(),
  cooldownUntil: z.iso.datetime().nullable(),
});
export type PingsResponse = z.infer<typeof PingsResponse>;

// ---------- Admin ("Drivers → sessions") ----------

export const AdminSession = z.object({
  id: z.uuid(),
  driverUserId: z.uuid(),
  driverName: z.string(),
  transportType: TransportType,
  plateDisplay: z.string(),
  state: z.enum(['SHARING', 'ON_BREAK', 'ENDED']),
  isFull: z.boolean(),
  breaksCount: z.number().int(),
  startedAt: z.iso.datetime(),
  lastFixAt: z.iso.datetime().nullable(),
  endedAt: z.iso.datetime().nullable(),
  endReason: SessionEndReason.nullable(),
  cooldownApplied: z.boolean(),
  /** The driver's current cooldown (null when none or already over). */
  driverCooldownUntil: z.iso.datetime().nullable(),
});
export type AdminSession = z.infer<typeof AdminSession>;

export const AdminSessionQuery = z.object({
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  driverUserId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type AdminSessionQuery = z.input<typeof AdminSessionQuery>;

export const AdminSessionList = z.object({ sessions: z.array(AdminSession), total: z.number().int() });
export type AdminSessionList = z.infer<typeof AdminSessionList>;

/** Session audit trail (no coordinates). */
export const SessionEventView = z.object({
  type: SessionEventType,
  at: z.iso.datetime(),
  meta: z.record(z.string(), z.unknown()),
});
export type SessionEventView = z.infer<typeof SessionEventView>;

export const AdminSessionDetail = AdminSession.extend({ events: z.array(SessionEventView) });
export type AdminSessionDetail = z.infer<typeof AdminSessionDetail>;

/** GET /v1/driver/sharing/history (R-070): the driver's own sessions of the last 30 days. No positions. */
export const SharingHistory = z.object({
  sessions: z.array(
    z.object({
      id: z.uuid(),
      transportType: TransportType,
      headingTo: Place.nullable(),
      startedAt: z.iso.datetime(),
      endedAt: z.iso.datetime().nullable(),
      endReason: SessionEndReason.nullable(),
      breaksCount: z.number().int(),
    }),
  ),
});
export type SharingHistory = z.infer<typeof SharingHistory>;
