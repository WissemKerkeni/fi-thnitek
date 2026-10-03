import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  type Thresholds,
  expiredDocuments,
  expiringSoon,
  tunisDate,
  verificationMachine,
} from '@fi-thnitek/domain';
import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { driverDocuments, driverProfiles } from '../db/schema/index.js';
import { PushService } from '../notifications/push.service.js';
import { THRESHOLDS } from '../config/thresholds.provider.js';

/**
 * R-064, daily (docs/architecture.md §7): reminders before accepted documents expire, and VERIFIED → EXPIRED
 * once one has expired (no sharing until re-approved). Idempotent: safe to run more than once a day.
 */
@Injectable()
export class DocumentExpiryJob {
  private readonly logger = new Logger(DocumentExpiryJob.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(THRESHOLDS) private readonly thresholds: Thresholds,
    private readonly push: PushService,
    private readonly audit: AuditService,
  ) {}

  @Cron('0 7 * * *', { name: 'document-expiry', timeZone: 'Africa/Tunis' })
  async handleCron(): Promise<void> {
    await this.run();
  }

  async run(now = new Date()): Promise<{ expired: number; reminded: number }> {
    const today = tunisDate(now);
    const horizon = new Date(`${today}T00:00:00Z`);
    horizon.setUTCDate(horizon.getUTCDate() + this.thresholds.document_expiry_reminder_days);
    const until = horizon.toISOString().slice(0, 10);

    const rows = await this.db
      .select({
        id: driverDocuments.id,
        userId: driverDocuments.driverUserId,
        type: driverDocuments.type,
        status: driverDocuments.status,
        expiresOn: driverDocuments.expiresOn,
        remindedAt: driverDocuments.remindedAt,
        profileStatus: driverProfiles.status,
      })
      .from(driverDocuments)
      .innerJoin(driverProfiles, eq(driverProfiles.userId, driverDocuments.driverUserId))
      .where(
        and(
          eq(driverDocuments.status, 'ACCEPTED'),
          inArray(driverProfiles.status, ['VERIFIED']),
          lte(driverDocuments.expiresOn, until),
        ),
      );

    let expired = 0;
    let reminded = 0;
    for (const userId of new Set(rows.map((r) => r.userId))) {
      const docs = rows.filter((r) => r.userId === userId);
      if (expiredDocuments(docs, today).length > 0) {
        const changed = await this.db.transaction(async (tx) => {
          const next = verificationMachine.transition('VERIFIED', 'DOCUMENT_EXPIRED');
          const updated = await tx
            .update(driverProfiles)
            .set({ status: next, updatedAt: now })
            .where(and(eq(driverProfiles.userId, userId), eq(driverProfiles.status, 'VERIFIED')))
            .returning({ userId: driverProfiles.userId });
          if (updated.length === 1) {
            await this.audit.record(
              { actorType: 'SYSTEM', action: 'verification.expire', targetType: 'driver', targetId: userId },
              tx,
            );
          }
          return updated.length === 1;
        });
        if (changed) {
          expired += 1;
          await this.push.notifyUser(userId, 'DOCUMENT_EXPIRED');
        }
        continue;
      }

      const soon = new Set(expiringSoon(docs, today, this.thresholds.document_expiry_reminder_days));
      const due = docs.filter((d) => soon.has(d.type) && d.remindedAt === null).map((d) => d.id);
      if (due.length === 0) continue;
      const marked = await this.db
        .update(driverDocuments)
        .set({ remindedAt: now })
        .where(and(inArray(driverDocuments.id, due), isNull(driverDocuments.remindedAt)))
        .returning({ id: driverDocuments.id });
      if (marked.length > 0) {
        reminded += 1;
        await this.push.notifyUser(userId, 'DOCUMENT_EXPIRING');
      }
    }
    if (expired + reminded > 0) this.logger.log({ expired, reminded }, 'document expiry run');
    return { expired, reminded };
  }
}
