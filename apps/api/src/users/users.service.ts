import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { DeviceInfo, Me, RegisterDeviceRequest, UpdateMeRequest } from '@fi-thnitek/contracts';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/api-exception.js';
import { ENV, type Env } from '../config/env.js';
import type { Database, Executor } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { devices, driverProfiles, sessions, users } from '../db/schema/index.js';

type User = typeof users.$inferSelect;

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
  ) {}

  /** The only shape a user ever sees of themselves (no email, no Google sub). */
  toMe(user: User, driverVerification: Me['driverVerification'] = null): Me {
    return {
      id: user.id,
      displayName: user.displayName,
      locale: user.locale,
      status: user.status,
      isAdmin: user.isAdmin,
      termsAcceptedVersion: user.termsAcceptedVersion,
      currentTermsVersion: this.env.TERMS_VERSION,
      driverVerification,
      needsOnboarding: !user.displayName || user.termsAcceptedVersion !== this.env.TERMS_VERSION,
    };
  }

  /** The user's driver verification state, or null if they never started one. */
  async driverStateOf(userId: string, db: Executor = this.db): Promise<Me['driverVerification']> {
    const [row] = await db
      .select({ status: driverProfiles.status })
      .from(driverProfiles)
      .where(eq(driverProfiles.userId, userId));
    return row?.status ?? null;
  }

  async getMe(userId: string): Promise<Me> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
    return this.toMe(user, await this.driverStateOf(userId));
  }

  async updateMe(userId: string, patch: UpdateMeRequest): Promise<Me> {
    if (patch.acceptTermsVersion !== undefined && patch.acceptTermsVersion !== this.env.TERMS_VERSION) {
      throw new ApiException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'Unknown terms version', [
        { path: 'acceptTermsVersion', message: 'must be the current terms version' },
      ]);
    }
    const [user] = await this.db
      .update(users)
      .set({
        ...(patch.displayName !== undefined && { displayName: patch.displayName }),
        ...(patch.locale !== undefined && { locale: patch.locale }),
        ...(patch.acceptTermsVersion !== undefined && {
          termsAcceptedVersion: patch.acceptTermsVersion,
          termsAcceptedAt: new Date(),
        }),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    if (!user) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
    return this.toMe(user, await this.driverStateOf(userId));
  }

  /** Upserts the caller's device by install ID (R-004). Returns the device ID. */
  async upsertDevice(
    userId: string,
    device: DeviceInfo & { pushToken?: string | null },
    tx: Executor = this.db,
  ) {
    const [row] = await tx
      .insert(devices)
      .values({
        id: uuidv7(),
        userId,
        installId: device.installId,
        platform: device.platform,
        appVersion: device.appVersion,
        pushToken: device.pushToken ?? null,
      })
      .onConflictDoUpdate({
        target: [devices.userId, devices.installId],
        set: {
          platform: device.platform,
          appVersion: device.appVersion,
          lastSeenAt: new Date(),
          ...(device.pushToken !== undefined && { pushToken: device.pushToken }),
        },
      })
      .returning({ id: devices.id });
    return row!.id;
  }

  async registerDevice(userId: string, device: RegisterDeviceRequest): Promise<void> {
    await this.upsertDevice(userId, device);
  }

  /**
   * R-005. Anonymises the account and ends every session in one transaction. A suspended or banned
   * account keeps its status and Google sub so deleting it cannot be used to evade the sanction.
   */
  async deleteAccount(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
      if (!user) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
      const sanctioned = user.status === 'SUSPENDED' || user.status === 'BANNED';
      const now = new Date();

      await tx
        .update(users)
        .set({
          email: null,
          displayName: null,
          appleSub: null,
          ...(sanctioned ? {} : { googleSub: null, status: 'DELETED' as const }),
          isAdmin: false,
          deletedAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, userId));
      await this.revokeAllSessions(userId, 'ACCOUNT_DELETED', tx);
      await tx.delete(devices).where(eq(devices.userId, userId));
      await this.audit.record(
        {
          actorType: 'USER',
          actorUserId: userId,
          action: 'user.delete',
          targetType: 'user',
          targetId: userId,
        },
        tx,
      );
    });
  }

  /** Ends every live session of a user (deletion now; suspension and bans in Phase 8). */
  async revokeAllSessions(userId: string, reason: string, tx: Executor = this.db): Promise<void> {
    await tx
      .update(sessions)
      .set({ revokedAt: sql`now()`, revokeReason: reason })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }
}
