import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS as T } from '../config/thresholds.js';
import {
  type DeviceAccount,
  type SanctionLike,
  deviceProblem,
  distinctReporters,
  isSanctionActive,
  reportPriority,
  reportProblem,
  requestPausedUntil,
  sanctionEndsAt,
  shouldFlagReports,
  shouldPauseRequests,
  statusFromSanctions,
  withinSession,
} from './moderation.js';

const NOW = new Date('2026-10-04T12:00:00Z');
const H = 3_600_000;
const D = 24 * H;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const later = (ms: number) => new Date(NOW.getTime() + ms);

describe('reportPriority (anti-abuse §3)', () => {
  it.each([
    ['UNSAFE', 'HIGH'],
    ['HARASSMENT', 'HIGH'],
    ['NOBODY_THERE', 'NORMAL'],
    ['FAKE_PROFILE', 'NORMAL'],
    ['SPAM', 'NORMAL'],
    ['OTHER', 'NORMAL'],
  ] as const)('%s is %s', (category, priority) => {
    expect(reportPriority(category)).toBe(priority);
  });
});

describe('reportProblem (R-070)', () => {
  const base = {
    source: 'DRIVER_MARKER' as const,
    category: 'OTHER' as const,
    reporterIsDriver: false,
    reporterId: 'me',
    targetId: 'them',
    reportsToday: 0,
    t: T,
  };

  it('accepts an ordinary report', () => {
    expect(reportProblem(base)).toBeNull();
  });

  it('refuses reporting yourself', () => {
    expect(reportProblem({ ...base, targetId: 'me' })).toBe('SELF');
  });

  it('accepts reports with no known target (from history)', () => {
    expect(reportProblem({ ...base, source: 'MY_REQUEST', targetId: null })).toBeNull();
  });

  it('allows "nobody there" only from a driver on a passenger marker', () => {
    const nobody = { ...base, category: 'NOBODY_THERE' as const };
    expect(reportProblem({ ...nobody, source: 'PASSENGER_MARKER', reporterIsDriver: true })).toBeNull();
    expect(reportProblem({ ...nobody, source: 'PASSENGER_MARKER', reporterIsDriver: false })).toBe(
      'CATEGORY_NOT_ALLOWED',
    );
    expect(reportProblem({ ...nobody, source: 'DRIVER_MARKER', reporterIsDriver: true })).toBe(
      'CATEGORY_NOT_ALLOWED',
    );
    expect(reportProblem({ ...nobody, source: 'MY_SESSION', reporterIsDriver: true })).toBe(
      'CATEGORY_NOT_ALLOWED',
    );
  });

  it('caps reports per day', () => {
    expect(reportProblem({ ...base, reportsToday: T.report_daily_limit - 1 })).toBeNull();
    expect(reportProblem({ ...base, reportsToday: T.report_daily_limit })).toBe('DAILY_LIMIT');
  });
});

describe('withinSession', () => {
  const session = { startedAt: ago(3 * H), endedAt: ago(H) };
  it('accepts a time inside the session, bounds included', () => {
    expect(withinSession(ago(2 * H), session, NOW)).toBe(true);
    expect(withinSession(session.startedAt, session, NOW)).toBe(true);
    expect(withinSession(session.endedAt, session, NOW)).toBe(true);
  });
  it('refuses times outside it', () => {
    expect(withinSession(ago(4 * H), session, NOW)).toBe(false);
    expect(withinSession(ago(30 * 60_000), session, NOW)).toBe(false);
  });
  it('uses now for a session still running', () => {
    expect(withinSession(ago(60_000), { startedAt: ago(H), endedAt: null }, NOW)).toBe(true);
    expect(withinSession(later(60_000), { startedAt: ago(H), endedAt: null }, NOW)).toBe(false);
  });
});

describe('distinct reporters (anti-abuse §1.4: one report never punishes)', () => {
  it('counts each reporter once, inside the window only', () => {
    const reports = [
      { reporterId: 'a', at: ago(H) },
      { reporterId: 'a', at: ago(2 * H) },
      { reporterId: 'b', at: ago(6 * D) },
      { reporterId: 'c', at: ago(8 * D) },
    ];
    expect(distinctReporters(reports, NOW, 7)).toBe(2);
  });

  it('pauses requests at 3 distinct "nobody there" in 7 days, not before', () => {
    const two = [
      { reporterId: 'a', at: ago(H) },
      { reporterId: 'b', at: ago(D) },
      { reporterId: 'b', at: ago(2 * D) },
    ];
    expect(shouldPauseRequests(two, NOW, T)).toBe(false);
    expect(shouldPauseRequests([...two, { reporterId: 'c', at: ago(6 * D) }], NOW, T)).toBe(true);
    expect(shouldPauseRequests([...two, { reporterId: 'c', at: ago(7 * D + H) }], NOW, T)).toBe(false);
  });

  it('flags a person at 3 distinct reporters in 7 days', () => {
    const reports = ['a', 'b', 'c'].map((r) => ({ reporterId: r, at: ago(D) }));
    expect(shouldFlagReports(reports.slice(0, 2), NOW, T)).toBe(false);
    expect(shouldFlagReports(reports, NOW, T)).toBe(true);
  });
});

