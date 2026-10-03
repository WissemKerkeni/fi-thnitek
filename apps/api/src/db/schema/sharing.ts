import { SESSION_END_REASONS, SESSION_EVENT_TYPES, SHARING_STATES } from '@fi-thnitek/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { driverProfiles, transportType, vehicles } from './drivers.js';
import { users } from './identity.js';
import { geographyPoint, places } from './places.js';

export const sharingState = pgEnum('sharing_state', SHARING_STATES);
export const sessionEndReason = pgEnum('session_end_reason', SESSION_END_REASONS);
export const sessionEventType = pgEnum('session_event_type', SESSION_EVENT_TYPES);
export const riskFlagType = pgEnum('risk_flag_type', [
  'MOCK_LOCATION',
  'IMPOSSIBLE_JUMP',
  'MULTI_ACCOUNT_DEVICE',
  'NOBODY_THERE_CLUSTER',
]);

/**
 * docs/domain-model.md § Sharing. Metadata only: positions live in `driver_live_locations` while the
 * session is active and are deleted when it ends. One active session per driver (partial unique index).
 */
export const sharingSessions = pgTable(
  'sharing_sessions',
  {
    id: uuid('id').primaryKey(),
    driverUserId: uuid('driver_user_id')
      .notNull()
      .references(() => driverProfiles.userId, { onDelete: 'cascade' }),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    transportType: transportType('transport_type').notNull(),
    headingToPlaceId: uuid('heading_to_place_id').references(() => places.id, { onDelete: 'set null' }),
    lineLabel: text('line_label'),
    state: sharingState('state').notNull().default('SHARING'),
    isFull: boolean('is_full').notNull().default(false),
    breakStartedAt: timestamp('break_started_at', { withTimezone: true }),
    breakUntil: timestamp('break_until', { withTimezone: true }),
    breakRemindedAt: timestamp('break_reminded_at', { withTimezone: true }),
    breaksCount: integer('breaks_count').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    lastFixAt: timestamp('last_fix_at', { withTimezone: true }),
    stillWorkingPromptedAt: timestamp('still_working_prompted_at', { withTimezone: true }),
    stillWorkingConfirmedAt: timestamp('still_working_confirmed_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endReason: sessionEndReason('end_reason'),
    cooldownApplied: boolean('cooldown_applied').notNull().default(false),
  },
  (t) => [
    uniqueIndex('sharing_sessions_one_active')
      .on(t.driverUserId)
      .where(sql`${t.endedAt} IS NULL`),
    index('sharing_sessions_active_idx')
      .on(t.state)
      .where(sql`${t.endedAt} IS NULL`),
    index('sharing_sessions_driver_idx').on(t.driverUserId, t.startedAt),
  ],
);

/** The session's audit trail. Never coordinates (docs/security.md). */
export const sessionEvents = pgTable(
  'session_events',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sharingSessions.id, { onDelete: 'cascade' }),
    type: sessionEventType('type').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('session_events_session_idx').on(t.sessionId, t.at)],
);

/** A fix in the rolling window (`recent_fixes`). */
export interface StoredFix {
  ts: number;
  lat: number;
  lng: number;
  accuracyM: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  isMock: boolean;
}

/**
 * Hot table: the latest point of each sharing driver (+ the last ~2 min of fixes for pick-up records).
 * Overwritten on every batch, deleted at break start and session end. There is no history table.
 */
export const driverLiveLocations = pgTable(
  'driver_live_locations',
  {
    driverUserId: uuid('driver_user_id')
      .primaryKey()
      .references(() => driverProfiles.userId, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sharingSessions.id, { onDelete: 'cascade' }),
    transportType: transportType('transport_type').notNull(),
    point: geographyPoint('point').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    accuracyM: real('accuracy_m'),
    headingDeg: real('heading_deg'),
    speedMps: real('speed_mps'),
    fixTs: timestamp('fix_ts', { withTimezone: true }).notNull(),
    recentFixes: jsonb('recent_fixes').$type<StoredFix[]>().notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('driver_live_locations_point_gist').using('gist', t.point)],
);

/** Automatic suspicion flags for admin review (docs/anti-abuse.md). Evidence holds measurements, not positions. */
export const riskFlags = pgTable(
  'risk_flags',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: riskFlagType('type').notNull(),
    sessionId: uuid('session_id').references(() => sharingSessions.id, { onDelete: 'set null' }),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  },
  (t) => [index('risk_flags_user_idx').on(t.userId)],
);
