import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  AppealInput,
  BlockList,
  BlockView,
  CreateReportInput,
  MarkerRef,
  ReportCreated,
} from '@fi-thnitek/contracts';
import {
  type Thresholds,
  reportPriority,
  reportProblem,
  shouldFlagReports,
  shouldPauseRequests,
  tunisDate,
  withinSession,
} from '@fi-thnitek/domain';
import { and, desc, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { GOOGLE_VERIFIER, type GoogleTokenVerifier } from '../auth/google-verifier.js';
import { ApiException } from '../common/api-exception.js';
import { THRESHOLDS } from '../config/thresholds.provider.js';
import type { Database, Tx } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { UNIQUE_VIOLATION, pgError } from '../db/pg-errors.js';
import {
  appeals,
  blocks,
  driverProfiles,
  passengerRequests,
  reports,
  riskFlags,
  sanctions,
  sharingSessions,
  users,
} from '../db/schema/index.js';
import { SanctionsService } from './sanctions.service.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A marker that just disappeared (the request closed, the driver stopped) can still be reported. */
const MARKER_GRACE_MS = DAY;
/** How far back the person can report from their own history (R-042, R-070). */
const HISTORY_MS = 30 * DAY;

interface Resolved {
  targetUserId: string | null;
  requestId: string | null;
  sessionId: string | null;
  approxAt: Date | null;
  block: { kind: 'DRIVER' | 'PASSENGER'; label: string | null } | null;
}

/** R-070…R-073 for users: reports, blocks and the appeal of a sanctioned account. */
@Injectable()
export class ModerationService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(THRESHOLDS) private readonly t: Thresholds,
    @Inject(GOOGLE_VERIFIER) private readonly google: GoogleTokenVerifier,
    private readonly audit: AuditService,
    private readonly sanctions: SanctionsService,
  ) {}

  async report(
    userId: string,
    input: z.output<typeof CreateReportInput>,
    now = new Date(),
  ): Promise<ReportCreated> {
    const outcome = await this.db.transaction(async (tx) => {
      const target = await this.resolve(tx, userId, input, now);
      const [reporter] = await tx
        .select({ verification: driverProfiles.status })
        .from(users)
        .leftJoin(driverProfiles, eq(driverProfiles.userId, users.id))
        .where(eq(users.id, userId));
      const [today] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(reports)
        .where(and(eq(reports.reporterUserId, userId), gte(reports.createdAt, tunisDayStart(now))));
      const problem = reportProblem({
        source: input.source,
        category: input.category,
        reporterIsDriver: reporter?.verification === 'VERIFIED',
        reporterId: userId,
        targetId: target.targetUserId,
        reportsToday: today?.n ?? 0,
        t: this.t,
      });
      if (problem === 'DAILY_LIMIT') throw new ApiException('REPORT_LIMIT', HttpStatus.TOO_MANY_REQUESTS);
      if (problem) throw new ApiException('REPORT_NOT_ALLOWED', HttpStatus.UNPROCESSABLE_ENTITY, problem);

      const id = uuidv7();
      await tx.insert(reports).values({
        id,
        reporterUserId: userId,
        targetUserId: target.targetUserId,
        source: input.source,
        category: input.category,
        priority: reportPriority(input.category),
        description: input.description,
        requestId: target.requestId,
        sessionId: target.sessionId,
        approxAt: target.approxAt,
        createdAt: now,
      });

      const wantsBlock = 'block' in input && input.block;
      if (wantsBlock && target.targetUserId && target.block) {
        await this.insertBlock(tx, userId, target.targetUserId, target.block, now);
      }
      const paused = target.targetUserId
        ? await this.consequences(tx, target.targetUserId, input.category, now)
        : false;
      return { id, blocked: Boolean(wantsBlock && target.block), paused, targetUserId: target.targetUserId };
    });
    if (outcome.paused && outcome.targetUserId) await this.sanctions.notifyPaused(outcome.targetUserId);
    return { id: outcome.id, blocked: outcome.blocked };
  }

  async block(userId: string, ref: MarkerRef, now = new Date()): Promise<BlockView> {
    return this.db.transaction(async (tx) => {
      const target = await this.resolve(tx, userId, ref, now);
      if (!target.targetUserId || !target.block) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
      if (target.targetUserId === userId) {
        throw new ApiException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'Cannot block yourself');
      }
      const row = await this.insertBlock(tx, userId, target.targetUserId, target.block, now);
      return toBlockView(row);
    });
  }

  async blocks(userId: string): Promise<BlockList> {
    const rows = await this.db
      .select()
      .from(blocks)
      .where(eq(blocks.blockerUserId, userId))
      .orderBy(desc(blocks.createdAt));
    return { blocks: rows.map(toBlockView) };
  }

  async unblock(userId: string, blockId: string): Promise<void> {
    const removed = await this.db
      .delete(blocks)
      .where(and(eq(blocks.id, blockId), eq(blocks.blockerUserId, userId)))
      .returning({ id: blocks.id });
    if (removed.length !== 1) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
  }

  /**
   * R-073, the contact form: a suspended or banned person proves who they are with a Google ID token
   * (they cannot sign in). One open appeal at a time.
   */
  async appeal(input: AppealInput, now = new Date()): Promise<void> {
    const identity = await this.google.verify(input.idToken);
    const [user] = await this.db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.googleSub, identity.sub));
    if (!user || (user.status !== 'SUSPENDED' && user.status !== 'BANNED')) {
      throw new ApiException('FORBIDDEN', HttpStatus.FORBIDDEN, 'Only for a suspended or banned account');
    }
    const [sanction] = await this.db
      .select({ id: sanctions.id })
      .from(sanctions)
      .where(
        and(
          eq(sanctions.userId, user.id),
          inArray(sanctions.type, ['SUSPENSION', 'BAN']),
          isNull(sanctions.revokedAt),
        ),
      )
      .orderBy(desc(sanctions.startsAt))
      .limit(1);
    try {
      await this.db.transaction(async (tx) => {
        const id = uuidv7();
        await tx.insert(appeals).values({
          id,
          userId: user.id,
          sanctionId: sanction?.id ?? null,
          message: input.message,
          createdAt: now,
        });
        await this.audit.record(
          {
            actorType: 'USER',
            actorUserId: user.id,
            action: 'appeal.create',
            targetType: 'appeal',
            targetId: id,
          },
          tx,
        );
      });
    } catch (error) {
      if (pgError(error)?.code === UNIQUE_VIOLATION) {
        throw new ApiException('CONFLICT', HttpStatus.CONFLICT, 'An appeal is already open');
      }
      throw error;
    }
  }

  /** Who and what a report or block points at. Markers expose session/request ids, never user ids. */
  private async resolve(
    tx: Tx,
    userId: string,
    input: MarkerRef | z.output<typeof CreateReportInput>,
    now: Date,
  ): Promise<Resolved> {
    switch (input.source) {
      case 'DRIVER_MARKER': {
        const [s] = await tx
          .select({
            driverUserId: sharingSessions.driverUserId,
            endedAt: sharingSessions.endedAt,
            displayName: users.displayName,
            legalFirstName: driverProfiles.legalFirstName,
          })
          .from(sharingSessions)
          .innerJoin(users, eq(users.id, sharingSessions.driverUserId))
          .innerJoin(driverProfiles, eq(driverProfiles.userId, sharingSessions.driverUserId))
          .where(eq(sharingSessions.id, input.sessionId));
        if (!s || (s.endedAt && now.getTime() - s.endedAt.getTime() > MARKER_GRACE_MS)) throw notFound();
        return {
          targetUserId: s.driverUserId,
          requestId: null,
          sessionId: input.sessionId,
          approxAt: null,
          // The driver's public name (R-022), as on the map.
          block: { kind: 'DRIVER', label: s.displayName?.trim() || s.legalFirstName },
        };
      }
      case 'PASSENGER_MARKER': {
        const [r] = await tx
          .select({
            passengerUserId: passengerRequests.passengerUserId,
            status: passengerRequests.status,
            closedAt: passengerRequests.closedAt,
            showIdentity: passengerRequests.showIdentity,
            displayName: users.displayName,
          })
          .from(passengerRequests)
          .innerJoin(users, eq(users.id, passengerRequests.passengerUserId))
          .where(eq(passengerRequests.id, input.requestId));
        const stale =
          r?.status !== 'OPEN' && (!r?.closedAt || now.getTime() - r.closedAt.getTime() > MARKER_GRACE_MS);
        if (!r || stale) throw notFound();
        return {
          targetUserId: r.passengerUserId,
          requestId: input.requestId,
          sessionId: null,
          approxAt: null,
          // A passenger's name only if they had chosen to show it (R-034).
          block: { kind: 'PASSENGER', label: r.showIdentity ? r.displayName : null },
        };
      }
      case 'MY_REQUEST': {
        const [r] = await tx
          .select({ createdAt: passengerRequests.createdAt })
          .from(passengerRequests)
          .where(
            and(eq(passengerRequests.id, input.requestId), eq(passengerRequests.passengerUserId, userId)),
          );
        if (!r || now.getTime() - r.createdAt.getTime() > HISTORY_MS) throw notFound();
        return {
          targetUserId: null,
          requestId: input.requestId,
          sessionId: null,
          approxAt: null,
          block: null,
        };
      }
      case 'MY_SESSION': {
        const [s] = await tx
          .select({ startedAt: sharingSessions.startedAt, endedAt: sharingSessions.endedAt })
          .from(sharingSessions)
          .where(and(eq(sharingSessions.id, input.sessionId), eq(sharingSessions.driverUserId, userId)));
        if (!s || now.getTime() - s.startedAt.getTime() > HISTORY_MS) throw notFound();
        const approxAt = new Date(input.approxAt);
        if (!withinSession(approxAt, s, now)) {
          throw new ApiException('REPORT_NOT_ALLOWED', HttpStatus.UNPROCESSABLE_ENTITY, 'OUTSIDE_SESSION');
        }
        return { targetUserId: null, requestId: null, sessionId: input.sessionId, approxAt, block: null };
      }
    }
  }

  /**
   * Anti-abuse §3, evaluated under a lock on the reported person: 3 "nobody there" from distinct drivers
   * in 7 days → a 24 h request pause + flag; 3 other reports from distinct users in 7 days → a flag
   * only. Returns whether a pause started.
   */
  private async consequences(tx: Tx, targetId: string, category: string, now: Date): Promise<boolean> {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, targetId)).for('update');
    const nobodyThere = category === 'NOBODY_THERE';
    const windowDays = nobodyThere ? this.t.nobody_there_window_days : this.t.report_flag_window_days;
    const signals = await tx
      .select({ reporterId: reports.reporterUserId, at: reports.createdAt })
      .from(reports)
      .where(
        and(
          eq(reports.targetUserId, targetId),
          nobodyThere ? eq(reports.category, 'NOBODY_THERE') : ne(reports.category, 'NOBODY_THERE'),
          gte(reports.createdAt, new Date(now.getTime() - windowDays * DAY)),
        ),
      );
    const evidence = { reporters: new Set(signals.map((s) => s.reporterId)).size, windowDays };

    if (nobodyThere) {
      if (!shouldPauseRequests(signals, now, this.t)) return false;
      return this.sanctions.pauseRequestsLocked(tx, targetId, evidence, now);
    }
    if (!shouldFlagReports(signals, now, this.t)) return false;
    const [open] = await tx
      .select({ id: riskFlags.id })
      .from(riskFlags)
      .where(
        and(
          eq(riskFlags.userId, targetId),
          eq(riskFlags.type, 'REPORTS_CLUSTER'),
          isNull(riskFlags.reviewedAt),
        ),
      );
    if (!open)
      await tx
        .insert(riskFlags)
        .values({ id: uuidv7(), userId: targetId, type: 'REPORTS_CLUSTER', evidence });
    return false;
  }

  private async insertBlock(
    tx: Tx,
    blockerId: string,
    blockedId: string,
    block: NonNullable<Resolved['block']>,
    now: Date,
  ): Promise<typeof blocks.$inferSelect> {
    const [inserted] = await tx
      .insert(blocks)
      .values({ id: uuidv7(), blockerUserId: blockerId, blockedUserId: blockedId, ...block, createdAt: now })
      .onConflictDoNothing()
      .returning();
    if (inserted) return inserted;
    const [existing] = await tx
      .select()
      .from(blocks)
      .where(and(eq(blocks.blockerUserId, blockerId), eq(blocks.blockedUserId, blockedId)));
    return existing!;
  }
}

function toBlockView(b: typeof blocks.$inferSelect): BlockView {
  return { id: b.id, kind: b.kind, name: b.label, createdAt: b.createdAt.toISOString() };
}

function notFound(): ApiException {
  return new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
}

function tunisDayStart(now: Date): Date {
  return new Date(`${tunisDate(now)}T00:00:00+01:00`);
}
