import { sql } from 'drizzle-orm';
import { boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const userStatus = pgEnum('user_status', ['ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED']);
export const locale = pgEnum('locale', ['ar', 'fr']);
export const platform = pgEnum('platform', ['android', 'ios', 'web']);

/** docs/domain-model.md § Identity. `email` is private: never returned by user endpoints, never logged. */
export const users = pgTable('users', {
  id: uuid('id').primaryKey(), // UUIDv7
  /** Null after a normal account deletion, so the same Google account can sign up again from scratch. */
  googleSub: text('google_sub').unique(),
  appleSub: text('apple_sub').unique(),
  email: text('email'),
  displayName: text('display_name'),
  locale: locale('locale').notNull().default('ar'),
  status: userStatus('status').notNull().default('ACTIVE'),
  /** Recomputed from ADMIN_EMAILS at every sign-in. */
  isAdmin: boolean('is_admin').notNull().default(false),
  termsAcceptedVersion: text('terms_accepted_version'),
  termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

/** R-004. `install_id` is a random per-install UUID (never a hardware ID); used later for per-device limits. */
export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    installId: uuid('install_id').notNull(),
    platform: platform('platform').notNull(),
    pushToken: text('push_token'),
    appVersion: text('app_version').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('devices_user_install_uq').on(t.userId, t.installId),
    index('devices_install_idx').on(t.installId),
  ],
);

/**
 * One row per refresh token. A sign-in starts a family (= a logical session, the `sid` of access tokens);
 * each refresh marks the presented row `rotated_at` and inserts the next one in the same family.
 * Presenting a rotated token revokes the whole family (reuse detection, docs/security.md §1).
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    familyId: uuid('family_id').notNull(),
    /** SHA-256 (hex) of the refresh token; the token itself is never stored. */
    refreshTokenHash: text('refresh_token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokeReason: text('revoke_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sessions_family_idx').on(t.familyId),
    index('sessions_user_active_idx')
      .on(t.userId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);
