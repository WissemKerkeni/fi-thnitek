import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  CreateRequestInput,
  CurrentRequest,
  PingsRequest,
  PingsResponse,
  RequestHistory,
  RequestView,
} from '@fi-thnitek/contracts';
import {
  type DeviceAccount,
  type Fix,
  type RequestBlocker,
  type RequestCloseReason,
  type RequestTrackState,
  type Thresholds,
  deviceProblem,
  evaluatePassengerFixes,
  pickupCandidates,
  renewal,
  requestBlockers,
  requestPausedUntil,
  sweepRequest,
  tunisDate,
} from '@fi-thnitek/domain';
import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { z } from 'zod';
import { ApiException } from '../common/api-exception.js';
import { THRESHOLDS } from '../config/thresholds.provider.js';
import type { Database, Executor, Tx } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { UNIQUE_VIOLATION, pgError } from '../db/pg-errors.js';
import {
  devices,
  driverLiveLocations,
  driverProfiles,
  passengerRequests,
  pickupRecords,
  riskFlags,
  sanctions,
  sharingSessions,
  users,
} from '../db/schema/index.js';
import { PushService } from '../notifications/push.service.js';
import { findPlace, point } from '../places/places.service.js';

type Row = typeof passengerRequests.$inferSelect;

/** Closed requests stay on the closure screen (and answer late pings) for this long. */
const RECENT_CLOSED_MS = 12 * 3_600_000;
const MIN = 60_000;
/** Pick-up search radius around the anchor; drivers' latest points can be 2 minutes past it. */
const PICKUP_PREFILTER_M = 5_000;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/**
 * Passenger requests (R-030…R-042, docs/architecture.md §4.3). Rules are the pure functions of
 * packages/domain/request-rules; this service loads, applies under a row lock and writes.
 */
