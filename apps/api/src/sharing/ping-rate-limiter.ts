/** DI token for the minimum time between two ping uploads of the same user (docs/security.md: 1 per 3 s). */
export const PING_MIN_INTERVAL_MS = Symbol('PING_MIN_INTERVAL_MS');

/**
 * In-memory, per API process (a single instance at v0.x, ADR-208). Rejected uploads stay in the phone's
 * buffer and go with the next one, so a 429 loses nothing.
 */
export class PingRateLimiter {
  private readonly last = new Map<string, number>();

  constructor(private readonly minIntervalMs: number) {}

  /** True when this upload may proceed (and records it). */
  allow(userId: string, now = Date.now()): boolean {
    const previous = this.last.get(userId);
    if (previous !== undefined && now - previous < this.minIntervalMs) return false;
    this.last.set(userId, now);
    if (this.last.size > 50_000) this.prune(now);
    return true;
  }

  private prune(now: number): void {
    for (const [userId, at] of this.last) if (now - at >= this.minIntervalMs) this.last.delete(userId);
  }
}
