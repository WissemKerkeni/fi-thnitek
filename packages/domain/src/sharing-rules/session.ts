import type { Thresholds } from '../config/thresholds.js';
import { defineMachine } from '../state-machines/fsm.js';
import type { VerificationState } from '../verification/verification.js';

/** docs/domain-model.md § Sharing. ENDED sessions keep their row (metadata only, no coordinates). */
export const SHARING_STATES = ['SHARING', 'ON_BREAK', 'ENDED'] as const;
export type SharingState = (typeof SHARING_STATES)[number];

export const SESSION_END_REASONS = [
  'MANUAL_STOP',
  'LOCATION_OFF',
  'PING_GAP',
  'SPOOF_SUSPECTED',
  'MAX_DURATION',
  'BREAK_NOT_RESUMED',
  'SUSPENDED',
  'ADMIN',
] as const;
export type SessionEndReason = (typeof SESSION_END_REASONS)[number];

export const SESSION_EVENT_TYPES = [
  'STARTED',
  'FULL_ON',
  'FULL_OFF',
  'BREAK_STARTED',
  'RESUMED',
  'HEADING_CHANGED',
  'STILL_WORKING_PROMPTED',
  'STILL_WORKING_CONFIRMED',
  'ENDED',
] as const;
export type SessionEventType = (typeof SESSION_EVENT_TYPES)[number];

export type SharingEvent = 'TOGGLE_FULL' | 'START_BREAK' | 'RESUME' | 'END';

/**
 * SHARING ⇄ ON_BREAK → ENDED. There is deliberately no event that ends a break early (R-055):
 * from ON_BREAK the only ways out are RESUME (after `break_until`) and END.
 */
export const sharingMachine = defineMachine<SharingState, SharingEvent>('sharing_session', {
  SHARING: { TOGGLE_FULL: 'SHARING', START_BREAK: 'ON_BREAK', END: 'ENDED' },
  ON_BREAK: { RESUME: 'SHARING', END: 'ENDED' },
  ENDED: {},
});

/** Undeclared stops: a 1 h cooldown (product rule 6, R-057, R-059). Full and Break never trigger it. */
export const COOLDOWN_REASONS: ReadonlySet<SessionEndReason> = new Set([
  'MANUAL_STOP',
  'LOCATION_OFF',
  'PING_GAP',
  'SPOOF_SUSPECTED',
]);

const MIN = 60_000;

/**
 * When the driver may start again, or null for no cooldown. A PING_GAP counts from the last good fix
 * (the driver has been off the map since then; anti-abuse scenario 5); other stops count from the end.
 */
export function cooldownUntil(
  reason: SessionEndReason,
  endedAt: Date,
  lastFixAt: Date | null,
  t: Pick<Thresholds, 'cooldown_min'>,
): Date | null {
  if (!COOLDOWN_REASONS.has(reason)) return null;
  const from = reason === 'PING_GAP' && lastFixAt && lastFixAt < endedAt ? lastFixAt : endedAt;
  return new Date(from.getTime() + t.cooldown_min * MIN);
}

export type StartBlocker =
  'NOT_VERIFIED' | 'ACCOUNT_SUSPENDED' | 'NO_VEHICLE' | 'ALREADY_SHARING' | 'COOLDOWN';

export interface StartContext {
  verification: VerificationState | null;
  accountActive: boolean;
  hasVehicle: boolean;
  hasActiveSession: boolean;
  cooldownUntil: Date | null;
  now: Date;
}

/** R-050: everything that prevents "Start sharing", in the order the app should explain them. */
export function startBlockers(c: StartContext): StartBlocker[] {
  const blockers: StartBlocker[] = [];
  if (!c.accountActive) blockers.push('ACCOUNT_SUSPENDED');
  if (c.verification !== 'VERIFIED') blockers.push('NOT_VERIFIED');
  if (!c.hasVehicle) blockers.push('NO_VEHICLE');
  if (c.hasActiveSession) blockers.push('ALREADY_SHARING');
  if (c.cooldownUntil && c.now < c.cooldownUntil) blockers.push('COOLDOWN');
  return blockers;
}

export type FixProblem = 'FIX_STALE' | 'FIX_MOCKED';

