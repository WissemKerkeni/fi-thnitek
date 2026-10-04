import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  AdminAppealList,
  AdminAppealQuery,
  AdminPerson,
  AdminPickupList,
  AdminPickupQuery,
  AdminReport,
  AdminReportDetail,
  AdminReportList,
  AdminReportQuery,
  AdminRiskFlagList,
  AdminRiskFlagQuery,
  AdminSanction,
  AdminStats,
  AdminUserDetail,
  AdminUserList,
  AdminUserQuery,
  ResolveReportInput,
} from '@fi-thnitek/contracts';
import { isSanctionActive, tunisDate } from '@fi-thnitek/domain';
import { and, asc, between, count, desc, eq, gte, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/api-exception.js';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import {
  appeals,
  blocks,
  driverProfiles,
  passengerRequests,
  pickupRecords,
  places,
  reports,
  riskFlags,
  sanctions,
  sharingSessions,
  users,
  vehicles,
} from '../db/schema/index.js';

const DAY = 86_400_000;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Report = typeof reports.$inferSelect;
type Sanction = typeof sanctions.$inferSelect;

/**
 * The admin moderation console (PRD §6, anti-abuse §4): the reports queue, pick-up records (every read
 * audited, NFR-06), people, risk flags, appeals and stats. Nothing here returns coordinates.
 */
