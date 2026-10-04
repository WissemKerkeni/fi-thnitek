import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { platform } from './identity.js';

/**
 * Phase 9 crash monitoring, kept in-house (no data transfer abroad, ADR-223). Scrubbed on the phone
 * and again before insert; no user id, no position. Deleted after `client_error_retention_days`.
 */
export const clientErrors = pgTable(
  'client_errors',
  {
    id: uuid('id').primaryKey(),
    fingerprint: text('fingerprint').notNull(),
    name: text('name').notNull(),
    message: text('message').notNull(),
    stack: text('stack'),
    screen: text('screen'),
    fatal: boolean('fatal').notNull(),
    installId: uuid('install_id').notNull(),
    platform: platform('platform').notNull(),
    appVersion: text('app_version').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('client_errors_received_idx').on(t.receivedAt),
    index('client_errors_fingerprint_idx').on(t.fingerprint, t.receivedAt),
  ],
);
