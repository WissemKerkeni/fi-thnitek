import { readFileSync } from 'node:fs';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Locale, catalogs } from '@fi-thnitek/i18n';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { type App, cert, initializeApp } from 'firebase-admin/app';
import { type Messaging, getMessaging } from 'firebase-admin/messaging';
import type { Env } from '../config/env.js';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { devices, users } from '../db/schema/index.js';

/** Push events. Payloads carry only this code and generic localised text: no names, IDs or places (rule 8). */
export type PushEvent =
  | 'VERIFICATION_APPROVED'
  | 'VERIFICATION_CHANGES_REQUESTED'
  | 'VERIFICATION_REJECTED'
  | 'DOCUMENT_EXPIRING'
  | 'DOCUMENT_EXPIRED'
  | 'SHARING_ENDED'
  | 'BREAK_OVER'
  | 'STILL_WORKING'
  | 'ROUTINE_STALE'
  | 'REQUEST_CLOSED'
  | 'REQUEST_EXPIRING'
  | 'REQUEST_PAUSED'
  | 'SANCTION_WARNING'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_BANNED';

const TEXT_KEY: Record<PushEvent, keyof (typeof catalogs)['fr']['push']> = {
  VERIFICATION_APPROVED: 'verificationApproved',
  VERIFICATION_CHANGES_REQUESTED: 'verificationChangesRequested',
  VERIFICATION_REJECTED: 'verificationRejected',
  DOCUMENT_EXPIRING: 'documentExpiring',
  DOCUMENT_EXPIRED: 'documentExpired',
  SHARING_ENDED: 'sharingEnded',
  BREAK_OVER: 'breakOver',
  STILL_WORKING: 'stillWorking',
  ROUTINE_STALE: 'routineStale',
  REQUEST_CLOSED: 'requestClosed',
  REQUEST_EXPIRING: 'requestExpiring',
  REQUEST_PAUSED: 'requestPaused',
  SANCTION_WARNING: 'sanctionWarning',
  ACCOUNT_SUSPENDED: 'accountSuspended',
  ACCOUNT_BANNED: 'accountBanned',
};

/** What a transport receives: already localised, already PII-free. */
export interface PushMessage {
  tokens: string[];
  title: string;
  body: string;
  data: { event: PushEvent };
}

export interface PushTransport {
  send(message: PushMessage): Promise<{ invalidTokens: string[] }>;
}

/** FCM via the Firebase Admin SDK. */
export class FcmTransport implements PushTransport {
  private readonly messaging: Messaging;

  constructor(serviceAccountFile: string) {
    const app: App = initializeApp({
      credential: cert(JSON.parse(readFileSync(serviceAccountFile, 'utf8')) as object),
    });
    this.messaging = getMessaging(app);
  }

  async send(message: PushMessage): Promise<{ invalidTokens: string[] }> {
    const result = await this.messaging.sendEachForMulticast({
      tokens: message.tokens,
      notification: { title: message.title, body: message.body },
      data: message.data,
      android: { priority: 'high' },
    });
    const invalidTokens = result.responses.flatMap((r, i) =>
      !r.success && r.error?.code === 'messaging/registration-token-not-registered'
        ? [message.tokens[i]!]
        : [],
    );
    return { invalidTokens };
  }
}

/** Used when no Firebase credentials are configured (dev, tests): records instead of sending. */
export class RecordingTransport implements PushTransport {
  readonly sent: PushMessage[] = [];
  private readonly logger = new Logger('Push');

  send(message: PushMessage): Promise<{ invalidTokens: string[] }> {
    this.sent.push(message);
    this.logger.log(
      { event: message.data.event, devices: message.tokens.length },
      'push not sent (no FCM configured)',
    );
    return Promise.resolve({ invalidTokens: [] });
  }
}

export const PUSH_TRANSPORT = Symbol('PUSH_TRANSPORT');

export function createPushTransport(env: Pick<Env, 'FIREBASE_SERVICE_ACCOUNT_FILE'>): PushTransport {
  return env.FIREBASE_SERVICE_ACCOUNT_FILE
    ? new FcmTransport(env.FIREBASE_SERVICE_ACCOUNT_FILE)
    : new RecordingTransport();
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PUSH_TRANSPORT) private readonly transport: PushTransport,
  ) {}

  /** Best effort: a failed push never fails the action that triggered it (the in-app status is the truth). */
  async notifyUser(userId: string, event: PushEvent): Promise<void> {
    try {
      const rows = await this.db
        .select({ token: devices.pushToken, locale: users.locale })
        .from(devices)
        .innerJoin(users, eq(users.id, devices.userId))
        .where(and(eq(devices.userId, userId), isNotNull(devices.pushToken)));
      const tokens = rows.map((r) => r.token!).filter(Boolean);
      if (tokens.length === 0) return;
      const locale: Locale = rows[0]?.locale ?? 'ar';
      const text = catalogs[locale].push[TEXT_KEY[event]];
      const { invalidTokens } = await this.transport.send({
        tokens,
        title: catalogs[locale].app.name,
        body: text,
        data: { event },
      });
      if (invalidTokens.length > 0) {
        await this.db
          .update(devices)
          .set({ pushToken: null })
          .where(inArray(devices.pushToken, invalidTokens));
      }
    } catch (error) {
      this.logger.warn({ err: error, event }, 'push failed');
    }
  }
}
