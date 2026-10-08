import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  PingsRequest,
  PingsResponse,
  ResumeSharingRequest,
  SessionView,
  SharingHistory,
  SharingStatus,
  StartSharingRequest,
  UpdateSharingRequest,
} from '@fi-thnitek/contracts';
import {
  type Fix,
  type SessionEndReason,
  type SessionEventType,
  type StartBlocker,
  type Thresholds,
  autoResumeFixAnchor,
  breakEnd,
  cooldownUntil,
  evaluateDriverFixes,
  isFixFresh,
  sharingMachine,
  startBlockers,
  startFixProblem,
  stillWorkingDueAt,
  sweepSession,
} from '@fi-thnitek/domain';
import { and, desc, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { z } from 'zod';
import { ApiException } from '../common/api-exception.js';
import { THRESHOLDS } from '../config/thresholds.provider.js';
import type { Database, Executor, Tx } from '../db/client.js';
import { DB } from '../db/db.module.js';
import {
  type StoredFix,
  driverLiveLocations,
  driverProfiles,
  riskFlags,
  sessionEvents,
  sharingSessions,
  users,
  vehicles,
} from '../db/schema/index.js';
import { type PushEvent, PushService } from '../notifications/push.service.js';
import { findPlace, point } from '../places/places.service.js';
import { RoutinesService } from '../routines/routines.service.js';

type Session = typeof sharingSessions.$inferSelect;
type LiveSession = Session & { state: 'SHARING' | 'ON_BREAK' };

/** Sessions ended within this window are still reported to a phone that keeps pinging (stop reason). */
const RECENT_END_MS = 12 * 3_600_000;
const DAY_MS = 86_400_000;
/** R-070: how far back the driver can report a problem during a session. */
const HISTORY_DAYS = 30;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * Driver sharing (R-050…R-059, docs/architecture.md §4.4). The rules are the pure functions of
 * packages/domain; this service loads state, applies them under a row lock and writes the outcome.
 * Positions are kept only as the latest point + a 2-minute window, deleted on break and at the end.
 */
@Injectable()
export class SharingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(THRESHOLDS) private readonly t: Thresholds,
    private readonly push: PushService,
    private readonly routines: RoutinesService,
  ) {}

  async status(userId: string, now = new Date()): Promise<SharingStatus> {
    const [profile] = await this.db
      .select({ status: driverProfiles.status, cooldownUntil: driverProfiles.cooldownUntil })
      .from(driverProfiles)
      .where(eq(driverProfiles.userId, userId));
    const [user] = await this.db.select({ status: users.status }).from(users).where(eq(users.id, userId));
    const [vehicle] = await this.db
      .select({ transportType: vehicles.transportType, plateDisplay: vehicles.plateDisplay })
      .from(vehicles)
      .where(eq(vehicles.driverUserId, userId));
    const session = await this.activeSession(this.db, userId);
    const [lastEnded] = session
      ? []
      : await this.db
          .select({ reason: sharingSessions.endReason, endedAt: sharingSessions.endedAt })
          .from(sharingSessions)
          .where(and(eq(sharingSessions.driverUserId, userId), isNotNull(sharingSessions.endedAt)))
          .orderBy(desc(sharingSessions.endedAt))
          .limit(1);

    const cooldown = profile?.cooldownUntil && profile.cooldownUntil > now ? profile.cooldownUntil : null;
    const blockers = session
      ? []
      : startBlockers({
          verification: profile?.status ?? null,
          accountActive: user?.status === 'ACTIVE',
          hasVehicle: vehicle !== undefined,
          hasActiveSession: false,
          cooldownUntil: cooldown,
          now,
        });

    return {
      session: session ? await this.view(session, vehicle?.plateDisplay ?? '', now) : null,
      vehicle: vehicle ?? null,
      suggestedHeadingTo: session ? null : await this.routines.suggestion(userId, now),
      blockers,
      cooldownUntil: iso(cooldown),
      lastEnded:
        lastEnded?.reason && lastEnded.endedAt
          ? { reason: lastEnded.reason, endedAt: lastEnded.endedAt.toISOString() }
          : null,
      breakOptionsMin: [...this.t.break_options_min],
      tracking: {
        movingIntervalS: this.t.driver_ping_moving_s,
        stationaryIntervalS: this.t.driver_ping_stationary_s,
        distanceFilterM: this.t.driver_distance_filter_m,
        bufferMaxMin: this.t.driver_buffer_max_min,
      },
    };
  }

  /** R-050/R-051. The fix taken on the phone at "Start" becomes the first stored point. */
  async start(
    userId: string,
    req: z.output<typeof StartSharingRequest>,
    now = new Date(),
  ): Promise<SharingStatus> {
    await this.db.transaction(async (tx) => {
      // Serialises concurrent starts of the same driver.
      const [profile] = await tx
        .select({ status: driverProfiles.status, cooldownUntil: driverProfiles.cooldownUntil })
        .from(driverProfiles)
        .where(eq(driverProfiles.userId, userId))
        .for('update');
      const [user] = await tx.select({ status: users.status }).from(users).where(eq(users.id, userId));
      const [vehicle] = await tx
        .select({ id: vehicles.id, transportType: vehicles.transportType })
        .from(vehicles)
        .where(eq(vehicles.driverUserId, userId));
      const active = await this.activeSession(tx, userId);

      const blockers = startBlockers({
        verification: profile?.status ?? null,
        accountActive: user?.status === 'ACTIVE',
        hasVehicle: vehicle !== undefined,
        hasActiveSession: active !== undefined,
        cooldownUntil: profile?.cooldownUntil ?? null,
        now,
      });
      if (blockers.length > 0 || !vehicle) throw blocked(blockers);
      this.assertFix(req.fix, now);
      if (req.headingToPlaceId) await assertPlace(tx, req.headingToPlaceId);

      const id = uuidv7();
      await tx.insert(sharingSessions).values({
        id,
        driverUserId: userId,
        vehicleId: vehicle.id,
        transportType: vehicle.transportType,
        headingToPlaceId: req.headingToPlaceId,
        lineLabel: vehicle.transportType === 'BUS' ? req.lineLabel : null,
        startedAt: now,
        lastFixAt: new Date(req.fix.ts),
      });
      await this.storeLatest(tx, userId, id, vehicle.transportType, req.fix, [req.fix]);
      await event(tx, id, 'STARTED', now);
      await this.routines.markUsed(tx, userId, req.headingToPlaceId, now);
    });
    return this.status(userId, now);
  }

  /** "Heading to" and the bus line can change at any time during the session (R-051). */
  async update(
    userId: string,
    req: z.output<typeof UpdateSharingRequest>,
    now = new Date(),
  ): Promise<SharingStatus> {
    await this.db.transaction(async (tx) => {
      const s = await this.lockActive(tx, userId);
      const patch: Partial<Session> = {};
      if (req.headingToPlaceId !== undefined) {
        if (req.headingToPlaceId) await assertPlace(tx, req.headingToPlaceId);
        patch.headingToPlaceId = req.headingToPlaceId;
      }
      if (req.lineLabel !== undefined && s.transportType === 'BUS') patch.lineLabel = req.lineLabel;
      if (Object.keys(patch).length === 0) return;
      await tx.update(sharingSessions).set(patch).where(eq(sharingSessions.id, s.id));
      if (patch.headingToPlaceId !== undefined) {
        await event(tx, s.id, 'HEADING_CHANGED', now, { placeId: patch.headingToPlaceId });
        await this.routines.markUsed(tx, userId, patch.headingToPlaceId ?? null, now);
      }
    });
    return this.status(userId, now);
  }

  /** R-054: Full / Available, no penalty. Only while sharing (not on break). */
  async setFull(userId: string, isFull: boolean, now = new Date()): Promise<SharingStatus> {
    await this.db.transaction(async (tx) => {
      const s = await this.lockActive(tx, userId);
      assertCan(s, 'TOGGLE_FULL');
      if (s.isFull === isFull) return;
      await tx.update(sharingSessions).set({ isFull }).where(eq(sharingSessions.id, s.id));
      await event(tx, s.id, isFull ? 'FULL_ON' : 'FULL_OFF', now);
    });
    return this.status(userId, now);
  }

  /** R-055: hidden and untracked until `break_until`; the stored position is deleted now. */
  async startBreak(userId: string, minutes: number, now = new Date()): Promise<SharingStatus> {
    let until: Date;
    try {
      until = breakEnd(now, minutes, this.t);
    } catch (error) {
      throw new ApiException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, (error as Error).message);
    }
    await this.db.transaction(async (tx) => {
      const s = await this.lockActive(tx, userId);
      assertCan(s, 'START_BREAK');
      await tx
        .update(sharingSessions)
        .set({
          state: 'ON_BREAK',
          breakStartedAt: now,
          breakUntil: until,
          breakRemindedAt: null,
          breaksCount: sql`${sharingSessions.breaksCount} + 1`,
        })
        .where(and(eq(sharingSessions.id, s.id), eq(sharingSessions.state, 'SHARING')));
      // ADR-227: the marker stays where the break began (frozen, marked on break); the 2-minute window
      // is cleared and no location is taken until the driver resumes.
      await tx
        .update(driverLiveLocations)
        .set({ recentFixes: [] })
        .where(eq(driverLiveLocations.driverUserId, userId));
      await event(tx, s.id, 'BREAK_STARTED', now, { minutes });
    });
    return this.status(userId, now);
  }

  /** ADR-227: at any time during the break, with a fresh position (the sweep also resumes at the end). */
  async resume(
    userId: string,
    req: z.output<typeof ResumeSharingRequest>,
    now = new Date(),
  ): Promise<SharingStatus> {
    await this.db.transaction(async (tx) => {
      const s = await this.lockActive(tx, userId);
      assertCan(s, 'RESUME');
      this.assertFix(req.fix, now);
      await tx
        .update(sharingSessions)
        .set({ state: 'SHARING', breakStartedAt: null, breakUntil: null, lastFixAt: new Date(req.fix.ts) })
        .where(and(eq(sharingSessions.id, s.id), eq(sharingSessions.state, 'ON_BREAK')));
      await this.storeLatest(tx, userId, s.id, s.transportType, req.fix, [req.fix]);
      await event(tx, s.id, 'RESUMED', now, { early: s.breakUntil !== null && now < s.breakUntil });
    });
    return this.status(userId, now);
  }

  /** R-058: "Still working?" → yes. Starts a new period. */
  async confirmStillWorking(userId: string, now = new Date()): Promise<SharingStatus> {
    await this.db.transaction(async (tx) => {
      const s = await this.lockActive(tx, userId);
      await tx
        .update(sharingSessions)
        .set({ stillWorkingConfirmedAt: now })
        .where(eq(sharingSessions.id, s.id));
      await event(tx, s.id, 'STILL_WORKING_CONFIRMED', now);
    });
    return this.status(userId, now);
  }

  /** R-056: a manual stop applies the cooldown (the app offers a break first). */
  async stop(userId: string, now = new Date()): Promise<SharingStatus> {
    await this.db.transaction(async (tx) => {
      const s = await this.lockActive(tx, userId);
      await this.endLocked(tx, s, 'MANUAL_STOP', now);
    });
    return this.status(userId, now);
  }

  /** POST /v1/location/pings for drivers (docs/architecture.md §4.2). Nothing is stored outside an active mode. */
  async ingest(userId: string, req: z.output<typeof PingsRequest>, now = new Date()): Promise<PingsResponse> {
    const result = await this.db.transaction(async (tx): Promise<PingsResponse & { notify?: boolean }> => {
      const s = await this.activeSession(tx, userId, true);
      if (!s) return this.noActiveMode(tx, userId, now);
      if (s.state === 'ON_BREAK') return { stop: true, reason: 'ON_BREAK', cooldownUntil: null };

      const [live] = await tx
        .select()
        .from(driverLiveLocations)
        .where(eq(driverLiveLocations.driverUserId, userId));
      const outcome = evaluateDriverFixes(
        {
          latest: live ? storedLatest(live) : null,
          window: live?.recentFixes ?? [],
          fixes: req.fixes,
          locationServicesOn: req.locationServicesOn,
          now: now.getTime(),
        },
        this.t,
      );

      if (outcome.kind === 'NOOP') return { stop: false, reason: null, cooldownUntil: null };
      if (outcome.kind === 'ACCEPT') {
        await this.storeLatest(tx, userId, s.id, s.transportType, outcome.latest, outcome.window);
        await tx
          .update(sharingSessions)
          .set({ lastFixAt: new Date(outcome.latest.ts) })
          .where(eq(sharingSessions.id, s.id));
        return { stop: false, reason: null, cooldownUntil: null };
      }
      if (outcome.flag) {
        await tx.insert(riskFlags).values({
          id: uuidv7(),
          userId,
          type: outcome.flag.type,
          sessionId: s.id,
          evidence: { ...outcome.flag.evidence },
        });
      }
      const until = await this.endLocked(tx, s, outcome.reason, now, outcome.lastGoodTs);
      return { stop: true, reason: outcome.reason, cooldownUntil: iso(until), notify: true };
    });
    const { notify, ...response } = result;
    if (notify) await this.push.notifyUser(userId, 'SHARING_ENDED');
    return response;
  }

  /**
   * The periodic job's work (every 30 s): ends silent, unconfirmed or suspended sessions, resumes breaks
   * whose time is over (ADR-227) and sends the "Still working?" push. Each action is re-checked under the
   * row lock.
   */
  async sweep(now = new Date()): Promise<{ ended: number; reminded: number; prompted: number }> {
    const counts = { ended: 0, reminded: 0, prompted: 0 };
    const active = await this.db
      .select({ id: sharingSessions.id, driverUserId: sharingSessions.driverUserId })
      .from(sharingSessions)
      .where(isNull(sharingSessions.endedAt));

    for (const { id, driverUserId } of active) {
      const pushEvent = await this.db.transaction(async (tx): Promise<PushEvent | null> => {
        const [s] = await tx
          .select()
          .from(sharingSessions)
          .where(and(eq(sharingSessions.id, id), isNull(sharingSessions.endedAt)))
          .for('update');
        if (!s || s.state === 'ENDED') return null;
        const allowed = await driverAllowed(tx, driverUserId);
        const action = sweepSession({ ...s, state: s.state, driverAllowed: allowed }, now, this.t);
        switch (action.type) {
          case 'NONE':
            return null;
          case 'END':
            await this.endLocked(tx, s as LiveSession, action.reason, now);
            counts.ended += 1;
            return 'SHARING_ENDED';
          case 'AUTO_RESUME':
            // Back to SHARING without a position: the frozen one is dropped, so the phone's next fix starts
            // afresh (no gap counted over the break). Hidden until that fix arrives (not fresh).
            await tx
              .update(sharingSessions)
              .set({
                state: 'SHARING',
                breakStartedAt: null,
                breakUntil: null,
                lastFixAt: autoResumeFixAnchor(now, this.t),
              })
              .where(and(eq(sharingSessions.id, id), eq(sharingSessions.state, 'ON_BREAK')));
            await tx.delete(driverLiveLocations).where(eq(driverLiveLocations.driverUserId, driverUserId));
            await event(tx, id, 'RESUMED', now, { auto: true });
            counts.reminded += 1;
            return 'BREAK_OVER';
          case 'PROMPT_STILL_WORKING':
            await tx
              .update(sharingSessions)
              .set({ stillWorkingPromptedAt: now })
              .where(eq(sharingSessions.id, id));
            await event(tx, id, 'STILL_WORKING_PROMPTED', now);
            counts.prompted += 1;
            return 'STILL_WORKING';
        }
      });
      if (pushEvent) await this.push.notifyUser(driverUserId, pushEvent);
    }
    return counts;
  }

  /** R-070: the driver's own sessions of the last 30 days, newest first, for "Report a problem". */
  async history(userId: string, now = new Date()): Promise<SharingHistory> {
    const rows = await this.db
      .select()
      .from(sharingSessions)
      .where(
        and(
          eq(sharingSessions.driverUserId, userId),
          gte(sharingSessions.startedAt, new Date(now.getTime() - HISTORY_DAYS * DAY_MS)),
        ),
      )
      .orderBy(desc(sharingSessions.startedAt))
      .limit(100);
    return {
      sessions: await Promise.all(
        rows.map(async (s) => ({
          id: s.id,
          transportType: s.transportType,
          headingTo: s.headingToPlaceId ? await findPlace(this.db, s.headingToPlaceId) : null,
          startedAt: s.startedAt.toISOString(),
          endedAt: s.endedAt?.toISOString() ?? null,
          endReason: s.endReason,
          breaksCount: s.breaksCount,
        })),
      ),
    };
  }

  /** Ends the driver's active session, if any, inside `tx` (a suspension or a ban: no cooldown). */
  async endActiveLocked(tx: Tx, driverUserId: string, reason: SessionEndReason, now: Date): Promise<boolean> {
    const s = await this.activeSession(tx, driverUserId, true);
    if (!s) return false;
    await this.endLocked(tx, s, reason, now);
    return true;
  }

  /** Ends a session whose row is locked by `tx`. Returns the cooldown end when one applies. */
  async endLocked(
    tx: Tx,
    s: LiveSession,
    reason: SessionEndReason,
    now: Date,
    lastGoodTs?: number | null,
  ): Promise<Date | null> {
    const lastFix = lastGoodTs != null ? new Date(lastGoodTs) : s.lastFixAt;
    const until = cooldownUntil(reason, now, lastFix, this.t);
    const applies = until !== null && until > now;
    await tx
      .update(sharingSessions)
      .set({ state: 'ENDED', endedAt: now, endReason: reason, cooldownApplied: applies, lastFixAt: lastFix })
      .where(and(eq(sharingSessions.id, s.id), isNull(sharingSessions.endedAt)));
    await tx.delete(driverLiveLocations).where(eq(driverLiveLocations.driverUserId, s.driverUserId));
    if (applies) {
      await tx
        .update(driverProfiles)
        .set({ cooldownUntil: sql`GREATEST(COALESCE(${driverProfiles.cooldownUntil}, ${until}), ${until})` })
        .where(eq(driverProfiles.userId, s.driverUserId));
    }
    await event(tx, s.id, 'ENDED', now, { reason });
    return applies ? until : null;
  }

  /** The driver's active session, locked for update when `lock` is set. */
  async activeSession(db: Executor, userId: string, lock = false): Promise<LiveSession | undefined> {
    const q = db
      .select()
      .from(sharingSessions)
      .where(and(eq(sharingSessions.driverUserId, userId), isNull(sharingSessions.endedAt)));
    const [s] = lock ? await q.for('update') : await q;
    return s as LiveSession | undefined;
  }

  private async lockActive(tx: Tx, userId: string): Promise<LiveSession> {
    const s = await this.activeSession(tx, userId, true);
    if (!s) throw new ApiException('NOT_SHARING', HttpStatus.CONFLICT);
    return s;
  }

  private assertFix(fix: Fix, now: Date): void {
    const problem = startFixProblem(fix, now, this.t);
    if (problem) throw new ApiException('FIX_REJECTED', HttpStatus.UNPROCESSABLE_ENTITY, problem);
  }

  private async storeLatest(
    tx: Tx,
    userId: string,
    sessionId: string,
    transportType: Session['transportType'],
    latest: Fix,
    window: readonly Fix[],
  ): Promise<void> {
    const values = {
      sessionId,
      transportType,
      point: point(latest),
      lat: latest.lat,
      lng: latest.lng,
      accuracyM: latest.accuracyM,
      headingDeg: latest.headingDeg,
      speedMps: latest.speedMps,
      fixTs: new Date(latest.ts),
      recentFixes: window.map(toStored),
      updatedAt: sql`now()`,
    };
    await tx
      .insert(driverLiveLocations)
      .values({ driverUserId: userId, ...values })
      .onConflictDoUpdate({ target: driverLiveLocations.driverUserId, set: values });
  }

  private async noActiveMode(tx: Tx, userId: string, now: Date): Promise<PingsResponse> {
    const [last] = await tx
      .select({ reason: sharingSessions.endReason, endedAt: sharingSessions.endedAt })
      .from(sharingSessions)
      .where(and(eq(sharingSessions.driverUserId, userId), isNotNull(sharingSessions.endedAt)))
      .orderBy(desc(sharingSessions.endedAt))
      .limit(1);
    if (!last?.reason || !last.endedAt || now.getTime() - last.endedAt.getTime() > RECENT_END_MS) {
      return { stop: true, reason: 'NOT_SHARING', cooldownUntil: null };
    }
    const [profile] = await tx
      .select({ cooldownUntil: driverProfiles.cooldownUntil })
      .from(driverProfiles)
      .where(eq(driverProfiles.userId, userId));
    const cooldown = profile?.cooldownUntil && profile.cooldownUntil > now ? profile.cooldownUntil : null;
    return { stop: true, reason: last.reason, cooldownUntil: iso(cooldown) };
  }

  private async view(s: LiveSession, plateDisplay: string, now: Date): Promise<SessionView> {
    const due = stillWorkingDueAt(s.startedAt, s.stillWorkingConfirmedAt, this.t);
    return {
      id: s.id,
      state: s.state,
      transportType: s.transportType,
      plateDisplay,
      isFull: s.isFull,
      headingTo: s.headingToPlaceId ? await findPlace(this.db, s.headingToPlaceId) : null,
      lineLabel: s.lineLabel,
      startedAt: s.startedAt.toISOString(),
      lastFixAt: iso(s.lastFixAt),
      fresh: s.state === 'SHARING' && isFixFresh(s.lastFixAt?.getTime() ?? null, now.getTime(), this.t),
      breakUntil: iso(s.breakUntil),
      stillWorkingPending: s.stillWorkingPromptedAt !== null && s.stillWorkingPromptedAt >= due,
    };
  }
}