describe('sanctions', () => {
  const s = (over: Partial<SanctionLike>): SanctionLike => ({
    type: 'SUSPENSION',
    startsAt: ago(H),
    endsAt: later(D),
    revokedAt: null,
    ...over,
  });

  it('is active between its start and end, unless revoked', () => {
    expect(isSanctionActive(s({}), NOW)).toBe(true);
    expect(isSanctionActive(s({ endsAt: ago(1) }), NOW)).toBe(false);
    expect(isSanctionActive(s({ startsAt: later(1) }), NOW)).toBe(false);
    expect(isSanctionActive(s({ revokedAt: ago(1) }), NOW)).toBe(false);
    expect(isSanctionActive(s({ type: 'BAN', endsAt: null }), NOW)).toBe(true);
  });

  it('never treats a warning as in force', () => {
    expect(isSanctionActive(s({ type: 'WARNING', endsAt: null }), NOW)).toBe(false);
  });

  it('computes the end of each type', () => {
    expect(sanctionEndsAt('REQUEST_PAUSE', NOW, null, T)).toEqual(later(24 * H));
    expect(sanctionEndsAt('SUSPENSION', NOW, 7, T)).toEqual(later(7 * D));
    expect(sanctionEndsAt('SUSPENSION', NOW, null, T)).toBeNull();
    expect(sanctionEndsAt('BAN', NOW, 7, T)).toBeNull();
    expect(sanctionEndsAt('WARNING', NOW, null, T)).toBeNull();
  });

  it('reports the latest request pause in force', () => {
    expect(requestPausedUntil([], NOW)).toBeNull();
    const pauses = [
      s({ type: 'REQUEST_PAUSE', endsAt: later(H) }),
      s({ type: 'REQUEST_PAUSE', endsAt: later(5 * H) }),
      s({ type: 'REQUEST_PAUSE', endsAt: later(9 * H), revokedAt: ago(1) }),
      s({ type: 'SUSPENSION', endsAt: later(20 * H) }),
    ];
    expect(requestPausedUntil(pauses, NOW)).toEqual(later(5 * H));
  });

  it('derives the account status: ban over suspension, otherwise active', () => {
    expect(statusFromSanctions([], NOW)).toBe('ACTIVE');
    expect(statusFromSanctions([s({ type: 'REQUEST_PAUSE' }), s({ type: 'WARNING' })], NOW)).toBe('ACTIVE');
    expect(statusFromSanctions([s({})], NOW)).toBe('SUSPENDED');
    expect(statusFromSanctions([s({}), s({ type: 'BAN', endsAt: null })], NOW)).toBe('BANNED');
    expect(statusFromSanctions([s({ endsAt: ago(1) })], NOW)).toBe('ACTIVE');
    expect(statusFromSanctions([s({ type: 'BAN', endsAt: null, revokedAt: ago(1) })], NOW)).toBe('ACTIVE');
  });
});

describe('deviceProblem (anti-abuse §2, scenario 14)', () => {
  const acc = (userId: string, days: number, status: DeviceAccount['status'] = 'ACTIVE'): DeviceAccount => ({
    userId,
    createdAt: ago(days * D),
    status,
  });

  it('lets the first two accounts on a device request', () => {
    const accounts = [acc('old', 20), acc('mid', 10)];
    expect(deviceProblem(accounts, 'old', T)).toBeNull();
    expect(deviceProblem(accounts, 'mid', T)).toBeNull();
  });

  it('blocks the third and later accounts, never the older ones', () => {
    const accounts = [acc('new', 1), acc('old', 20), acc('mid', 10)];
    expect(deviceProblem(accounts, 'new', T)).toBe('TOO_MANY_ACCOUNTS');
    expect(deviceProblem(accounts, 'old', T)).toBeNull();
  });

  it('does not count deleted accounts', () => {
    const accounts = [acc('gone', 20, 'DELETED'), acc('mid', 10), acc('new', 1)];
    expect(deviceProblem(accounts, 'new', T)).toBeNull();
  });

  it('blocks every other account on a device where an account is banned', () => {
    const accounts = [acc('banned', 20, 'BANNED'), acc('fresh', 1)];
    expect(deviceProblem(accounts, 'fresh', T)).toBe('BANNED_ON_DEVICE');
  });

  it('is fine for a user alone on their device', () => {
    expect(deviceProblem([acc('me', 1)], 'me', T)).toBeNull();
    expect(deviceProblem([], 'me', T)).toBeNull();
  });
});
