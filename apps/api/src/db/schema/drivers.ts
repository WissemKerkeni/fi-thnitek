import { DOCUMENT_TYPES, TRANSPORT_TYPES, VERIFICATION_STATES } from '@fi-thnitek/domain';
import { date, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';

export const transportType = pgEnum('transport_type', TRANSPORT_TYPES);
export const verificationStatus = pgEnum('verification_status', VERIFICATION_STATES);
export const documentType = pgEnum('document_type', DOCUMENT_TYPES);
export const documentStatus = pgEnum('document_status', ['PENDING', 'ACCEPTED', 'REJECTED']);

/**
 * docs/domain-model.md § Drivers. The CIN is never stored in clear: `cin_hmac` (unique) for R-064,
 * `cin_encrypted` (AES-256-GCM) for the admin review, `cin_last4` for display.
 */
export const driverProfiles = pgTable('driver_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  legalFirstName: text('legal_first_name').notNull(),
  legalLastName: text('legal_last_name').notNull(),
  cinHmac: text('cin_hmac').notNull().unique(),
  cinLast4: text('cin_last4').notNull(),
  cinEncrypted: text('cin_encrypted').notNull(),
  transportType: transportType('transport_type').notNull(),
  status: verificationStatus('status').notNull().default('DRAFT'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  decisionReason: text('decision_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One vehicle per driver for now; `plate_normalized` is unique across drivers (R-064). Only the plate is asked. */
export const vehicles = pgTable('vehicles', {
  id: uuid('id').primaryKey(),
  driverUserId: uuid('driver_user_id')
    .notNull()
    .unique()
    .references(() => driverProfiles.userId, { onDelete: 'cascade' }),
  transportType: transportType('transport_type').notNull(),
  plateNormalized: text('plate_normalized').notNull().unique(),
  plateDisplay: text('plate_display').notNull(),
  /** From the transport type (taxi 4, louage 8, bus null), not asked (ADR-216). */
  seats: integer('seats'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Sanitised document photos live in the private bucket under `storage_key` (no PII in the key).
 * `sha256` of the stored bytes flags the same file reused by another account (R-064).
 */
export const driverDocuments = pgTable(
  'driver_documents',
  {
    id: uuid('id').primaryKey(),
    driverUserId: uuid('driver_user_id')
      .notNull()
      .references(() => driverProfiles.userId, { onDelete: 'cascade' }),
    type: documentType('type').notNull(),
    storageKey: text('storage_key').notNull().unique(),
    sha256: text('sha256').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    status: documentStatus('status').notNull().default('PENDING'),
    reason: text('reason'),
    expiresOn: date('expires_on', { mode: 'string' }),
    /** Last expiry-reminder push (one per document per expiry date). */
    remindedAt: timestamp('reminded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  },
  (t) => [
    index('driver_documents_driver_idx').on(t.driverUserId),
    index('driver_documents_sha_idx').on(t.sha256),
  ],
);