function blocked(blockers: StartBlocker[]): ApiException {
  const hard = blockers.filter((b) => b !== 'ALREADY_SHARING' && b !== 'COOLDOWN');
  if (hard.length > 0) return new ApiException('SHARING_NOT_ALLOWED', HttpStatus.FORBIDDEN, hard.join(', '));
  if (blockers.includes('ALREADY_SHARING')) return new ApiException('ALREADY_SHARING', HttpStatus.CONFLICT);
  return new ApiException('COOLDOWN_ACTIVE', HttpStatus.CONFLICT);
}

function assertCan(s: LiveSession, ev: 'TOGGLE_FULL' | 'START_BREAK' | 'RESUME'): void {
  if (!sharingMachine.can(s.state, ev)) {
    throw new ApiException(
      'INVALID_STATE_TRANSITION',
      HttpStatus.CONFLICT,
      `${ev} is not allowed while ${s.state}`,
    );
  }
}

async function assertPlace(db: Executor, id: string): Promise<void> {
  if (!(await findPlace(db, id)))
    throw new ApiException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'Unknown place');
}

/** A session may continue only while the account is active and the driver file is VERIFIED. */
async function driverAllowed(db: Executor, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ user: users.status, driver: driverProfiles.status })
    .from(driverProfiles)
    .innerJoin(users, eq(users.id, driverProfiles.userId))
    .where(eq(driverProfiles.userId, userId));
  return row?.user === 'ACTIVE' && row.driver === 'VERIFIED';
}

async function event(
  tx: Tx,
  sessionId: string,
  type: SessionEventType,
  at: Date,
  meta: Record<string, unknown> = {},
): Promise<void> {
  await tx.insert(sessionEvents).values({ id: uuidv7(), sessionId, type, at, meta });
}

const toStored = (f: Fix): StoredFix => ({
  ts: f.ts,
  lat: f.lat,
  lng: f.lng,
  accuracyM: f.accuracyM,
  speedMps: f.speedMps,
  headingDeg: f.headingDeg,
  isMock: f.isMock,
});

const storedLatest = (live: typeof driverLiveLocations.$inferSelect): Fix => ({
  ts: live.fixTs.getTime(),
  lat: live.lat,
  lng: live.lng,
  accuracyM: live.accuracyM,
  speedMps: live.speedMps,
  headingDeg: live.headingDeg,
  isMock: false,
});