@Injectable()
export class AdminModerationService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------------------------------ reports

  /** Open HIGH-priority reports first (anti-abuse §3), then the oldest. */
  async reports(q: z.output<typeof AdminReportQuery>): Promise<AdminReportList> {
    const where = and(
      q.status ? eq(reports.status, q.status) : undefined,
      q.priority ? eq(reports.priority, q.priority) : undefined,
      q.userId ? or(eq(reports.targetUserId, q.userId), eq(reports.reporterUserId, q.userId)) : undefined,
    );
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(reports)
        .where(where)
        .orderBy(
          sql`CASE WHEN ${reports.status} = 'OPEN' THEN 0 ELSE 1 END`,
          sql`CASE WHEN ${reports.priority} = 'HIGH' THEN 0 ELSE 1 END`,
          asc(reports.createdAt),
          asc(reports.id),
        )
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ n: count() }).from(reports).where(where),
    ]);
    const names = await this.names(rows.flatMap((r) => [r.reporterUserId, r.targetUserId, r.handledBy]));
    return { reports: rows.map((r) => toReport(r, names)), total: total?.n ?? 0 };
  }

  async report(id: string, now = new Date()): Promise<AdminReportDetail> {
    const [r] = await this.db.select().from(reports).where(eq(reports.id, id));
    if (!r) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);

    const request = r.requestId
      ? (
          await this.db
            .select({
              id: passengerRequests.id,
              passengerUserId: passengerRequests.passengerUserId,
              status: passengerRequests.status,
              types: passengerRequests.transportTypes,
              destinationName: places.nameFr,
              createdAt: passengerRequests.createdAt,
              closedAt: passengerRequests.closedAt,
            })
            .from(passengerRequests)
            .leftJoin(places, eq(places.id, passengerRequests.destinationPlaceId))
            .where(eq(passengerRequests.id, r.requestId))
        )[0]
      : undefined;
    const session = r.sessionId
      ? (
          await this.db
            .select({
              id: sharingSessions.id,
              driverUserId: sharingSessions.driverUserId,
              transportType: sharingSessions.transportType,
              plateDisplay: vehicles.plateDisplay,
              startedAt: sharingSessions.startedAt,
              endedAt: sharingSessions.endedAt,
              endReason: sharingSessions.endReason,
            })
            .from(sharingSessions)
            .leftJoin(vehicles, eq(vehicles.id, sharingSessions.vehicleId))
            .where(eq(sharingSessions.id, r.sessionId))
        )[0]
      : undefined;
    const [others] = r.targetUserId
      ? await this.db
          .select({ n: count() })
          .from(reports)
          .where(
            and(
              eq(reports.targetUserId, r.targetUserId),
              gte(reports.createdAt, new Date(now.getTime() - 30 * DAY)),
              sql`${reports.id} <> ${r.id}`,
            ),
          )
      : [{ n: 0 }];
    const names = await this.names([
      r.reporterUserId,
      r.targetUserId,
      r.handledBy,
      request?.passengerUserId,
      session?.driverUserId,
    ]);
    return {
      ...toReport(r, names),
      request: request
        ? {
            id: request.id,
            passenger: person(request.passengerUserId, names),
            status: request.status,
            types: request.types,
            destinationName: request.destinationName,
            createdAt: request.createdAt.toISOString(),
            closedAt: iso(request.closedAt),
          }
        : null,
      session: session
        ? {
            id: session.id,
            driver: person(session.driverUserId, names),
            transportType: session.transportType,
            plateDisplay: session.plateDisplay,
            startedAt: session.startedAt.toISOString(),
            endedAt: iso(session.endedAt),
            endReason: session.endReason,
          }
        : null,
      targetReports30d: others?.n ?? 0,
    };
  }

  async resolve(
    id: string,
    input: z.output<typeof ResolveReportInput>,
    adminId: string,
    now = new Date(),
  ): Promise<AdminReportDetail> {
    await this.db.transaction(async (tx) => {
      const done = await tx
        .update(reports)
        .set({ status: input.status, resolutionNote: input.note || null, handledBy: adminId, handledAt: now })
        .where(and(eq(reports.id, id), eq(reports.status, 'OPEN')))
        .returning({ id: reports.id });
      if (done.length !== 1) throw new ApiException('CONFLICT', HttpStatus.CONFLICT, 'Not an open report');
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorUserId: adminId,
          action: 'report.resolve',
          targetType: 'report',
          targetId: id,
          metadata: { status: input.status },
        },
        tx,
      );
    });
    return this.report(id, now);
  }

  // ---------------------------------------------------------------------------------- pick-up records

  /** R-039 / NFR-06: admin-only and audited (who looked, at what, and why). */
  async pickups(q: z.output<typeof AdminPickupQuery>, adminId: string): Promise<AdminPickupList> {
    const where = q.requestId
      ? eq(pickupRecords.requestId, q.requestId)
      : and(
          eq(pickupRecords.driverUserId, q.driverUserId!),
          between(pickupRecords.recordedAt, new Date(q.from!), new Date(q.to!)),
        );
    const rows = await this.db
      .select({
        requestId: pickupRecords.requestId,
        passengerUserId: passengerRequests.passengerUserId,
        driverUserId: pickupRecords.driverUserId,
        minDistanceM: pickupRecords.minDistanceM,
        recordedAt: pickupRecords.recordedAt,
        transportType: vehicles.transportType,
        plateDisplay: vehicles.plateDisplay,
      })
      .from(pickupRecords)
      .innerJoin(passengerRequests, eq(passengerRequests.id, pickupRecords.requestId))
      .leftJoin(vehicles, eq(vehicles.driverUserId, pickupRecords.driverUserId))
      .where(where)
      .orderBy(asc(pickupRecords.recordedAt), asc(pickupRecords.minDistanceM))
      .limit(200);
    await this.audit.record({
      actorType: 'ADMIN',
      actorUserId: adminId,
      action: 'pickup_records.read',
      targetType: q.requestId ? 'passenger_request' : 'user',
      targetId: q.requestId ?? q.driverUserId,
      metadata: { reportId: q.reportId ?? null, from: q.from ?? null, to: q.to ?? null, rows: rows.length },
    });
    const names = await this.names(rows.flatMap((r) => [r.passengerUserId, r.driverUserId]));
    return {
      records: rows.map((r) => ({
        requestId: r.requestId,
        passenger: person(r.passengerUserId, names),
        driver: person(r.driverUserId, names),
        transportType: r.transportType,
        plateDisplay: r.plateDisplay,
        minDistanceM: r.minDistanceM,
        recordedAt: r.recordedAt.toISOString(),
      })),
    };
  }

  // -------------------------------------------------------------------------------------------- people

  async users(q: z.output<typeof AdminUserQuery>): Promise<AdminUserList> {
    const term = q.q?.trim();
    const where = and(
      q.status ? eq(users.status, q.status) : undefined,
      term
        ? UUID.test(term)
          ? eq(users.id, term)
          : or(
              ilike(users.displayName, `%${escapeLike(term)}%`),
              ilike(driverProfiles.legalLastName, `%${escapeLike(term)}%`),
              ilike(driverProfiles.legalFirstName, `%${escapeLike(term)}%`),
            )
        : undefined,
    );
    const base = () =>
      this.db.select().from(users).leftJoin(driverProfiles, eq(driverProfiles.userId, users.id));
    const [rows, [total]] = await Promise.all([
      base()
        .where(where)
        .orderBy(desc(users.createdAt), asc(users.id))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db
        .select({ n: count() })
        .from(users)
        .leftJoin(driverProfiles, eq(driverProfiles.userId, users.id))
        .where(where),
    ]);
    return {
      users: rows.map(({ users: u, driver_profiles: d }) => ({
        id: u.id,
        name: nameOf(u.displayName, d),
        status: u.status,
        driverStatus: d?.status ?? null,
        createdAt: u.createdAt.toISOString(),
      })),
      total: total?.n ?? 0,
    };
  }

  async user(id: string, now = new Date()): Promise<AdminUserDetail> {
    const [row] = await this.db
      .select()
      .from(users)
      .leftJoin(driverProfiles, eq(driverProfiles.userId, users.id))
      .where(eq(users.id, id));
    if (!row) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
    const since = new Date(now.getTime() - 30 * DAY);
    const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
    const [rows, against, filed, blockedBy, openFlags, requests30d, sessions30d] = await Promise.all([
      this.db.select().from(sanctions).where(eq(sanctions.userId, id)).orderBy(desc(sanctions.startsAt)),
      n(this.db.select({ n: count() }).from(reports).where(eq(reports.targetUserId, id))),
      n(this.db.select({ n: count() }).from(reports).where(eq(reports.reporterUserId, id))),
      n(this.db.select({ n: count() }).from(blocks).where(eq(blocks.blockedUserId, id))),
      n(
        this.db
          .select({ n: count() })
          .from(riskFlags)
          .where(and(eq(riskFlags.userId, id), isNull(riskFlags.reviewedAt))),
      ),
      n(
        this.db
          .select({ n: count() })
          .from(passengerRequests)
          .where(and(eq(passengerRequests.passengerUserId, id), gte(passengerRequests.createdAt, since))),
      ),
      n(
        this.db
          .select({ n: count() })
          .from(sharingSessions)
          .where(and(eq(sharingSessions.driverUserId, id), gte(sharingSessions.startedAt, since))),
      ),
    ]);
    const names = await this.names(rows.map((s) => s.createdBy));
    return {
      id,
      name: nameOf(row.users.displayName, row.driver_profiles),
      status: row.users.status,
      driverStatus: row.driver_profiles?.status ?? null,
      createdAt: row.users.createdAt.toISOString(),
      sanctions: rows.map((s) => toSanction(s, names, now)),
      reportsAgainst: against,
      reportsFiled: filed,
      blockedBy,
      openFlags,
      requestsLast30d: requests30d,
      sessionsLast30d: sessions30d,
    };
  }

  // --------------------------------------------------------------------------------------- risk flags

  async flags(q: z.output<typeof AdminRiskFlagQuery>): Promise<AdminRiskFlagList> {
    const where = and(
      q.reviewed === true ? sql`${riskFlags.reviewedAt} IS NOT NULL` : undefined,
      q.reviewed === false ? isNull(riskFlags.reviewedAt) : undefined,
      q.userId ? eq(riskFlags.userId, q.userId) : undefined,
    );
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(riskFlags)
        .where(where)
        .orderBy(desc(riskFlags.createdAt), asc(riskFlags.id))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ n: count() }).from(riskFlags).where(where),
    ]);
    const names = await this.names(rows.map((r) => r.userId));
    return {
      flags: rows.map((f) => ({
        id: f.id,
        user: person(f.userId, names),
        type: f.type,
        sessionId: f.sessionId,
        requestId: f.requestId,
        evidence: f.evidence,
        createdAt: f.createdAt.toISOString(),
        reviewedAt: iso(f.reviewedAt),
      })),
      total: total?.n ?? 0,
    };
  }

  async reviewFlag(id: string, adminId: string, now = new Date()): Promise<void> {
    await this.db.transaction(async (tx) => {
      const done = await tx
        .update(riskFlags)
        .set({ reviewedAt: now, reviewedBy: adminId })
        .where(and(eq(riskFlags.id, id), isNull(riskFlags.reviewedAt)))
        .returning({ id: riskFlags.id });
      if (done.length !== 1) throw new ApiException('CONFLICT', HttpStatus.CONFLICT, 'Not an open flag');
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorUserId: adminId,
          action: 'risk_flag.review',
          targetType: 'risk_flag',
          targetId: id,
        },
        tx,
      );
    });
  }

  // ------------------------------------------------------------------------------------------ appeals

  async appeals(q: z.output<typeof AdminAppealQuery>, now = new Date()): Promise<AdminAppealList> {
    const where = q.status ? eq(appeals.status, q.status) : undefined;
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(appeals)
        .leftJoin(sanctions, eq(sanctions.id, appeals.sanctionId))
        .where(where)
        .orderBy(sql`CASE WHEN ${appeals.status} = 'OPEN' THEN 0 ELSE 1 END`, asc(appeals.createdAt))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ n: count() }).from(appeals).where(where),
    ]);
    const names = await this.names(rows.flatMap((r) => [r.appeals.userId, r.sanctions?.createdBy]));
    return {
      appeals: rows.map(({ appeals: a, sanctions: s }) => ({
        id: a.id,
        user: person(a.userId, names),
        sanction: s ? toSanction(s, names, now) : null,
        message: a.message,
        status: a.status,
        createdAt: a.createdAt.toISOString(),
        handledAt: iso(a.handledAt),
      })),
      total: total?.n ?? 0,
    };
  }

  async closeAppeal(id: string, adminId: string, now = new Date()): Promise<void> {
    await this.db.transaction(async (tx) => {
      const done = await tx
        .update(appeals)
        .set({ status: 'CLOSED', handledBy: adminId, handledAt: now })
        .where(and(eq(appeals.id, id), eq(appeals.status, 'OPEN')))
        .returning({ id: appeals.id });
      if (done.length !== 1) throw new ApiException('CONFLICT', HttpStatus.CONFLICT, 'Not an open appeal');
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorUserId: adminId,
          action: 'appeal.close',
          targetType: 'appeal',
          targetId: id,
        },
        tx,
      );
    });
  }

  // -------------------------------------------------------------------------------------------- stats

  async stats(now = new Date()): Promise<AdminStats> {
    const today = new Date(`${tunisDate(now)}T00:00:00+01:00`);
    const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
    const c = () => this.db.select({ n: count() });
    const [
      total,
      verifiedDrivers,
      new7d,
      sharing,
      onBreak,
      openRequests,
      requests,
      movedAway,
      expired,
      sessions,
      openReports,
      highPriorityOpen,
      unreviewedFlags,
      openAppeals,
      suspended,
      banned,
    ] = await Promise.all([
      n(
        c()
          .from(users)
          .where(sql`${users.status} <> 'DELETED'`),
      ),
      n(c().from(driverProfiles).where(eq(driverProfiles.status, 'VERIFIED'))),
      n(
        c()
          .from(users)
          .where(gte(users.createdAt, new Date(now.getTime() - 7 * DAY))),
      ),
      n(
        c()
          .from(sharingSessions)
          .where(and(eq(sharingSessions.state, 'SHARING'), isNull(sharingSessions.endedAt))),
      ),
      n(
        c()
          .from(sharingSessions)
          .where(and(eq(sharingSessions.state, 'ON_BREAK'), isNull(sharingSessions.endedAt))),
      ),
      n(c().from(passengerRequests).where(eq(passengerRequests.status, 'OPEN'))),
      n(c().from(passengerRequests).where(gte(passengerRequests.createdAt, today))),
      n(
        c()
          .from(passengerRequests)
          .where(and(eq(passengerRequests.status, 'MOVED_AWAY'), gte(passengerRequests.closedAt, today))),
      ),
      n(
        c()
          .from(passengerRequests)
          .where(and(eq(passengerRequests.status, 'EXPIRED'), gte(passengerRequests.closedAt, today))),
      ),
      n(c().from(sharingSessions).where(gte(sharingSessions.startedAt, today))),
      n(c().from(reports).where(eq(reports.status, 'OPEN'))),
      n(
        c()
          .from(reports)
          .where(and(eq(reports.status, 'OPEN'), eq(reports.priority, 'HIGH'))),
      ),
      n(c().from(riskFlags).where(isNull(riskFlags.reviewedAt))),
      n(c().from(appeals).where(eq(appeals.status, 'OPEN'))),
      n(c().from(users).where(eq(users.status, 'SUSPENDED'))),
      n(c().from(users).where(eq(users.status, 'BANNED'))),
    ]);
    return {
      users: { total, verifiedDrivers, new7d },
      live: { sharing, onBreak, openRequests },
      today: { requests, movedAway, expired, sessions },
      moderation: { openReports, highPriorityOpen, unreviewedFlags, openAppeals, suspended, banned },
    };
  }

  /** Display names for admin views: the legal name for drivers, the chosen name otherwise. */
  private async names(ids: readonly (string | null | undefined)[]): Promise<Map<string, string | null>> {
    const unique = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
    if (unique.length === 0) return new Map();
    const rows = await this.db
      .select({ id: users.id, displayName: users.displayName, driver: driverProfiles })
      .from(users)
      .leftJoin(driverProfiles, eq(driverProfiles.userId, users.id))
      .where(inArray(users.id, unique));
    return new Map(rows.map((r) => [r.id, nameOf(r.displayName, r.driver)]));
  }
}

