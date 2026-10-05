import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { CreateSanctionInput } from '@fi-thnitek/contracts';
import { type Thresholds, isSanctionActive, sanctionEndsAt, statusFromSanctions } from '@fi-thnitek/domain';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/api-exception.js';
import { THRESHOLDS } from '../config/thresholds.provider.js';
import type { Database, Tx } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { reports, riskFlags, sanctions, users } from '../db/schema/index.js';
import { type PushEvent, PushService } from '../notifications/push.service.js';
import { RequestsService } from '../requests/requests.service.js';
import { SharingService } from '../sharing/sharing.service.js';
import { UsersService } from '../users/users.service.js';

const PUSH_BY_TYPE: Record<'WARNING' | 'SUSPENSION' | 'BAN' | 'REQUEST_PAUSE', PushEvent> = {
  WARNING: 'SANCTION_WARNING',
  SUSPENSION: 'ACCOUNT_SUSPENDED',
  BAN: 'ACCOUNT_BANNED',
  REQUEST_PAUSE: 'REQUEST_PAUSED',
};

/**
 * Applies and lifts sanctions (anti-abuse §1.3): automation may only pause requesting; warnings,
 * suspensions and bans are admin decisions, audited. `users.status` always follows the sanctions in force.
 */
@Injectable()
export class SanctionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(THRESHOLDS) private readonly t: Thresholds,
    private readonly audit: AuditService,
    private readonly push: PushService,
    private readonly usersService: UsersService,
    private readonly sharing: SharingService,
    private readonly requests: RequestsService,
  ) {}

  /** An admin warning, suspension or ban. A suspension or ban signs the person out everywhere. */
  async apply(
    userId: string,
    input: z.output<typeof CreateSanctionInput>,
    adminId: string,
    now = new Date(),
  ): Promise<string> {
    if (userId === adminId) throw new ApiException('FORBIDDEN', HttpStatus.FORBIDDEN, 'Not on yourself');
    const id = await this.db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
      if (!user || user.status === 'DELETED') throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);

      const sanctionId = uuidv7();
      await tx.insert(sanctions).values({
        id: sanctionId,
        userId,
        type: input.type,
        reason: input.reason,
        startsAt: now,
        endsAt: sanctionEndsAt(input.type, now, input.days, this.t),
        createdBy: adminId,
        reportId: input.reportId,
      });
      if (input.reportId) {
        await tx
          .update(reports)
          .set({ status: 'ACTIONED', handledBy: adminId, handledAt: now })
          .where(and(eq(reports.id, input.reportId), eq(reports.status, 'OPEN')));
      }
      if (input.type !== 'WARNING') await this.enforce(tx, userId, input.type, now);
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorUserId: adminId,
          action: 'sanction.create',
          targetType: 'user',
          targetId: userId,
          metadata: { sanctionId, type: input.type, days: input.days, reportId: input.reportId },
        },
        tx,
      );
      return sanctionId;
    });
    await this.push.notifyUser(userId, PUSH_BY_TYPE[input.type]);
    return id;
  }

  /**
   * Anti-abuse §3: the automatic 24 h request pause after repeated "nobody there". Runs inside the
   * report's transaction; the open request (if any) is removed. Returns false when a pause is already on.
   */
  async pauseRequestsLocked(
    tx: Tx,
    userId: string,
    evidence: Record<string, unknown>,
    now: Date,
  ): Promise<boolean> {
    const live = await tx
      .select()
      .from(sanctions)
      .where(
        and(eq(sanctions.userId, userId), eq(sanctions.type, 'REQUEST_PAUSE'), isNull(sanctions.revokedAt)),
      );
    if (live.some((s) => isSanctionActive(s, now))) return false;
    await tx.insert(sanctions).values({
      id: uuidv7(),
      userId,
      type: 'REQUEST_PAUSE',
      reason: 'NOBODY_THERE_REPORTS',
      startsAt: now,
      endsAt: sanctionEndsAt('REQUEST_PAUSE', now, null, this.t),
      createdBy: null,
    });
    await tx.insert(riskFlags).values({ id: uuidv7(), userId, type: 'NOBODY_THERE_CLUSTER', evidence });
    await this.requests.removeOpenLocked(tx, userId, now);
    await this.audit.record(
      {
        actorType: 'SYSTEM',
        action: 'sanction.request_pause',
        targetType: 'user',
        targetId: userId,
        metadata: evidence,
      },
      tx,
    );
    return true;
  }

  async notifyPaused(userId: string): Promise<void> {
    await this.push.notifyUser(userId, PUSH_BY_TYPE.REQUEST_PAUSE);
  }

  /** Lifts a sanction early (an appeal, a mistake). The account status follows. Audited. */
  async revoke(sanctionId: string, reason: string, adminId: string, now = new Date()): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [s] = await tx.select().from(sanctions).where(eq(sanctions.id, sanctionId)).for('update');
      if (!s) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
      if (s.revokedAt !== null) throw new ApiException('CONFLICT', HttpStatus.CONFLICT, 'Already revoked');
      await tx.select({ id: users.id }).from(users).where(eq(users.id, s.userId)).for('update');
      await tx
        .update(sanctions)
        .set({ revokedAt: now, revokedBy: adminId, revokeReason: reason })
        .where(eq(sanctions.id, sanctionId));
      await this.reconcileLocked(tx, s.userId, now);
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorUserId: adminId,
          action: 'sanction.revoke',
          targetType: 'user',
          targetId: s.userId,
          metadata: { sanctionId, type: s.type },
        },
        tx,
      );
    });
  }

  /** Every few minutes: suspensions that ran out give the account back. Returns how many were restored. */
  async sweep(now = new Date()): Promise<number> {
    const candidates = await this.db
      .selectDistinct({ userId: sanctions.userId })
      .from(sanctions)
      .innerJoin(users, eq(users.id, sanctions.userId))
      .where(
        and(inArray(users.status, ['SUSPENDED', 'BANNED']), inArray(sanctions.type, ['SUSPENSION', 'BAN'])),
      );
    let restored = 0;
    for (const { userId } of candidates) {
      const changed = await this.db.transaction(async (tx) => {
        await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
        return this.reconcileLocked(tx, userId, now);
      });
      if (changed === 'ACTIVE') {
        restored += 1;
        await this.audit.record({
          actorType: 'SYSTEM',
          action: 'sanction.expired',
          targetType: 'user',
          targetId: userId,
        });
      }
    }
    return restored;
  }

  /** Sets the status the sanctions imply (never touching DELETED). Returns the new status if it changed. */
  private async reconcileLocked(tx: Tx, userId: string, now: Date): Promise<string | null> {
    const [user] = await tx.select({ status: users.status }).from(users).where(eq(users.id, userId));
    if (!user || user.status === 'DELETED') return null;
    const all = await tx.select().from(sanctions).where(eq(sanctions.userId, userId));
    const status = statusFromSanctions(all, now);
    if (status === user.status) return null;
    await tx.update(users).set({ status, updatedAt: now }).where(eq(users.id, userId));
    return status;
  }

  /** A suspension or ban: status, every session revoked, sharing ended (no cooldown), request removed. */
  private async enforce(tx: Tx, userId: string, type: 'SUSPENSION' | 'BAN', now: Date): Promise<void> {
    await this.reconcileLocked(tx, userId, now);
    await this.usersService.revokeAllSessions(
      userId,
      type === 'BAN' ? 'ACCOUNT_BANNED' : 'ACCOUNT_SUSPENDED',
      tx,
    );
    await this.sharing.endActiveLocked(tx, userId, 'SUSPENDED', now);
    await this.requests.removeOpenLocked(tx, userId, now);
  }
}
