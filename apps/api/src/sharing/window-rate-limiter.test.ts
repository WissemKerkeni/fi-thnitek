import { describe, expect, it } from 'vitest';
import { WindowRateLimiter } from './window-rate-limiter.js';

describe('WindowRateLimiter', () => {
  it('allows a burst up to the limit, then refuses until the window slides', () => {
    const limiter = new WindowRateLimiter({ limit: 3, windowMs: 10_000 });
    expect([0, 100, 200].map((t) => limiter.allow('u', t))).toEqual([true, true, true]);
    expect(limiter.allow('u', 300)).toBe(false);
    expect(limiter.allow('u', 10_001)).toBe(true);
    expect(limiter.allow('u', 10_050)).toBe(false);
  });

  it('keeps users apart', () => {
    const limiter = new WindowRateLimiter({ limit: 1, windowMs: 2_000 });
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('b', 0)).toBe(true);
    expect(limiter.allow('a', 1_000)).toBe(false);
  });
});
