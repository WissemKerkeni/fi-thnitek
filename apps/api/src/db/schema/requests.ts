import { REQUEST_STATUSES } from '@fi-thnitek/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { driverProfiles, transportType } from './drivers.js';
import { users } from './identity.js';
import { geographyPoint, places } from './places.js';

export const requestStatus = pgEnum('request_status', REQUEST_STATUSES);

/**
 * docs/domain-model.md § Passengers (R-030…R-042). Positions kept: the anchor and the latest point only,
 * no history (invariant 7). One OPEN request per passenger (partial unique index, invariant 1).
 */
export const passengerRequests = pgTable(
  'passenger_requests',
  {
    id: uuid('id').primaryKey(),
    passengerUserId: uuid('passenger_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    transportTypes: transportType('transport_types').array().notNull(),
    destinationPoint: geographyPoint('destination_point').notNull(),
    destinationLat: doublePrecision('destination_lat').notNull(),
    destinationLng: doublePrecision('destination_lng').notNull(),
    destinationPlaceId: uuid('destination_place_id').references(() => places.id, { onDelete: 'set null' }),
    seats: integer('seats').notNull().default(1),
    note: text('note'),
    showIdentity: boolean('show_identity').notNull().default(false),
    status: requestStatus('status').notNull().default('OPEN'),
    anchorPoint: geographyPoint('anchor_point'),
    anchorLat: doublePrecision('anchor_lat'),
    anchorLng: doublePrecision('anchor_lng'),
    anchorAccuracyM: real('anchor_accuracy_m'),
    visibleAt: timestamp('visible_at', { withTimezone: true }),
    lastPoint: geographyPoint('last_point'),
    lastLat: doublePrecision('last_lat'),
    lastLng: doublePrecision('last_lng'),
    lastAccuracyM: real('last_accuracy_m'),
    lastFixAt: timestamp('last_fix_at', { withTimezone: true }),
    /** Server time of the last ping that carried a fix (LOCATION_LOST, R-035). */
    lastPingAt: timestamp('last_ping_at', { withTimezone: true }),
    awaySince: timestamp('away_since', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    expiryRemindedAt: timestamp('expiry_reminded_at', { withTimezone: true }),
    renewCount: integer('renew_count').notNull().default(0),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    /** Retention (§4): points reduced to ~1 km cells, the latest point dropped. */
    coarsenedAt: timestamp('coarsened_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('passenger_requests_one_open')
      .on(t.passengerUserId)
      .where(sql`${t.status} = 'OPEN'`),
    index('passenger_requests_open_idx')
      .on(t.status)
      .where(sql`${t.status} = 'OPEN'`),
    index('passenger_requests_passenger_idx').on(t.passengerUserId, t.createdAt),
    index('passenger_requests_anchor_gist').using('gist', t.anchorPoint),
  ],
);

/**
 * R-039: sharing drivers who were within 50 m of a MOVED_AWAY request's anchor. **Admin-only** (every read
 * audited); never exposed through user endpoints (invariant 10).
 */
export const pickupRecords = pgTable(
  'pickup_records',
  {
    requestId: uuid('request_id')
      .notNull()
      .references(() => passengerRequests.id, { onDelete: 'cascade' }),
    driverUserId: uuid('driver_user_id')
      .notNull()
      .references(() => driverProfiles.userId, { onDelete: 'cascade' }),
    minDistanceM: integer('min_distance_m').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.driverUserId] })],
);
