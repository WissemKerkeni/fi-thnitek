import { REPORT_CATEGORIES, REPORT_SOURCES, REPORT_STATUSES, SANCTION_TYPES } from '@fi-thnitek/domain';
import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { passengerRequests } from './requests.js';
import { sharingSessions } from './sharing.js';

export const reportSource = pgEnum('report_source', REPORT_SOURCES);
export const reportCategory = pgEnum('report_category', REPORT_CATEGORIES);
export const reportStatus = pgEnum('report_status', REPORT_STATUSES);
export const reportPriority = pgEnum('report_priority', ['HIGH', 'NORMAL']);
export const sanctionType = pgEnum('sanction_type', SANCTION_TYPES);
export const blockKind = pgEnum('block_kind', ['DRIVER', 'PASSENGER']);
export const appealStatus = pgEnum('appeal_status', ['OPEN', 'CLOSED']);

/**
 * docs/domain-model.md § Moderation (R-070). `target_user_id` is null for reports filed from history:
 * the admin finds the other person through the pick-up records.
 */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey(),
    reporterUserId: uuid('reporter_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    source: reportSource('source').notNull(),
    category: reportCategory('category').notNull(),
    priority: reportPriority('priority').notNull(),
    description: text('description').notNull().default(''),
    requestId: uuid('request_id').references(() => passengerRequests.id, { onDelete: 'set null' }),
    sessionId: uuid('session_id').references(() => sharingSessions.id, { onDelete: 'set null' }),
    approxAt: timestamp('approx_at', { withTimezone: true }),
    status: reportStatus('status').notNull().default('OPEN'),
    resolutionNote: text('resolution_note'),
    handledBy: uuid('handled_by').references(() => users.id, { onDelete: 'set null' }),
    handledAt: timestamp('handled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reports_queue_idx').on(t.status, t.priority, t.createdAt),
    index('reports_target_idx').on(t.targetUserId, t.createdAt),
    index('reports_reporter_idx').on(t.reporterUserId, t.createdAt),
  ],
);

/**
 * Warnings, request pauses (the only automatic sanction, `created_by` null), suspensions and bans.
 * `users.status` always follows the sanctions in force (`statusFromSanctions`).
 */
export const sanctions = pgTable(
  'sanctions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: sanctionType('type').notNull(),
    reason: text('reason').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    reportId: uuid('report_id').references(() => reports.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => users.id, { onDelete: 'set null' }),
    revokeReason: text('revoke_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sanctions_user_idx').on(t.userId),
    index('sanctions_live_idx')
      .on(t.endsAt)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

/** R-027 / R-071: either direction hides both people from each other's map and finder. */
export const blocks = pgTable(
  'blocks',
  {
    id: uuid('id').primaryKey(),
    blockerUserId: uuid('blocker_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedUserId: uuid('blocked_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: blockKind('kind').notNull(),
    /** A passenger's name only when they had chosen to show it on that request; a driver's public name. */
    label: text('label'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('blocks_pair_uq').on(t.blockerUserId, t.blockedUserId),
    index('blocks_blocked_idx').on(t.blockedUserId),
    check('blocks_not_self', sql`${t.blockerUserId} <> ${t.blockedUserId}`),
  ],
);

/** R-073, the contact form of a suspended or banned person. One OPEN appeal per user. */
export const appeals = pgTable(
  'appeals',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sanctionId: uuid('sanction_id').references(() => sanctions.id, { onDelete: 'set null' }),
    message: text('message').notNull(),
    status: appealStatus('status').notNull().default('OPEN'),
    handledBy: uuid('handled_by').references(() => users.id, { onDelete: 'set null' }),
    handledAt: timestamp('handled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('appeals_open_uq')
      .on(t.userId)
      .where(sql`${t.status} = 'OPEN'`),
  ],
);
