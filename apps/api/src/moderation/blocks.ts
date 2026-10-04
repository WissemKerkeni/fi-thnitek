import { eq, or } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { blocks } from '../db/schema/index.js';

/**
 * R-027: everyone the user blocked or was blocked by. Either direction hides both people from each
 * other's map and finder. One indexed lookup per poll.
 */
export async function blockedWith(db: Executor, userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ blocker: blocks.blockerUserId, blocked: blocks.blockedUserId })
    .from(blocks)
    .where(or(eq(blocks.blockerUserId, userId), eq(blocks.blockedUserId, userId)));
  return new Set(rows.map((r) => (r.blocker === userId ? r.blocked : r.blocker)));
}
