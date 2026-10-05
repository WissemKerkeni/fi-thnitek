/** DI token for the live map poll budget (docs/security.md: about one poll per 2 s per user). */
export const MAP_RATE_LIMIT = Symbol('MAP_RATE_LIMIT');

export interface RateBudget {
  limit: number;
  windowMs: number;
}

/**
 * A sliding window per user, in memory (one API process at v0.x, ADR-208). The map allows short
 * bursts (panning around) while holding the average to `limit / windowMs`.
 */
export class WindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly budget: RateBudget) {}

  /** True when this call may proceed (and records it). */
  allow(key: string, now = Date.now()): boolean {
    const since = now - this.budget.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (recent.length >= this.budget.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 50_000) this.prune(since);
    return true;
  }

  private prune(since: number): void {
    for (const [key, times] of this.hits) if (times.every((t) => t <= since)) this.hits.delete(key);
  }
}
