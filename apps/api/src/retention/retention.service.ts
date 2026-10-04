import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { type Thresholds, coarsenRequest, retentionCutoffs } from '@fi-thnitek/domain';
import { and, inArray, isNotNull, isNull, lt, ne, notExists, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { THRESHOLDS } from '../config/thresholds.provider.js';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import {
  clientErrors,
  passengerRequests,
  pickupRecords,
  reports,
  sharingSessions,
} from '../db/schema/index.js';
import { point } from '../places/places.service.js';

const BATCH = 500;

export interface RetentionCounts {
  coarsenedRequests: number;
  purgedSessions: number;
  purgedPickups: number;
  purgedClientErrors: number;
}

/**
 * docs/domain-model.md §4, run daily: closed requests are coarsened after 30 days, ended sessions (and
 * their events, by cascade) deleted after 12 months, pick-up records after 90 days unless an open report
 * needs them. Idempotent; each step is plain SQL. Audit logs stay (insert-only; ADR-223).
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(THRESHOLDS) private readonly t: Thresholds,
    private readonly audit: AuditService,
  ) {}

  @Cron('30 3 * * *', { name: 'retention', timeZone: 'Africa/Tunis' })
  async handleCron(): Promise<void> {
    try {
      const counts = await this.run();
      if (Object.values(counts).some((n) => n > 0)) {
        this.logger.log(counts, 'retention');
      }
    } catch (error) {
      this.logger.error({ err: error }, 'retention failed');
    }
  }

  async run(now = new Date()): Promise<RetentionCounts> {
    const cut = retentionCutoffs(now, this.t);
    const counts = {
      coarsenedRequests: await this.coarsenRequests(cut.coarsenRequestsBefore, now),
      purgedSessions: await this.purgeSessions(cut.purgeSessionsBefore),
      purgedPickups: await this.purgePickups(cut.purgePickupsBefore),
      purgedClientErrors: (
        await this.db
          .delete(clientErrors)
          .where(lt(clientErrors.receivedAt, cut.purgeClientErrorsBefore))
          .returning({ id: clientErrors.id })
      ).length,
    };
    await this.audit.record({ actorType: 'SYSTEM', action: 'retention.run', metadata: { ...counts } });
    return counts;
  }

  private async coarsenRequests(before: Date, now: Date): Promise<number> {
    let total = 0;
    for (;;) {
      const rows = await this.db
        .select({
          id: passengerRequests.id,
          anchorLat: passengerRequests.anchorLat,
          anchorLng: passengerRequests.anchorLng,
          destinationLat: passengerRequests.destinationLat,
          destinationLng: passengerRequests.destinationLng,
        })
        .from(passengerRequests)
        .where(
          and(
            ne(passengerRequests.status, 'OPEN'),
            isNotNull(passengerRequests.closedAt),
            lt(passengerRequests.closedAt, before),
            isNull(passengerRequests.coarsenedAt),
          ),
        )
        .limit(BATCH);
      if (rows.length === 0) return total;
      await this.db.transaction(async (tx) => {
        for (const r of rows) {
          const c = coarsenRequest(
            {
              anchor:
                r.anchorLat !== null && r.anchorLng !== null ? { lat: r.anchorLat, lng: r.anchorLng } : null,
              destination: { lat: r.destinationLat, lng: r.destinationLng },
            },
            this.t,
          );
          await tx
            .update(passengerRequests)
            .set({
              anchorPoint: c.anchor ? point(c.anchor) : null,
              anchorLat: c.anchor?.lat ?? null,
              anchorLng: c.anchor?.lng ?? null,
              anchorAccuracyM: null,
              destinationPoint: point(c.destination),
              destinationLat: c.destination.lat,
              destinationLng: c.destination.lng,
              lastPoint: null,
              lastLat: null,
              lastLng: null,
              lastAccuracyM: null,
              coarsenedAt: now,
            })
            .where(and(sql`${passengerRequests.id} = ${r.id}`, isNull(passengerRequests.coarsenedAt)));
        }
      });
      total += rows.length;
    }
  }

  private async purgeSessions(before: Date): Promise<number> {
    const deleted = await this.db
      .delete(sharingSessions)
      .where(and(isNotNull(sharingSessions.endedAt), lt(sharingSessions.endedAt, before)))
      .returning({ id: sharingSessions.id });
    return deleted.length;
  }

  private async purgePickups(before: Date): Promise<number> {
    const deleted = await this.db
      .delete(pickupRecords)
      .where(
        and(
          lt(pickupRecords.recordedAt, before),
          notExists(
            this.db
              .select({ one: sql`1` })
              .from(reports)
              .where(
                and(
                  sql`${reports.requestId} = ${pickupRecords.requestId}`,
                  inArray(reports.status, ['OPEN']),
                ),
              ),
          ),
        ),
      )
      .returning({ requestId: pickupRecords.requestId });
    return deleted.length;
  }
}
