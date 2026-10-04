import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Place, RoutineInput, RoutineList, RoutineView } from '@fi-thnitek/contracts';
import {
  type RoutineSchedule,
  type Thresholds,
  daysMaskOf,
  daysOf,
  isRoutineLive,
  nextOccurrence,
  occurrences,
  routinePrefill,
  routineProblems,
  staleAction,
  usesRoutine,
} from '@fi-thnitek/domain';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { z } from 'zod';
import { ApiException } from '../common/api-exception.js';
import { THRESHOLDS } from '../config/thresholds.provider.js';
import type { Database, Executor } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { driverProfiles, driverRoutines, places, vehicles } from '../db/schema/index.js';
import { PushService } from '../notifications/push.service.js';
import { findPlace } from '../places/places.service.js';

type Row = typeof driverRoutines.$inferSelect;
const DAY_MS = 86_400_000;

export function scheduleOf(
  r: Pick<Row, 'scheduleKind' | 'oneOffAt' | 'daysMask' | 'localTime'>,
): RoutineSchedule {
  return r.scheduleKind === 'ONE_OFF'
    ? { kind: 'ONE_OFF', at: r.oneOffAt! }
    : { kind: 'WEEKLY', daysMask: r.daysMask ?? 0, localTime: r.localTime ?? '' };
}