@Injectable()
export class RequestsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(THRESHOLDS) private readonly t: Thresholds,
    private readonly push: PushService,
  ) {}

  async current(userId: string, now = new Date()): Promise<CurrentRequest> {
    const [open] = await this.db
      .select()
      .from(passengerRequests)
      .where(and(eq(passengerRequests.passengerUserId, userId), eq(passengerRequests.status, 'OPEN')));
    const lastClosed = open ? null : await this.lastClosed(this.db, userId, now);
    return {
      request: open ? await this.view(open) : null,
      lastClosed: lastClosed ? await this.view(lastClosed) : null,
      ...(await this.eligibility(this.db, userId, ['TAXI'], now)),
      tracking: {
        intervalS: this.t.passenger_ping_s,
        distanceFilterM: this.t.passenger_distance_filter_m,
        bufferMaxMin: this.t.passenger_buffer_max_min,
      },
    };
  }

  /** R-030. The request becomes visible to drivers only once anchored by the phone's first accurate fix. */
  async create(
    userId: string,
    input: z.output<typeof CreateRequestInput>,
    now = new Date(),
  ): Promise<CurrentRequest> {
    try {
      await this.db.transaction(async (tx) => {
        // Serialises concurrent posts of the same passenger (the partial unique index is the backstop).
        await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
        const { blockers } = await this.eligibility(tx, userId, input.types, now);
        if (blockers.length > 0) throw blocked(blockers);
        if (input.destination.placeId && !(await findPlace(tx, input.destination.placeId))) {
          throw new ApiException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'Unknown place');
        }
        const dest = input.destination.point;
        await tx.insert(passengerRequests).values({
          id: uuidv7(),
          passengerUserId: userId,
          transportTypes: input.types,
          destinationPoint: point(dest),
          destinationLat: dest.lat,
          destinationLng: dest.lng,
          destinationPlaceId: input.destination.placeId,
          seats: input.seats,
          note: input.note || null,
          showIdentity: input.showIdentity,
          createdAt: now,
          expiresAt: new Date(now.getTime() + this.t.request_ttl_min * MIN),
        });
      });
    } catch (error) {
      if (pgError(error).code === UNIQUE_VIOLATION)
        throw new ApiException('REQUEST_ALREADY_OPEN', HttpStatus.CONFLICT);
      throw error;
    }
    return this.current(userId, now);
  }

  /** R-037. */
  async cancel(userId: string, now = new Date()): Promise<CurrentRequest> {
    await this.db.transaction(async (tx) => {
      const r = await this.lockOpen(tx, userId);
      await this.close(tx, r, 'CANCELLED', now);
    });
    return this.current(userId, now);
  }

  /** R-036: +60 min, at most 3 times. */
  async renew(userId: string, now = new Date()): Promise<CurrentRequest> {
    await this.db.transaction(async (tx) => {
      const r = await this.lockOpen(tx, userId);
      const expiresAt = renewal(r, now, this.t);
      if (!expiresAt) throw new ApiException('RENEW_NOT_ALLOWED', HttpStatus.CONFLICT);
      await tx
        .update(passengerRequests)
        .set({ expiresAt, renewCount: r.renewCount + 1, expiryRemindedAt: null })
        .where(and(eq(passengerRequests.id, r.id), eq(passengerRequests.status, 'OPEN')));
    });
    return this.current(userId, now);
  }

  /** R-042: own requests of the last 30 days, without any driver information. */
  async history(userId: string, now = new Date()): Promise<RequestHistory> {
    const rows = await this.db
      .select()
      .from(passengerRequests)
      .where(
        and(
          eq(passengerRequests.passengerUserId, userId),
          gte(passengerRequests.createdAt, new Date(now.getTime() - 30 * 24 * 60 * MIN)),
        ),
      )
      .orderBy(desc(passengerRequests.createdAt));
    return {
      requests: await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          status: r.status,
          types: r.transportTypes as RequestView['types'],
          destination: r.destinationPlaceId ? await findPlace(this.db, r.destinationPlaceId) : null,
          createdAt: r.createdAt.toISOString(),
          closedAt: iso(r.closedAt),
        })),
      ),
    };
  }

  /**
   * Passenger pings (docs/architecture.md §4.2). Returns null when the user has no request mode at all,
   * so the caller can try the driver mode.
   */
  async ingest(
    userId: string,
    req: z.output<typeof PingsRequest>,
    now = new Date(),
  ): Promise<PingsResponse | null> {
    const result = await this.db.transaction(
      async (tx): Promise<(PingsResponse & { notify?: boolean }) | null> => {
        const [r] = await tx
          .select()
          .from(passengerRequests)
          .where(and(eq(passengerRequests.passengerUserId, userId), eq(passengerRequests.status, 'OPEN')))
          .for('update');
        if (!r) {
          const closed = await this.lastClosed(tx, userId, now);
          return closed
            ? { stop: true, reason: closed.status as RequestCloseReason, cooldownUntil: null }
            : null;
        }

        const state: RequestTrackState = {
          anchor:
            r.anchorLat !== null && r.anchorLng !== null
              ? { lat: r.anchorLat, lng: r.anchorLng, accuracyM: r.anchorAccuracyM ?? 0 }
              : null,
          awaySince: r.awaySince?.getTime() ?? null,
          lastFixTs: r.lastFixAt?.getTime() ?? null,
        };
        const outcome = evaluatePassengerFixes(
          { state, fixes: req.fixes, locationServicesOn: req.locationServicesOn },
          this.t,
        );
        await tx
          .update(passengerRequests)
          .set(this.trackColumns(r, outcome.state, outcome.latest, now))
          .where(eq(passengerRequests.id, r.id));

        if (outcome.kind === 'UPDATE') return { stop: false, reason: null, cooldownUntil: null };
        if (outcome.flag) {
          await tx.insert(riskFlags).values({
            id: uuidv7(),
            userId,
            type: outcome.flag,
            requestId: r.id,
            evidence: { accuracyM: outcome.latest?.accuracyM ?? null },
          });
        }
        await this.close(tx, { ...r, ...anchorOf(outcome.state) }, outcome.reason, now);
        return { stop: true, reason: outcome.reason, cooldownUntil: null, notify: true };
      },
    );
    if (!result) return null;
    const { notify, ...response } = result;
    if (notify) await this.push.notifyUser(userId, 'REQUEST_CLOSED');
    return response;
  }

  /** The 30 s job: NO_GPS_FIX, LOCATION_LOST, EXPIRED closures and the "Renew?" push. */
  async sweep(now = new Date()): Promise<{ closed: number; reminded: number }> {
    const counts = { closed: 0, reminded: 0 };
    const open = await this.db
      .select({ id: passengerRequests.id, userId: passengerRequests.passengerUserId })
      .from(passengerRequests)
      .where(eq(passengerRequests.status, 'OPEN'));
    for (const { id, userId } of open) {
      const event = await this.db.transaction(async (tx) => {
        const [r] = await tx
          .select()
          .from(passengerRequests)
          .where(and(eq(passengerRequests.id, id), eq(passengerRequests.status, 'OPEN')))
          .for('update');
        if (!r) return null;
        const action = sweepRequest({ ...r, anchored: r.anchorLat !== null }, now, this.t);
        if (action.type === 'CLOSE') {
          await this.close(tx, r, action.reason, now);
          counts.closed += 1;
          return 'REQUEST_CLOSED' as const;
        }
        if (action.type === 'REMIND_EXPIRY') {
          await tx
            .update(passengerRequests)
            .set({ expiryRemindedAt: now })
            .where(eq(passengerRequests.id, id));
          counts.reminded += 1;
          return 'REQUEST_EXPIRING' as const;
        }
        return null;
      });
      if (event) await this.push.notifyUser(userId, event);
    }
    return counts;
  }

  /** Closes an OPEN request locked by `tx`; on MOVED_AWAY, records nearby sharing drivers (R-039). */
  private async close(tx: Tx, r: Row, reason: RequestCloseReason, now: Date): Promise<void> {
    const closed = await tx
      .update(passengerRequests)
      .set({ status: reason, closedAt: now })
      .where(and(eq(passengerRequests.id, r.id), eq(passengerRequests.status, 'OPEN')))
      .returning({ id: passengerRequests.id });
    if (closed.length !== 1 || reason !== 'MOVED_AWAY' || r.anchorLat === null || r.anchorLng === null)
      return;

    const anchor = { lat: r.anchorLat, lng: r.anchorLng };
    const nearby = await tx
      .select({ driverUserId: driverLiveLocations.driverUserId, fixes: driverLiveLocations.recentFixes })
      .from(driverLiveLocations)
      .innerJoin(sharingSessions, eq(sharingSessions.id, driverLiveLocations.sessionId))
      .where(
        and(
          eq(sharingSessions.state, 'SHARING'),
          sql`ST_DWithin(${driverLiveLocations.point}, ${point(anchor)}, ${PICKUP_PREFILTER_M})`,
        ),
      );
    const records = pickupCandidates(anchor, nearby, now, this.t);
    if (records.length > 0) {
      await tx
        .insert(pickupRecords)
        .values(records.map((p) => ({ requestId: r.id, ...p, recordedAt: now })))
        .onConflictDoNothing();
    }
  }

  private trackColumns(r: Row, state: RequestTrackState, latest: Fix | null, now: Date) {
    const anchoredNow = r.anchorLat === null && state.anchor !== null;
    return {
      ...(anchoredNow && state.anchor
        ? {
            anchorPoint: point(state.anchor),
            anchorLat: state.anchor.lat,
            anchorLng: state.anchor.lng,
            anchorAccuracyM: state.anchor.accuracyM,
            visibleAt: now,
          }
        : {}),
      ...(latest
        ? {
            lastPoint: point(latest),
            lastLat: latest.lat,
            lastLng: latest.lng,
            lastAccuracyM: latest.accuracyM,
            lastFixAt: new Date(latest.ts),
            lastPingAt: now,
          }
        : {}),
      awaySince: state.awaySince !== null ? new Date(state.awaySince) : null,
    };
  }

  /**
   * Closes the passenger's open request as REMOVED inside `tx` (a sanction or the automatic request
   * pause, anti-abuse §3). Returns whether there was one.
   */
  async removeOpenLocked(tx: Tx, userId: string, now: Date): Promise<boolean> {
    const [r] = await tx
      .select()
      .from(passengerRequests)
      .where(and(eq(passengerRequests.passengerUserId, userId), eq(passengerRequests.status, 'OPEN')))
      .for('update');
    if (!r) return false;
    await this.close(tx, r, 'REMOVED', now);
    return true;
  }

  private async lockOpen(tx: Tx, userId: string): Promise<Row> {
    const [r] = await tx
      .select()
      .from(passengerRequests)
      .where(and(eq(passengerRequests.passengerUserId, userId), eq(passengerRequests.status, 'OPEN')))
      .for('update');
    if (!r) throw new ApiException('NO_OPEN_REQUEST', HttpStatus.CONFLICT);
    return r;
  }

  private async lastClosed(db: Executor, userId: string, now: Date): Promise<Row | undefined> {
    const [r] = await db
      .select()
      .from(passengerRequests)
      .where(
        and(
          eq(passengerRequests.passengerUserId, userId),
          ne(passengerRequests.status, 'OPEN'),
          isNotNull(passengerRequests.closedAt),
          gte(passengerRequests.closedAt, new Date(now.getTime() - RECENT_CLOSED_MS)),
        ),
      )
      .orderBy(desc(passengerRequests.closedAt))
      .limit(1);
    return r;
  }

  private async eligibility(
    db: Executor,
    userId: string,
    types: readonly ('TAXI' | 'LOUAGE' | 'BUS')[],
    now: Date,
  ): Promise<{ blockers: RequestBlocker[]; pausedUntil: string | null }> {
    const [user] = await db
      .select({ status: users.status, createdAt: users.createdAt, verification: driverProfiles.status })
      .from(users)
      .leftJoin(driverProfiles, eq(driverProfiles.userId, users.id))
      .where(eq(users.id, userId));
    const [open] = await db
      .select({ id: passengerRequests.id })
      .from(passengerRequests)
      .where(and(eq(passengerRequests.passengerUserId, userId), eq(passengerRequests.status, 'OPEN')));
    const todayStart = new Date(`${tunisDate(now)}T00:00:00+01:00`);
    const [today] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(passengerRequests)
      .where(
        and(eq(passengerRequests.passengerUserId, userId), gte(passengerRequests.createdAt, todayStart)),
      );
    const pauses = await db
      .select()
      .from(sanctions)
      .where(
        and(eq(sanctions.userId, userId), eq(sanctions.type, 'REQUEST_PAUSE'), isNull(sanctions.revokedAt)),
      );
    const pausedUntil = requestPausedUntil(pauses, now);
    const blockers = requestBlockers({
      verification: user?.verification ?? null,
      accountActive: user?.status === 'ACTIVE',
      hasOpenRequest: open !== undefined,
      types,
      accountCreatedAt: user?.createdAt ?? now,
      requestsToday: today?.n ?? 0,
      pausedUntil,
      deviceProblem: deviceProblem(await this.deviceAccounts(db, userId, now), userId, this.t),
      now,
      t: this.t,
    });
    return {
      blockers,
      pausedUntil: blockers.includes('PAUSED') ? (pausedUntil?.toISOString() ?? null) : null,
    };
  }

  /** Anti-abuse §2: the accounts seen on this user's devices (install ids) in the last 30 days. */
  private async deviceAccounts(db: Executor, userId: string, now: Date): Promise<DeviceAccount[]> {
    const since = new Date(now.getTime() - this.t.device_window_days * 24 * 60 * MIN);
    const mine = db.select({ installId: devices.installId }).from(devices).where(eq(devices.userId, userId));
    return db
      .selectDistinct({ userId: users.id, createdAt: users.createdAt, status: users.status })
      .from(devices)
      .innerJoin(users, eq(users.id, devices.userId))
      .where(
        and(inArray(devices.installId, mine), or(gte(devices.lastSeenAt, since), eq(devices.userId, userId))),
      );
  }

  private async view(r: Row): Promise<RequestView> {
    return {
      id: r.id,
      status: r.status,
      types: r.transportTypes as RequestView['types'],
      seats: r.seats,
      note: r.note,
      showIdentity: r.showIdentity,
      destination: {
        point: { lat: r.destinationLat, lng: r.destinationLng },
        place: r.destinationPlaceId ? await findPlace(this.db, r.destinationPlaceId) : null,
      },
      anchored: r.anchorLat !== null,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      renewalsLeft: Math.max(0, this.t.request_max_renewals - r.renewCount),
      closedAt: iso(r.closedAt),
    };
  }
}

function blocked(blockers: RequestBlocker[]): ApiException {
  const hard = blockers.filter(
    (b) => b === 'DRIVER_ACCOUNT' || b === 'ACCOUNT_SUSPENDED' || b === 'BUS' || b === 'DEVICE_LIMIT',
  );
  if (hard.length > 0) return new ApiException('REQUEST_NOT_ALLOWED', HttpStatus.FORBIDDEN, hard.join(', '));
  if (blockers.includes('PAUSED')) return new ApiException('REQUEST_PAUSED', HttpStatus.FORBIDDEN);
  if (blockers.includes('ALREADY_OPEN')) return new ApiException('REQUEST_ALREADY_OPEN', HttpStatus.CONFLICT);
  return new ApiException('REQUEST_LIMIT', HttpStatus.TOO_MANY_REQUESTS);
}

function anchorOf(state: RequestTrackState) {
  return state.anchor ? { anchorLat: state.anchor.lat, anchorLng: state.anchor.lng } : {};
}
