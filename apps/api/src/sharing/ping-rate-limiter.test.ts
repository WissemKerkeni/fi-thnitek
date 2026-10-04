import { describe, expect, it } from 'vitest';
import { PingRateLimiter } from './ping-rate-limiter.js';

describe('PingRateLimiter', () => {
  it('allows one upload per interval and per user', () => {
    const limiter = new PingRateLimiter(3_000);
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('a', 2_999)).toBe(false);
    expect(limiter.allow('b', 2_999)).toBe(true);
    expect(limiter.allow('a', 3_000)).toBe(true);
  });

  it('can be disabled with a zero interval', () => {
    const limiter = new PingRateLimiter(0);
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('a', 0)).toBe(true);
  });
});