/** Driver routine routes (R-065…R-068). Rules in packages/domain/routines; this service persists them. */
@Injectable()
export class RoutinesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(THRESHOLDS) private readonly t: Thresholds,
    private readonly push: PushService,
  ) {}

  async list(userId: string, now = new Date()): Promise<RoutineList> {
    const rows = await this.db
      .select()
      .from(driverRoutines)
      .where(eq(driverRoutines.driverUserId, userId))
      .orderBy(driverRoutines.createdAt);
    const placeById = await this.places(rows.flatMap((r) => [r.fromPlaceId, r.toPlaceId]));
    return {
      max: this.t.routine_max,
      routines: rows.map((r) => this.view(r, placeById, now)),
    };
  }

  async create(userId: string, input: z.output<typeof RoutineInput>, now = new Date()): Promise<RoutineView> {
    const id = uuidv7();
    await this.db.transaction(async (tx) => {
      // Serialises concurrent creations against the limit.
      const transportType = await this.lockDriver(tx, userId);
      const [count] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(driverRoutines)
        .where(eq(driverRoutines.driverUserId, userId));
      await this.validate(tx, input, count?.n ?? 0, now);
      await tx.insert(driverRoutines).values({
        id,
        driverUserId: userId,
        transportType,
        ...columnsOf(input),
        lastUsedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });
    return this.get(userId, id, now);
  }

  async update(
    userId: string,
    id: string,
    input: z.output<typeof RoutineInput>,
    now = new Date(),
  ): Promise<RoutineView> {
    await this.db.transaction(async (tx) => {
      await this.lockDriver(tx, userId);
      const current = await this.owned(tx, userId, id);
      await this.validate(tx, input, 0, now);
      const reactivated = input.active && (!current.active || current.hiddenAt !== null);
      await tx
        .update(driverRoutines)
        .set({
          ...columnsOf(input),
          updatedAt: now,
          // Reactivating a stale (hidden) routine shows it again and restarts the 30-day clock.
          ...(reactivated && { hiddenAt: null, stalePromptedAt: null, lastUsedAt: now }),
        })
        .where(eq(driverRoutines.id, id));
    });
    return this.get(userId, id, now);
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(driverRoutines)
      .where(and(eq(driverRoutines.id, id), eq(driverRoutines.driverUserId, userId)))
      .returning({ id: driverRoutines.id });
    if (deleted.length !== 1) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
  }

  /** R-067 answer: yes keeps it (and shows it again), no switches it off. */
  async stillRunning(userId: string, id: string, running: boolean, now = new Date()): Promise<RoutineView> {
    const updated = await this.db
      .update(driverRoutines)
      .set(
        running
          ? { active: true, hiddenAt: null, stalePromptedAt: null, lastUsedAt: now, updatedAt: now }
          : { active: false, stalePromptedAt: null, updatedAt: now },
      )
      .where(and(eq(driverRoutines.id, id), eq(driverRoutines.driverUserId, userId)))
      .returning({ id: driverRoutines.id });
    if (updated.length !== 1) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
    return this.get(userId, id, now);
  }

  /** R-051: the destination of the routine departing closest to now (±60 min), or null. */
  async suggestion(userId: string, now = new Date(), db: Executor = this.db): Promise<Place | null> {
    const rows = await db.select().from(driverRoutines).where(eq(driverRoutines.driverUserId, userId));
    const best = routinePrefill(rows.map(asRoutineLike), now, this.t);
    return best ? findPlace(db, best.routine.toPlaceId) : null;
  }

  /** R-067: a session heading to a routine's destination near one of its departures counts as a use. */
  async markUsed(db: Executor, userId: string, headingToPlaceId: string | null, at: Date): Promise<void> {
    if (!headingToPlaceId) return;
    const rows = await db
      .select()
      .from(driverRoutines)
      .where(and(eq(driverRoutines.driverUserId, userId), eq(driverRoutines.toPlaceId, headingToPlaceId)));
    const used = rows
      .filter((r) => usesRoutine(asRoutineLike(r), headingToPlaceId, at, this.t))
      .map((r) => r.id);
    if (used.length === 0) return;
    await db
      .update(driverRoutines)
      .set({ lastUsedAt: at, stalePromptedAt: null })
      .where(inArray(driverRoutines.id, used));
  }

  /** R-066 / R-022: each driver's next live routine departure in the next 7 days. */
  async nextFor(
    driverUserIds: readonly string[],
    now = new Date(),
  ): Promise<Map<string, { toNameAr: string; toNameFr: string; at: Date }>> {
    const out = new Map<string, { toNameAr: string; toNameFr: string; at: Date }>();
    if (driverUserIds.length === 0) return out;
    const rows = await this.db
      .select({ routine: driverRoutines, nameAr: places.nameAr, nameFr: places.nameFr })
      .from(driverRoutines)
      .innerJoin(places, eq(places.id, driverRoutines.toPlaceId))
      .where(
        and(
          inArray(driverRoutines.driverUserId, [...driverUserIds]),
          eq(driverRoutines.active, true),
          isNull(driverRoutines.hiddenAt),
        ),
      );
    for (const { routine, nameAr, nameFr } of rows) {
      const schedule = scheduleOf(routine);
      if (!isRoutineLive({ schedule, active: routine.active, hiddenAt: routine.hiddenAt }, now)) continue;
      const at = nextOccurrence(schedule, now);
      const current = out.get(routine.driverUserId);
      if (at && (!current || at < current.at))
        out.set(routine.driverUserId, { toNameAr: nameAr, toNameFr: nameFr, at });
    }
    return out;
  }

  /** Daily: "Still running this route?" after 30 unused days, hidden 7 days after an unanswered prompt. */
  async staleSweep(now = new Date()): Promise<{ prompted: number; hidden: number }> {
    const rows = await this.db
      .select()
      .from(driverRoutines)
      .where(and(eq(driverRoutines.active, true), isNull(driverRoutines.hiddenAt)));
    const prompt: Row[] = [];
    const hide: string[] = [];
    for (const r of rows) {
      const action = staleAction(r, now, this.t);
      if (action === 'PROMPT') prompt.push(r);
      if (action === 'HIDE') hide.push(r.id);
    }
    if (prompt.length > 0) {
      await this.db
        .update(driverRoutines)
        .set({ stalePromptedAt: now })
        .where(
          and(
            inArray(
              driverRoutines.id,
              prompt.map((r) => r.id),
            ),
            isNull(driverRoutines.stalePromptedAt),
          ),
        );
    }
    if (hide.length > 0) {
      await this.db.update(driverRoutines).set({ hiddenAt: now }).where(inArray(driverRoutines.id, hide));
    }
    // One push per driver, whatever the number of routines to confirm.
    for (const userId of new Set(prompt.map((r) => r.driverUserId))) {
      await this.push.notifyUser(userId, 'ROUTINE_STALE');
    }
    return { prompted: prompt.length, hidden: hide.length };
  }

  private async get(userId: string, id: string, now: Date): Promise<RoutineView> {
    const row = await this.owned(this.db, userId, id);
    return this.view(row, await this.places([row.fromPlaceId, row.toPlaceId]), now);
  }

  private async owned(db: Executor, userId: string, id: string): Promise<Row> {
    const [row] = await db
      .select()
      .from(driverRoutines)
      .where(and(eq(driverRoutines.id, id), eq(driverRoutines.driverUserId, userId)));
    if (!row) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
    return row;
  }

  /** Routines are for verified drivers (R-065); returns the vehicle type. Locks the profile row. */
  private async lockDriver(db: Executor, userId: string): Promise<Row['transportType']> {
    const [profile] = await db
      .select({ status: driverProfiles.status })
      .from(driverProfiles)
      .where(eq(driverProfiles.userId, userId))
      .for('update');
    const [vehicle] = await db
      .select({ transportType: vehicles.transportType })
      .from(vehicles)
      .where(eq(vehicles.driverUserId, userId));
    if (profile?.status !== 'VERIFIED' || !vehicle) {
      throw new ApiException('FORBIDDEN', HttpStatus.FORBIDDEN, 'NOT_VERIFIED');
    }
    return vehicle.transportType;
  }

  private async validate(db: Executor, input: z.output<typeof RoutineInput>, existing: number, now: Date) {
    const problems = routineProblems(
      { fromPlaceId: input.fromPlaceId, toPlaceId: input.toPlaceId, schedule: toSchedule(input.schedule) },
      existing,
      now,
      this.t,
    );
    if (problems.includes('TOO_MANY')) {
      throw new ApiException('ROUTINE_LIMIT', HttpStatus.CONFLICT, `At most ${this.t.routine_max} routines`);
    }
    if (problems.length > 0)
      throw new ApiException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, problems.join(', '));
    const found = await db
      .select({ id: places.id })
      .from(places)
      .where(inArray(places.id, [input.fromPlaceId, input.toPlaceId]));
    if (found.length !== 2)
      throw new ApiException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'Unknown place');
  }

  private async places(ids: string[]): Promise<Map<string, Place>> {
    const unique = [...new Set(ids)];
    const found = await Promise.all(unique.map((id) => findPlace(this.db, id)));
    return new Map(found.filter((p): p is Place => p !== null).map((p) => [p.id, p]));
  }

  private view(r: Row, placeById: Map<string, Place>, now: Date): RoutineView {
    const schedule = scheduleOf(r);
    const live = isRoutineLive({ schedule, active: r.active, hiddenAt: r.hiddenAt }, now);
    return {
      id: r.id,
      transportType: r.transportType,
      from: placeById.get(r.fromPlaceId)!,
      to: placeById.get(r.toPlaceId)!,
      schedule:
        schedule.kind === 'ONE_OFF'
          ? { kind: 'ONE_OFF', at: schedule.at.toISOString() }
          : { kind: 'WEEKLY', days: daysOf(schedule.daysMask), localTime: schedule.localTime },
      seats: r.seats,
      note: r.note,
      active: r.active,
      hidden: r.hiddenAt !== null,
      stillRunningPending: r.stalePromptedAt !== null && r.hiddenAt === null,
      nextOccurrences: live
        ? occurrences(schedule, now, new Date(now.getTime() + 7 * DAY_MS)).map((d) => d.toISOString())
        : [],
    };
  }
}

function toSchedule(s: z.output<typeof RoutineInput>['schedule']): RoutineSchedule {
  return s.kind === 'ONE_OFF'
    ? { kind: 'ONE_OFF', at: new Date(s.at) }
    : { kind: 'WEEKLY', daysMask: daysMaskOf(s.days), localTime: s.localTime };
}

function columnsOf(input: z.output<typeof RoutineInput>) {
  const s = input.schedule;
  return {
    fromPlaceId: input.fromPlaceId,
    toPlaceId: input.toPlaceId,
    scheduleKind: s.kind,
    oneOffAt: s.kind === 'ONE_OFF' ? new Date(s.at) : null,
    daysMask: s.kind === 'WEEKLY' ? daysMaskOf(s.days) : null,
    localTime: s.kind === 'WEEKLY' ? s.localTime : null,
    seats: input.seats,
    note: input.note || null,
    active: input.active,
  };
}

function asRoutineLike(r: Row) {
  return {
    id: r.id,
    toPlaceId: r.toPlaceId,
    schedule: scheduleOf(r),
    active: r.active,
    hiddenAt: r.hiddenAt,
  };
}
