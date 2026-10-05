import { Inject, Injectable } from '@nestjs/common';
import type { AdminFieldMetrics, Spread } from '@fi-thnitek/contracts';
import type { Thresholds } from '@fi-thnitek/domain';
import { type SQL, sql } from 'drizzle-orm';
import { THRESHOLDS } from '../config/thresholds.provider.js';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';

/** The thresholds each measurement speaks to (shown next to it on the admin page). */
const RELATED: (keyof Thresholds)[] = [
  'anchor_timeout_s',
  'anchor_max_accuracy_m',
  'move_away_m',
  'move_away_confirm_s',
  'location_lost_min',
  'request_ttl_min',
  'request_max_renewals',
  'ping_gap_s',
  'cooldown_min',
  'session_max_h',
  'pickup_radius_m',
  'nobody_there_reports',
];

/**
 * Phase 9, threshold tuning from field data: aggregates only (counts and percentiles), never a
 * position or a person. Durations come from timestamps already stored for the rules.
 */
@Injectable()
export class FieldMetricsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(THRESHOLDS) private readonly t: Thresholds,
  ) {}

  async metrics(from: Date, to: Date): Promise<AdminFieldMetrics> {
    const inRequests = sql`created_at >= ${from} AND created_at < ${to}`;
    const inSessions = sql`started_at >= ${from} AND started_at < ${to}`;
    const inPickups = sql`recorded_at >= ${from} AND recorded_at < ${to}`;

    const [
      requestsByStatus,
      anchorDelayS,
      anchorAccuracyM,
      waitBeforeMovedAwayMin,
      renewed,
      sessionsByReason,
      durationMin,
      sessionTotals,
      distanceM,
      movedAwayWithDriver,
      reportsByCategory,
    ] = await Promise.all([
      this.grouped(
        sql`SELECT status::text AS k, count(*)::int AS n FROM passenger_requests WHERE ${inRequests} GROUP BY 1`,
      ),
      this.spread(
        sql`SELECT EXTRACT(EPOCH FROM visible_at - created_at) AS v FROM passenger_requests WHERE ${inRequests} AND visible_at IS NOT NULL`,
      ),
      this.spread(
        sql`SELECT anchor_accuracy_m AS v FROM passenger_requests WHERE ${inRequests} AND anchor_accuracy_m IS NOT NULL`,
      ),
      this.spread(
        sql`SELECT EXTRACT(EPOCH FROM closed_at - visible_at) / 60 AS v FROM passenger_requests WHERE ${inRequests} AND status = 'MOVED_AWAY' AND visible_at IS NOT NULL`,
      ),
      this.count(
        sql`SELECT count(*)::int AS n FROM passenger_requests WHERE ${inRequests} AND renew_count > 0`,
      ),
      this.grouped(
        sql`SELECT COALESCE(end_reason::text, 'ACTIVE') AS k, count(*)::int AS n FROM sharing_sessions WHERE ${inSessions} GROUP BY 1`,
      ),
      this.spread(
        sql`SELECT EXTRACT(EPOCH FROM ended_at - started_at) / 60 AS v FROM sharing_sessions WHERE ${inSessions} AND ended_at IS NOT NULL`,
      ),
      this.db.execute<{ total: number; breaks: number | null; cooldowns: number }>(
        sql`SELECT count(*)::int AS total, avg(breaks_count)::float AS breaks, count(*) FILTER (WHERE cooldown_applied)::int AS cooldowns FROM sharing_sessions WHERE ${inSessions}`,
      ),
      this.spread(sql`SELECT min_distance_m AS v FROM pickup_records WHERE ${inPickups}`),
      this.count(sql`SELECT count(DISTINCT request_id)::int AS n FROM pickup_records WHERE ${inPickups}`),
      this.grouped(
        sql`SELECT category::text AS k, count(*)::int AS n FROM reports WHERE created_at >= ${from} AND created_at < ${to} GROUP BY 1`,
      ),
    ]);
    const totals = sessionTotals.rows[0];

    return {
      requests: {
        total: Object.values(requestsByStatus).reduce((a, b) => a + b, 0),
        byStatus: requestsByStatus,
        anchorDelayS,
        anchorAccuracyM,
        waitBeforeMovedAwayMin,
        renewed,
      },
      sessions: {
        total: totals?.total ?? 0,
        byEndReason: sessionsByReason,
        durationMin,
        breaksPerSession: totals?.breaks ?? null,
        cooldownsApplied: totals?.cooldowns ?? 0,
      },
      pickups: { total: distanceM.n, distanceM, movedAwayWithDriver },
      reports: { byCategory: reportsByCategory },
      thresholds: Object.fromEntries(RELATED.map((k) => [k, this.t[k]])),
    };
  }

  private async grouped(query: SQL): Promise<Record<string, number>> {
    const { rows } = await this.db.execute<{ k: string; n: number }>(query);
    return Object.fromEntries(rows.map((r) => [r.k, r.n]));
  }

  private async count(query: SQL): Promise<number> {
    const { rows } = await this.db.execute<{ n: number }>(query);
    return rows[0]?.n ?? 0;
  }

  /** Median and 90th percentile of the single numeric column `v`, rounded to one decimal. */
  private async spread(values: SQL): Promise<Spread> {
    const { rows } = await this.db.execute<{ n: number; p50: number | null; p90: number | null }>(
      sql`SELECT count(*)::int AS n,
                 round(percentile_cont(0.5) WITHIN GROUP (ORDER BY v)::numeric, 1)::float AS p50,
                 round(percentile_cont(0.9) WITHIN GROUP (ORDER BY v)::numeric, 1)::float AS p90
          FROM (${values}) AS s`,
    );
    const r = rows[0];
    return { n: r?.n ?? 0, p50: r?.p50 ?? null, p90: r?.p90 ?? null };
  }
}
