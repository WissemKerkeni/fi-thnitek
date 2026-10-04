import { WEEKDAYS } from '@fi-thnitek/domain';
import { z } from 'zod';
import { Place } from './places.js';
import { TransportType } from './verification.js';

export const Weekday = z.enum(WEEKDAYS);
export type Weekday = z.infer<typeof Weekday>;

/** Tunis-local "HH:MM" (24 h). */
export const LocalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const RoutineSchedule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ONE_OFF'), at: z.iso.datetime() }),
  z.object({ kind: z.literal('WEEKLY'), days: z.array(Weekday).min(1).max(7), localTime: LocalTime }),
]);
export type RoutineSchedule = z.infer<typeof RoutineSchedule>;

/** POST / PUT /v1/driver/routines (R-065). Never a booking (R-068). */
export const RoutineInput = z.object({
  fromPlaceId: z.uuid(),
  toPlaceId: z.uuid(),
  schedule: RoutineSchedule,
  seats: z.number().int().min(1).max(60).nullable().default(null),
  note: z.string().trim().max(80).nullable().default(null),
  active: z.boolean().default(true),
});
export type RoutineInput = z.input<typeof RoutineInput>;

export const RoutineView = z.object({
  id: z.uuid(),
  transportType: TransportType,
  from: Place,
  to: Place,
  schedule: RoutineSchedule,
  seats: z.number().int().nullable(),
  note: z.string().nullable(),
  active: z.boolean(),
  /** Hidden after an unanswered "Still running this route?" (R-067); reactivating shows it again. */
  hidden: z.boolean(),
  /** "Still running this route?" is waiting for an answer. */
  stillRunningPending: z.boolean(),
  /** Departures in the next 7 days (R-066). */
  nextOccurrences: z.array(z.iso.datetime()),
});
export type RoutineView = z.infer<typeof RoutineView>;

export const RoutineList = z.object({ routines: z.array(RoutineView), max: z.number().int() });
export type RoutineList = z.infer<typeof RoutineList>;

/** POST /v1/driver/routines/:id/still-running: yes keeps it, no deactivates it. */
export const StillRunningRequest = z.object({ running: z.boolean() });
export type StillRunningRequest = z.infer<typeof StillRunningRequest>;