function nameOf(
  displayName: string | null,
  driver: { legalFirstName: string; legalLastName: string } | null | undefined,
): string | null {
  return driver ? `${driver.legalFirstName} ${driver.legalLastName}`.trim() : (displayName?.trim() ?? null);
}

function person(id: string, names: Map<string, string | null>): AdminPerson {
  return { id, name: names.get(id) ?? null };
}

function toReport(r: Report, names: Map<string, string | null>): AdminReport {
  return {
    id: r.id,
    source: r.source,
    category: r.category,
    priority: r.priority,
    status: r.status,
    description: r.description,
    reporter: person(r.reporterUserId, names),
    target: r.targetUserId ? person(r.targetUserId, names) : null,
    requestId: r.requestId,
    sessionId: r.sessionId,
    approxAt: iso(r.approxAt),
    createdAt: r.createdAt.toISOString(),
    handledBy: r.handledBy ? person(r.handledBy, names) : null,
    handledAt: iso(r.handledAt),
    resolutionNote: r.resolutionNote,
  };
}

function toSanction(s: Sanction, names: Map<string, string | null>, now: Date): AdminSanction {
  return {
    id: s.id,
    type: s.type,
    reason: s.reason,
    startsAt: s.startsAt.toISOString(),
    endsAt: iso(s.endsAt),
    createdBy: s.createdBy ? person(s.createdBy, names) : null,
    revokedAt: iso(s.revokedAt),
    active: isSanctionActive(s, now),
  };
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
