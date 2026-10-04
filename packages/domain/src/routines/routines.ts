import type { Thresholds } from '../config/thresholds.js';

/** Africa/Tunis is UTC+1 all year (no daylight saving since 2009). */
export const TUNIS_UTC_OFFSET_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

/** Monday first, as on Tunisian calendars; `days_mask` bit i = WEEKDAYS[i] (Mon = 1 … Sun = 64). */
export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type RoutineSchedule =
  { kind: 'ONE_OFF'; at: Date } | { kind: 'WEEKLY'; daysMask: number; localTime: string };

export function daysMaskOf(days: readonly Weekday[]): number {
  return days.reduce((mask, d) => mask | (1 << WEEKDAYS.indexOf(d)), 0);
}

export function daysOf(mask: number): Weekday[] {
  return WEEKDAYS.filter((_, i) => (mask & (1 << i)) !== 0);
}

/** "07:30" → 450 minutes after local midnight, or null when malformed. */
export function parseLocalTime(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Tunis-local midnight (as a UTC instant) of the day containing `at`. */
function tunisMidnight(at: Date): number {
  const local = at.getTime() + TUNIS_UTC_OFFSET_MS;
  return local - (((local % DAY_MS) + DAY_MS) % DAY_MS) - TUNIS_UTC_OFFSET_MS;
}

/** Index in WEEKDAYS of the Tunis-local day starting at `midnight`. */
function weekdayIndex(midnight: number): number {
  const sundayFirst = new Date(midnight + TUNIS_UTC_OFFSET_MS).getUTCDay();
  return (sundayFirst + 6) % 7;
}

/** Every departure in [from, until], in time order (weekly times are Tunis-local). */
export function occurrences(s: RoutineSchedule, from: Date, until: Date): Date[] {
  if (s.kind === 'ONE_OFF') return s.at >= from && s.at <= until ? [s.at] : [];
  const minutes = parseLocalTime(s.localTime);
  if (minutes === null || s.daysMask === 0) return [];
  const out: Date[] = [];
  for (let day = tunisMidnight(from); day <= until.getTime(); day += DAY_MS) {
    if ((s.daysMask & (1 << weekdayIndex(day))) === 0) continue;
    const at = day + minutes * MIN_MS;
    if (at >= from.getTime() && at <= until.getTime()) out.push(new Date(at));
  }
  return out;
}

/** The next departure within `horizonDays` (R-066: "next 7 days"), or null. */
export function nextOccurrence(s: RoutineSchedule, now: Date, horizonDays = 7): Date | null {
  return occurrences(s, now, new Date(now.getTime() + horizonDays * DAY_MS))[0] ?? null;
}

/** The departure closest to `at` within ±`windowMin`, or null. */
export function occurrenceNear(s: RoutineSchedule, at: Date, windowMin: number): Date | null {
  const w = windowMin * MIN_MS;
  const near = occurrences(s, new Date(at.getTime() - w), new Date(at.getTime() + w));
  return (
    near.sort((a, b) => Math.abs(a.getTime() - at.getTime()) - Math.abs(b.getTime() - at.getTime()))[0] ??
    null
  );
}

/** A one-off routine whose time has passed is over (it deactivates itself). */
export function isPastOneOff(s: RoutineSchedule, now: Date): boolean {
  return s.kind === 'ONE_OFF' && s.at < now;
}

export interface RoutineLike {
  id: string;
  toPlaceId: string;
  schedule: RoutineSchedule;
  active: boolean;
  hiddenAt: Date | null;
}

/** A routine shows (finder, driver card, prefill) only when active, not hidden for staleness, not over. */
export function isRoutineLive(r: Omit<RoutineLike, 'id' | 'toPlaceId'>, now: Date): boolean {
  return r.active && r.hiddenAt === null && !isPastOneOff(r.schedule, now);
}

/**
 * R-051: "heading to" is pre-filled from the live routine departing closest to now within
 * ±`routine_prefill_window_min`.
 */
export function routinePrefill<R extends RoutineLike>(
  routines: readonly R[],
  now: Date,
  t: Pick<Thresholds, 'routine_prefill_window_min'>,
): { routine: R; at: Date } | null {
  let best: { routine: R; at: Date } | null = null;
  for (const routine of routines) {
    if (!isRoutineLive(routine, now)) continue;
    const at = occurrenceNear(routine.schedule, now, t.routine_prefill_window_min);
    if (!at) continue;
    if (!best || Math.abs(at.getTime() - now.getTime()) < Math.abs(best.at.getTime() - now.getTime())) {
      best = { routine, at };
    }
  }
  return best;
}

/**
 * R-067: a session "uses" a routine when its heading-to is the routine's destination and it is shared
 * within ±`routine_prefill_window_min` of one of its departures.
 */
export function usesRoutine(
  routine: Pick<RoutineLike, 'toPlaceId' | 'schedule'>,
  headingToPlaceId: string | null,
  at: Date,
  t: Pick<Thresholds, 'routine_prefill_window_min'>,
): boolean {
  return (
    headingToPlaceId !== null &&
    headingToPlaceId === routine.toPlaceId &&
    occurrenceNear(routine.schedule, at, t.routine_prefill_window_min) !== null
  );
}

export interface StalenessInput {
  active: boolean;
  hiddenAt: Date | null;
  createdAt: Date;
  /** Last matching session or "still running" answer. */
  lastUsedAt: Date | null;
  stalePromptedAt: Date | null;
}

export type StaleAction = 'NONE' | 'PROMPT' | 'HIDE';

/**
 * R-067: unused for `routine_stale_days` → ask "Still running this route?" once; no answer within
 * `routine_prompt_grace_days` → hidden until the driver reactivates it.
 */
export function staleAction(
  r: StalenessInput,
  now: Date,
  t: Pick<Thresholds, 'routine_stale_days' | 'routine_prompt_grace_days'>,
): StaleAction {
  if (!r.active || r.hiddenAt) return 'NONE';
  if (r.stalePromptedAt) {
    return now.getTime() - r.stalePromptedAt.getTime() >= t.routine_prompt_grace_days * DAY_MS
      ? 'HIDE'
      : 'NONE';
  }
  const since = (r.lastUsedAt && r.lastUsedAt > r.createdAt ? r.lastUsedAt : r.createdAt).getTime();
  return now.getTime() - since >= t.routine_stale_days * DAY_MS ? 'PROMPT' : 'NONE';
}

export type RoutineProblem = 'TOO_MANY' | 'SAME_PLACES' | 'NO_DAYS' | 'BAD_TIME' | 'IN_THE_PAST';

/** R-065 rules for a new or edited routine. `existing` counts the driver's other routines. */
export function routineProblems(
  input: { fromPlaceId: string; toPlaceId: string; schedule: RoutineSchedule },
  existing: number,
  now: Date,
  t: Pick<Thresholds, 'routine_max'>,
): RoutineProblem[] {
  const problems: RoutineProblem[] = [];
  if (existing >= t.routine_max) problems.push('TOO_MANY');
  if (input.fromPlaceId === input.toPlaceId) problems.push('SAME_PLACES');
  const s = input.schedule;
  if (s.kind === 'WEEKLY') {
    if (s.daysMask <= 0 || s.daysMask > 127) problems.push('NO_DAYS');
    if (parseLocalTime(s.localTime) === null) problems.push('BAD_TIME');
  } else if (s.at <= now) {
    problems.push('IN_THE_PAST');
  }
  return problems;
}
