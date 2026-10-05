import { describe, expect, it } from 'vitest';
import { enqueueCrash, toCrashReport } from './crashes';

const NOW = new Date('2026-10-04T12:00:00Z');

describe('toCrashReport', () => {
  it('scrubs the message and stack before anything is stored or sent', () => {
    const error = new TypeError('no fix at 36.80651, 10.18149 for sami@example.tn');
    error.stack = 'TypeError: no fix at 36.80651, 10.18149\n    at MapScreen (index.bundle:120:7)';
    const r = toCrashReport(error, true, '/request?draft=1', NOW);
    expect(r).toEqual({
      name: 'TypeError',
      message: 'no fix at [coords] for [email]',
      stack: 'TypeError: no fix at [coords]\n    at MapScreen (index.bundle:120:7)',
      screen: '/request',
      fatal: true,
      occurredAt: '2026-10-04T12:00:00.000Z',
    });
  });

  it('copes with things that are not errors', () => {
    expect(toCrashReport('boom', false, null, NOW)).toMatchObject({
      name: 'Error',
      message: 'boom',
      stack: null,
    });
    expect(toCrashReport({ weird: true }, false, null, NOW).message).toBe('Non-error thrown');
  });
});

describe('enqueueCrash', () => {
  const r = (message: string) => toCrashReport(new Error(message), false, '/home', NOW);

  it('keeps the newest reports up to the cap', () => {
    let q = [r('a')];
    for (const m of ['b', 'c', 'd']) q = enqueueCrash(q, r(m), 3);
    expect(q.map((x) => x.message)).toEqual(['b', 'c', 'd']);
  });

  it('keeps a crash repeating in a loop only once', () => {
    expect(enqueueCrash([r('a')], r('a'))).toHaveLength(1);
    expect(enqueueCrash([r('a')], r('b'))).toHaveLength(2);
  });
});
