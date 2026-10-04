import { Inject, Injectable } from '@nestjs/common';
import type { AdminClientErrorList, ClientErrorsRequest } from '@fi-thnitek/contracts';
import { errorFingerprint, scrubText } from '@fi-thnitek/domain';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { clientErrors } from '../db/schema/index.js';

const DAY = 86_400_000;
/** A report claiming to be from the future or older than this is clamped to "now". */
const MAX_AGE_MS = 7 * DAY;

/** Phase 9 crash monitoring (ADR-223): stored scrubbed, grouped for the admin by fingerprint. */
@Injectable()
export class ClientErrorsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async record(req: ClientErrorsRequest, now = new Date()): Promise<void> {
    await this.db.insert(clientErrors).values(
      req.errors.map((e) => {
        const name = scrubText(e.name, 200);
        const message = scrubText(e.message);
        const stack = e.stack ? scrubText(e.stack, 8000) : null;
        const at = new Date(e.occurredAt);
        const valid = at.getTime() <= now.getTime() && now.getTime() - at.getTime() <= MAX_AGE_MS;
        return {
          id: uuidv7(),
          fingerprint: errorFingerprint(name, message, stack),
          name,
          message,
          stack,
          screen: e.screen ? scrubText(e.screen, 200) : null,
          fatal: e.fatal,
          installId: req.installId,
          platform: req.platform,
          appVersion: req.appVersion,
          occurredAt: valid ? at : now,
          receivedAt: now,
        };
      }),
    );
  }

  async groups(days: number, now = new Date()): Promise<AdminClientErrorList> {
    const since = new Date(now.getTime() - days * DAY);
    const { rows } = await this.db.execute<{
      fingerprint: string;
      name: string;
      message: string;
      stack: string | null;
      screen: string | null;
      fatal: boolean;
      count: number;
      installs: number;
      app_versions: string[];
      first_at: Date | string;
      last_at: Date | string;
    }>(sql`
      SELECT fingerprint,
             (array_agg(name ORDER BY received_at DESC))[1] AS name,
             (array_agg(message ORDER BY received_at DESC))[1] AS message,
             (array_agg(stack ORDER BY received_at DESC))[1] AS stack,
             (array_agg(screen ORDER BY received_at DESC))[1] AS screen,
             bool_or(fatal) AS fatal,
             count(*)::int AS count,
             count(DISTINCT install_id)::int AS installs,
             array_agg(DISTINCT app_version) AS app_versions,
             min(occurred_at) AS first_at,
             max(occurred_at) AS last_at
      FROM ${clientErrors}
      WHERE received_at >= ${since}
      GROUP BY fingerprint
      ORDER BY max(occurred_at) DESC
      LIMIT 200`);
    return {
      groups: rows.map((r) => ({
        fingerprint: r.fingerprint,
        name: r.name,
        message: r.message,
        stack: r.stack,
        screen: r.screen,
        fatal: r.fatal,
        count: r.count,
        installs: r.installs,
        appVersions: r.app_versions,
        firstAt: new Date(r.first_at).toISOString(),
        lastAt: new Date(r.last_at).toISOString(),
      })),
    };
  }
}
