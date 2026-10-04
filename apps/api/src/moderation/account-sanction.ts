import type { AccountSanction } from '@fi-thnitek/contracts';
import { isSanctionActive } from '@fi-thnitek/domain';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { sanctions } from '../db/schema/index.js';

/**
 * R-073: the suspension or ban in force, for the 403 problem (why and until when). A ban wins; among
 * suspensions, the one ending last.
 */
export async function accountSanction(
  db: Executor,
  userId: string,
  now = new Date(),
): Promise<AccountSanction | undefined> {
  const rows = await db
    .select()
    .from(sanctions)
    .where(
      and(
        eq(sanctions.userId, userId),
        inArray(sanctions.type, ['SUSPENSION', 'BAN']),
        isNull(sanctions.revokedAt),
      ),
    )
    .orderBy(desc(sanctions.startsAt));
  const active = rows.filter((s) => isSanctionActive(s, now));
  const s =
    active.find((r) => r.type === 'BAN') ??
    active.sort((a, b) => (b.endsAt?.getTime() ?? 0) - (a.endsAt?.getTime() ?? 0))[0];
  if (!s) return undefined;
  return { type: s.type as 'SUSPENSION' | 'BAN', reason: s.reason, endsAt: s.endsAt?.toISOString() ?? null };
}
