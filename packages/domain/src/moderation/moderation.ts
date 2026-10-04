import type { Thresholds } from '../config/thresholds.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** R-070. */
export const REPORT_CATEGORIES = [
  'NOBODY_THERE',
  'FAKE_PROFILE',
  'HARASSMENT',
  'UNSAFE',
  'SPAM',
  'OTHER',
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

/**
 * Where a report was filed from (R-070): a driver or passenger marker on the map, the passenger's own
 * request history, or the driver's own session history ("a problem during this session").
 */
export const REPORT_SOURCES = ['DRIVER_MARKER', 'PASSENGER_MARKER', 'MY_REQUEST', 'MY_SESSION'] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];

export const REPORT_STATUSES = ['OPEN', 'ACTIONED', 'DISMISSED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const SANCTION_TYPES = ['WARNING', 'REQUEST_PAUSE', 'SUSPENSION', 'BAN'] as const;
export type SanctionType = (typeof SANCTION_TYPES)[number];
/** REQUEST_PAUSE is the only sanction automation may apply (anti-abuse §1.3); the others are admin decisions. */
export const ADMIN_SANCTION_TYPES = ['WARNING', 'SUSPENSION', 'BAN'] as const;
export type AdminSanctionType = (typeof ADMIN_SANCTION_TYPES)[number];

export const RISK_FLAG_TYPES = [
  'MOCK_LOCATION',
  'IMPOSSIBLE_JUMP',
  'MULTI_ACCOUNT_DEVICE',
  'NOBODY_THERE_CLUSTER',
  'REPORTS_CLUSTER',
] as const;
export type RiskFlagType = (typeof RISK_FLAG_TYPES)[number];

/** Anti-abuse §3: UNSAFE and HARASSMENT are reviewed first (target < 24 h). */
export function reportPriority(category: ReportCategory): 'HIGH' | 'NORMAL' {
  return category === 'UNSAFE' || category === 'HARASSMENT' ? 'HIGH' : 'NORMAL';
}

export type ReportProblem = 'SELF' | 'CATEGORY_NOT_ALLOWED' | 'DAILY_LIMIT';

/**
 * Who may file what. "Nobody there" only makes sense from a driver about a passenger's marker; nobody
 * reports themselves; a reporter has a daily cap so that reports stay a signal, not a weapon.
 */
export function reportProblem(c: {
  source: ReportSource;
  category: ReportCategory;
  reporterIsDriver: boolean;
  reporterId: string;
  targetId: string | null;
  reportsToday: number;
  t: Pick<Thresholds, 'report_daily_limit'>;
}): ReportProblem | null {
  if (c.targetId !== null && c.targetId === c.reporterId) return 'SELF';
  if (c.category === 'NOBODY_THERE' && !(c.source === 'PASSENGER_MARKER' && c.reporterIsDriver)) {
    return 'CATEGORY_NOT_ALLOWED';
  }
  if (c.reportsToday >= c.t.report_daily_limit) return 'DAILY_LIMIT';
  return null;
}

/** For a session report: the approximate time must fall inside the session (with its end, or now). */
export function withinSession(
  at: Date,
  session: { startedAt: Date; endedAt: Date | null },
  now: Date,
): boolean {
  const end = session.endedAt ?? now;
  return at.getTime() >= session.startedAt.getTime() && at.getTime() <= end.getTime();
}

export interface ReportSignal {
  reporterId: string;
  at: Date;
}

/** One report never punishes anyone (anti-abuse §1.4): only distinct reporters in the window count. */
export function distinctReporters(reports: readonly ReportSignal[], now: Date, windowDays: number): number {
  const since = now.getTime() - windowDays * DAY;
  return new Set(reports.filter((r) => r.at.getTime() > since).map((r) => r.reporterId)).size;
}

/** Anti-abuse §3: 3 "nobody there" from distinct drivers in 7 days → a 24 h request pause + flag. */
export function shouldPauseRequests(
  nobodyThere: readonly ReportSignal[],
  now: Date,
  t: Pick<Thresholds, 'nobody_there_reports' | 'nobody_there_window_days'>,
): boolean {
  return distinctReporters(nobodyThere, now, t.nobody_there_window_days) >= t.nobody_there_reports;
}

/** Anti-abuse §3: 3 reports from distinct users on a driver in 7 days → a flag only (admin review). */
export function shouldFlagReports(
  reports: readonly ReportSignal[],
  now: Date,
  t: Pick<Thresholds, 'report_flag_count' | 'report_flag_window_days'>,
): boolean {
  return distinctReporters(reports, now, t.report_flag_window_days) >= t.report_flag_count;
}

export interface SanctionLike {
  type: SanctionType;
  startsAt: Date;
  endsAt: Date | null;
  revokedAt: Date | null;
}

/** A sanction in force now. A WARNING is a notice, never "in force". */
export function isSanctionActive(s: SanctionLike, now: Date): boolean {
  if (s.type === 'WARNING' || s.revokedAt !== null) return false;
  if (s.startsAt.getTime() > now.getTime()) return false;
  return s.endsAt === null || s.endsAt.getTime() > now.getTime();
}

/** When a sanction ends: the pause after `request_pause_h`, a suspension after the admin's days; bans never. */
export function sanctionEndsAt(
  type: SanctionType,
  now: Date,
  days: number | null,
  t: Pick<Thresholds, 'request_pause_h'>,
): Date | null {
  switch (type) {
    case 'REQUEST_PAUSE':
      return new Date(now.getTime() + t.request_pause_h * HOUR);
    case 'SUSPENSION':
      return days === null ? null : new Date(now.getTime() + days * DAY);
    case 'WARNING':
    case 'BAN':
      return null;
  }
}

/** The end of the longest request pause in force, or null. */
export function requestPausedUntil(sanctions: readonly SanctionLike[], now: Date): Date | null {
  let until: Date | null = null;
  for (const s of sanctions) {
    if (s.type !== 'REQUEST_PAUSE' || !isSanctionActive(s, now) || s.endsAt === null) continue;
    if (until === null || s.endsAt.getTime() > until.getTime()) until = s.endsAt;
  }
  return until;
}

/**
 * The account status the sanctions imply: a ban wins over a suspension; otherwise ACTIVE. Used when a
 * sanction is applied, revoked or runs out, so the status always follows the sanctions table.
 */
export function statusFromSanctions(
  sanctions: readonly SanctionLike[],
  now: Date,
): 'ACTIVE' | 'SUSPENDED' | 'BANNED' {
  const active = sanctions.filter((s) => isSanctionActive(s, now));
  if (active.some((s) => s.type === 'BAN')) return 'BANNED';
  if (active.some((s) => s.type === 'SUSPENSION')) return 'SUSPENDED';
  return 'ACTIVE';
}

export interface DeviceAccount {
  userId: string;
  createdAt: Date;
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DELETED';
}

export type DeviceProblem = 'BANNED_ON_DEVICE' | 'TOO_MANY_ACCOUNTS';

/**
 * Anti-abuse §2 and scenario 14: the accounts seen on the user's devices in the last
 * `device_window_days`. A banned account there blocks requesting; beyond `device_max_accounts` live
 * accounts, the newer ones are blocked (the oldest keep working).
 */
export function deviceProblem(
  accounts: readonly DeviceAccount[],
  userId: string,
  t: Pick<Thresholds, 'device_max_accounts'>,
): DeviceProblem | null {
  if (accounts.some((a) => a.userId !== userId && a.status === 'BANNED')) return 'BANNED_ON_DEVICE';
  const live = accounts
    .filter((a) => a.status !== 'DELETED')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.userId.localeCompare(b.userId));
  const rank = live.findIndex((a) => a.userId === userId);
  return rank >= t.device_max_accounts ? 'TOO_MANY_ACCOUNTS' : null;
}
