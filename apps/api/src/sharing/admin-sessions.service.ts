import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { AdminSession, AdminSessionDetail, AdminSessionList } from '@fi-thnitek/contracts';
import { type SQL, and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/api-exception.js';
import type { Database, Executor } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { driverProfiles, sessionEvents, sharingSessions, vehicles } from '../db/schema/index.js';
import { PushService } from '../notifications/push.service.js';
import { SharingService } from './sharing.service.js';

const columns = {
  id: sharingSessions.id,
  driverUserId: sharingSessions.driverUserId,
  firstName: driverProfiles.legalFirstName,
  lastName: driverProfiles.legalLastName,
  transportType: sharingSessions.transportType,
  plateDisplay: vehicles.plateDisplay,
  state: sharingSessions.state,
  isFull: sharingSessions.isFull,
  breaksCount: sharingSessions.breaksCount,
  startedAt: sharingSessions.startedAt,
  lastFixAt: sharingSessions.lastFixAt,
  endedAt: sharingSessions.endedAt,
  endReason: sharingSessions.endReason,
  cooldownApplied: sharingSessions.cooldownApplied,
  cooldownUntil: driverProfiles.cooldownUntil,
};

/** "Drivers → sessions" (PRD §6): session metadata (no positions), clear cooldown, end a session. */
@Injectable()
export class AdminSessionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sharing: SharingService,
    private readonly audit: AuditService,
    private readonly push: PushService,
  ) {}

  async list(
    filter: { active?: boolean; driverUserId?: string },
    page: number,
    pageSize: number,
    now = new Date(),
  ): Promise<AdminSessionList> {
    const where = and(
      filter.active === true ? isNull(sharingSessions.endedAt) : undefined,
      filter.active === false ? isNotNull(sharingSessions.endedAt) : undefined,
      filter.driverUserId ? eq(sharingSessions.driverUserId, filter.driverUserId) : undefined,
    );
    const [rows, [count]] = await Promise.all([
      this.query(this.db, where)
        .orderBy(desc(sharingSessions.startedAt), asc(sharingSessions.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(sharingSessions)
        .where(where),
    ]);
    return { sessions: rows.map((r) => toAdmin(r, now)), total: count?.n ?? 0 };
  }

  async detail(id: string, now = new Date()): Promise<AdminSessionDetail> {
    const [row] = await this.query(this.db, eq(sharingSessions.id, id));
    if (!row) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
    const events = await this.db
      .select({ type: sessionEvents.type, at: sessionEvents.at, meta: sessionEvents.meta })
      .from(sessionEvents)
      .where(eq(sessionEvents.sessionId, id))
      .orderBy(asc(sessionEvents.at), asc(sessionEvents.id));
    return {
      ...toAdmin(row, now),
      events: events.map((e) => ({ type: e.type, at: e.at.toISOString(), meta: e.meta })),
    };
  }

  /** E.g. the battery died (product plan §5). Audited. */
  async clearCooldown(driverUserId: string, adminId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const cleared = await tx
        .update(driverProfiles)
        .set({ cooldownUntil: null })
        .where(eq(driverProfiles.userId, driverUserId))
        .returning({ userId: driverProfiles.userId });
      if (cleared.length !== 1) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorUserId: adminId,
          action: 'driver.cooldown.clear',
          targetType: 'user',
          targetId: driverUserId,
        },
        tx,
      );
    });
  }

  /** Ends an active session with reason ADMIN (no cooldown). Audited. */
  async end(id: string, adminId: string, now = new Date()): Promise<AdminSessionDetail> {
    const driverUserId = await this.db.transaction(async (tx) => {
      const [s] = await tx
        .select()
        .from(sharingSessions)
        .where(and(eq(sharingSessions.id, id), isNull(sharingSessions.endedAt)))
        .for('update');
      if (!s || s.state === 'ENDED') throw new ApiException('NOT_SHARING', HttpStatus.CONFLICT);
      await this.sharing.endLocked(tx, { ...s, state: s.state }, 'ADMIN', now);
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorUserId: adminId,
          action: 'session.end',
          targetType: 'sharing_session',
          targetId: id,
        },
        tx,
      );
      return s.driverUserId;
    });
    await this.push.notifyUser(driverUserId, 'SHARING_ENDED');
    return this.detail(id, now);
  }

  private query(db: Executor, where: SQL | undefined) {
    return selectSessions(db, where);
  }
}

function selectSessions(db: Executor, where: SQL | undefined) {
  return db
    .select(columns)
    .from(sharingSessions)
    .innerJoin(driverProfiles, eq(driverProfiles.userId, sharingSessions.driverUserId))
    .innerJoin(vehicles, eq(vehicles.id, sharingSessions.vehicleId))
    .where(where);
}

type Row = Awaited<ReturnType<typeof selectSessions>>[number];

function toAdmin(r: Row, now: Date): AdminSession {
  return {
    id: r.id,
    driverUserId: r.driverUserId,
    driverName: `${r.firstName} ${r.lastName}`,
    transportType: r.transportType,
    plateDisplay: r.plateDisplay,
    state: r.state,
    isFull: r.isFull,
    breaksCount: r.breaksCount,
    startedAt: r.startedAt.toISOString(),
    lastFixAt: r.lastFixAt?.toISOString() ?? null,
    endedAt: r.endedAt?.toISOString() ?? null,
    endReason: r.endReason ?? null,
    cooldownApplied: r.cooldownApplied,
    driverCooldownUntil: r.cooldownUntil && r.cooldownUntil > now ? r.cooldownUntil.toISOString() : null,
  };
}