/** The fix sent with start/resume must be recent and real ("a fresh fix", R-050). */
export function startFixProblem(
  fix: { ts: number; isMock: boolean },
  now: Date,
  t: Pick<Thresholds, 'driver_fresh_s'>,
): FixProblem | null {
  if (fix.isMock) return 'FIX_MOCKED';
  const age = now.getTime() - fix.ts;
  return age > t.driver_fresh_s * 1000 || age < -t.driver_fresh_s * 1000 ? 'FIX_STALE' : null;
}

/** R-055: a break of one of the configured lengths; throws for any other length. */
export function breakEnd(startedAt: Date, minutes: number, t: Pick<Thresholds, 'break_options_min'>): Date {
  if (!t.break_options_min.includes(minutes))
    throw new RangeError(`Break must be one of ${t.break_options_min.join(', ')} min`);
  return new Date(startedAt.getTime() + minutes * MIN);
}

export type ResumeCheck = 'OK' | 'TOO_EARLY' | 'TOO_LATE';

/** Resuming is possible from `break_until` until the end of the resume window, never before. */
export function resumeCheck(
  breakUntil: Date,
  now: Date,
  t: Pick<Thresholds, 'break_resume_window_min'>,
): ResumeCheck {
  if (now < breakUntil) return 'TOO_EARLY';
  if (now.getTime() > breakUntil.getTime() + t.break_resume_window_min * MIN) return 'TOO_LATE';
  return 'OK';
}

/** R-058: "Still working?" is due `session_max_h` after the start, then again after each confirmation. */
export function stillWorkingDueAt(
  startedAt: Date,
  confirmedAt: Date | null,
  t: Pick<Thresholds, 'session_max_h'>,
): Date {
  const from = confirmedAt && confirmedAt > startedAt ? confirmedAt : startedAt;
  return new Date(from.getTime() + t.session_max_h * 60 * MIN);
}

export interface SweepSession {
  state: Exclude<SharingState, 'ENDED'>;
  /** False once the account is suspended/banned or the verification is no longer VERIFIED (R-064). */
  driverAllowed: boolean;
  startedAt: Date;
  lastFixAt: Date | null;
  breakUntil: Date | null;
  breakRemindedAt: Date | null;
  stillWorkingPromptedAt: Date | null;
  stillWorkingConfirmedAt: Date | null;
}

export type SweepAction =
  | { type: 'NONE' }
  | {
      type: 'END';
      reason: Extract<SessionEndReason, 'PING_GAP' | 'BREAK_NOT_RESUMED' | 'MAX_DURATION' | 'SUSPENDED'>;
    }
  | { type: 'REMIND_BREAK_OVER' }
  | { type: 'PROMPT_STILL_WORKING' };

/**
 * The periodic job (docs/architecture.md §4.4), one action per session per run: endings first, then
 * reminders. A missing fix for longer than the offline buffer can hold means the phone is gone.
 */
export function sweepSession(
  s: SweepSession,
  now: Date,
  t: Pick<
    Thresholds,
    'break_resume_window_min' | 'session_max_h' | 'still_working_answer_min' | 'driver_buffer_max_min'
  >,
): SweepAction {
  const due = stillWorkingDueAt(s.startedAt, s.stillWorkingConfirmedAt, t);
  const prompted = s.stillWorkingPromptedAt !== null && s.stillWorkingPromptedAt >= due;

  if (!s.driverAllowed) return { type: 'END', reason: 'SUSPENDED' };
  if (s.state === 'ON_BREAK' && s.breakUntil && resumeCheck(s.breakUntil, now, t) === 'TOO_LATE') {
    return { type: 'END', reason: 'BREAK_NOT_RESUMED' };
  }
  if (prompted && now.getTime() >= s.stillWorkingPromptedAt!.getTime() + t.still_working_answer_min * MIN) {
    return { type: 'END', reason: 'MAX_DURATION' };
  }
  if (s.state === 'SHARING') {
    const since = (s.lastFixAt ?? s.startedAt).getTime();
    if (now.getTime() - since > t.driver_buffer_max_min * MIN) return { type: 'END', reason: 'PING_GAP' };
  }
  if (s.state === 'ON_BREAK' && s.breakUntil && now >= s.breakUntil && !s.breakRemindedAt) {
    return { type: 'REMIND_BREAK_OVER' };
  }
  if (now >= due && !prompted) return { type: 'PROMPT_STILL_WORKING' };
  return { type: 'NONE' };
}
