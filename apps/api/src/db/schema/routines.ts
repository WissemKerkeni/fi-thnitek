import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { driverProfiles, transportType } from './drivers.js';
import { places } from './places.js';

export const routineKind = pgEnum('routine_kind', ['ONE_OFF', 'WEEKLY']);

/**
 * docs/domain-model.md § Routine routes (R-065…R-068). Weekly times are Tunis-local ("HH:MM") with
 * `days_mask` Mon = 1 … Sun = 64; occurrences are computed on the fly (packages/domain). Never a booking.
 */
export const driverRoutines = pgTable(
  'driver_routines',
  {
    id: uuid('id').primaryKey(),
    driverUserId: uuid('driver_user_id')
      .notNull()
      .references(() => driverProfiles.userId, { onDelete: 'cascade' }),
    transportType: transportType('transport_type').notNull(),
    fromPlaceId: uuid('from_place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'restrict' }),
    toPlaceId: uuid('to_place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'restrict' }),
    scheduleKind: routineKind('schedule_kind').notNull(),
    oneOffAt: timestamp('one_off_at', { withTimezone: true }),
    daysMask: smallint('days_mask'),
    localTime: text('local_time'),
    seats: integer('seats'),
    note: text('note'),
    active: boolean('active').notNull().default(true),
    /** The last sharing session that matched it, or the last "still running" answer (R-067). */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    stalePromptedAt: timestamp('stale_prompted_at', { withTimezone: true }),
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('driver_routines_driver_idx').on(t.driverUserId),
    index('driver_routines_to_idx').on(t.toPlaceId),
    check(
      'driver_routines_schedule',
      sql`(${t.scheduleKind} = 'ONE_OFF' AND ${t.oneOffAt} IS NOT NULL)
        OR (${t.scheduleKind} = 'WEEKLY' AND ${t.daysMask} BETWEEN 1 AND 127 AND ${t.localTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')`,
    ),
  ],
);
