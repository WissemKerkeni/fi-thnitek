import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS as T } from '../config/thresholds.js';
import { InvalidStateTransitionError } from '../state-machines/fsm.js';
import { isFixFresh } from './fixes.js';
import {
  COOLDOWN_REASONS,
  SESSION_END_REASONS,
  type StartContext,
  type SweepSession,
  autoResumeFixAnchor,
  breakEnd,
  cooldownUntil,
  isBreakOver,
  sharingMachine,
  startBlockers,
  startFixProblem,
  stillWorkingDueAt,
  sweepSession,
} from './session.js';

const at = (iso: string) => new Date(`2026-10-03T${iso}Z`);
const MIN = 60_000;

describe('sharingMachine', () => {
  it('toggles Full and starts breaks only while sharing', () => {
    expect(sharingMachine.transition('SHARING', 'TOGGLE_FULL')).toBe('SHARING');
    expect(sharingMachine.transition('SHARING', 'START_BREAK')).toBe('ON_BREAK');
    expect(sharingMachine.can('ON_BREAK', 'TOGGLE_FULL')).toBe(false);
    expect(sharingMachine.can('ON_BREAK', 'START_BREAK')).toBe(false);
  });

  it('leaves a break only by resuming or ending (no early end, R-055)', () => {
    expect(sharingMachine.allowedEvents('ON_BREAK')).toEqual(['RESUME', 'END']);
    expect(sharingMachine.can('SHARING', 'RESUME')).toBe(false);
  });

  it('treats ENDED as terminal', () => {
    expect(sharingMachine.allowedEvents('ENDED')).toEqual([]);
    expect(() => sharingMachine.transition('ENDED', 'RESUME')).toThrow(InvalidStateTransitionError);
  });
});

describe('cooldownUntil', () => {
  const end = at('10:00:00');

  it('applies 1 h after undeclared stops only', () => {
    for (const reason of SESSION_END_REASONS) {
      const until = cooldownUntil(reason, end, end, T);
      if (COOLDOWN_REASONS.has(reason)) expect(until).toEqual(at('11:00:00'));
      else expect(until).toBeNull();
    }
    expect([...COOLDOWN_REASONS].sort()).toEqual([
      'LOCATION_OFF',
      'MANUAL_STOP',
      'PING_GAP',
      'SPOOF_SUSPECTED',
    ]);
  });

  it('counts a ping gap from the last good fix', () => {
    expect(cooldownUntil('PING_GAP', end, at('09:20:00'), T)).toEqual(at('10:20:00'));
    expect(cooldownUntil('PING_GAP', end, null, T)).toEqual(at('11:00:00'));
  });

  it('counts other stops from the end even with an older fix', () => {
    expect(cooldownUntil('MANUAL_STOP', end, at('09:20:00'), T)).toEqual(at('11:00:00'));
  });

  it('follows the configured length', () => {
    expect(cooldownUntil('MANUAL_STOP', end, null, { cooldown_min: 30 })).toEqual(at('10:30:00'));
  });
});

describe('startBlockers (R-050)', () => {
  const ok: StartContext = {
    verification: 'VERIFIED',
    accountActive: true,
    hasVehicle: true,
    hasActiveSession: false,
    cooldownUntil: null,
    now: at('10:00:00'),
  };

  it('allows a verified driver with a vehicle and no cooldown', () => {
    expect(startBlockers(ok)).toEqual([]);
  });

  it.each([
    [{ verification: 'UNDER_REVIEW' as const }, 'NOT_VERIFIED'],
    [{ verification: 'EXPIRED' as const }, 'NOT_VERIFIED'],
    [{ verification: 'SUSPENDED' as const }, 'NOT_VERIFIED'],
    [{ verification: null }, 'NOT_VERIFIED'],
    [{ accountActive: false }, 'ACCOUNT_SUSPENDED'],
    [{ hasVehicle: false }, 'NO_VEHICLE'],
    [{ hasActiveSession: true }, 'ALREADY_SHARING'],
    [{ cooldownUntil: at('10:00:01') }, 'COOLDOWN'],
  ])('blocks %o with %s', (patch, blocker) => {
    expect(startBlockers({ ...ok, ...patch })).toEqual([blocker]);
  });

  it('lets the driver start exactly when the cooldown ends', () => {
    expect(startBlockers({ ...ok, cooldownUntil: at('10:00:00') })).toEqual([]);
  });
});

describe('startFixProblem', () => {
  const now = at('10:00:00');

  it('accepts a recent real fix', () => {
    expect(startFixProblem({ ts: now.getTime() - 119_000, isMock: false }, now, T)).toBeNull();
  });

  it('rejects stale, far-future and mock fixes', () => {
    expect(startFixProblem({ ts: now.getTime() - 121_000, isMock: false }, now, T)).toBe('FIX_STALE');
    expect(startFixProblem({ ts: now.getTime() + 121_000, isMock: false }, now, T)).toBe('FIX_STALE');
    expect(startFixProblem({ ts: now.getTime(), isMock: true }, now, T)).toBe('FIX_MOCKED');
  });
});

describe('breaks (R-055)', () => {
  it('offers only the configured lengths', () => {
    expect(breakEnd(at('10:00:00'), 30, T)).toEqual(at('10:30:00'));
    expect(breakEnd(at('10:00:00'), 120, T)).toEqual(at('12:00:00'));
    expect(() => breakEnd(at('10:00:00'), 45, T)).toThrow(RangeError);
  });

  it('is over at its end (ADR-227: it can also be ended earlier at any time)', () => {
    const until = at('10:30:00');
    expect(isBreakOver(until, at('10:29:59'))).toBe(false);
    expect(isBreakOver(until, at('10:30:00'))).toBe(true);
  });

  it('resumes by itself without a fresh fix, but restarts the gap clock (ADR-227)', () => {
    const now = at('10:30:00');
    const anchor = autoResumeFixAnchor(now, T);
    expect(isFixFresh(anchor.getTime(), now.getTime(), T)).toBe(false);
    expect(now.getTime() - anchor.getTime()).toBeLessThan(T.driver_buffer_max_min * MIN);
  });

  it('can be resumed at any time while on break', () => {
    expect(sharingMachine.can('ON_BREAK', 'RESUME')).toBe(true);
  });
});

describe('stillWorkingDueAt (R-058)', () => {
  it('is 12 h after the start, then 12 h after each confirmation', () => {
    const start = new Date('2026-10-03T06:00:00Z');
    expect(stillWorkingDueAt(start, null, T)).toEqual(new Date('2026-10-03T18:00:00Z'));
    expect(stillWorkingDueAt(start, new Date('2026-10-03T18:05:00Z'), T)).toEqual(
      new Date('2026-10-04T06:05:00Z'),
    );
  });
});

describe('sweepSession', () => {
  const start = new Date('2026-10-03T06:00:00Z');
  const base: SweepSession = {
    state: 'SHARING',
    driverAllowed: true,
    startedAt: start,
    lastFixAt: start,
    breakUntil: null,
    stillWorkingPromptedAt: null,
    stillWorkingConfirmedAt: null,
  };
  const plus = (min: number) => new Date(start.getTime() + min * MIN);

  it('ends a suspended or no longer verified driver first, without cooldown', () => {
    expect(sweepSession({ ...base, driverAllowed: false }, plus(1), T)).toEqual({
      type: 'END',
      reason: 'SUSPENDED',
    });
    expect(COOLDOWN_REASONS.has('SUSPENDED')).toBe(false);
  });

  it('does nothing for a healthy session', () => {
    expect(sweepSession({ ...base, lastFixAt: plus(59) }, plus(60), T)).toEqual({ type: 'NONE' });
  });

  it('keeps a silent session while the offline buffer can still cover it, then ends it (PING_GAP)', () => {
    expect(sweepSession(base, plus(60), T)).toEqual({ type: 'NONE' });
    expect(sweepSession(base, plus(61), T)).toEqual({ type: 'END', reason: 'PING_GAP' });
    expect(sweepSession({ ...base, lastFixAt: null }, plus(61), T)).toEqual({
      type: 'END',
      reason: 'PING_GAP',
    });
  });

  it('never ends a break for missing fixes (none are expected)', () => {
    const onBreak = {
      ...base,
      state: 'ON_BREAK' as const,
      breakUntil: plus(120),
    };
    expect(sweepSession(onBreak, plus(119), T)).toEqual({ type: 'NONE' });
  });

  it('resumes by itself when the break time is over (ADR-227)', () => {
    const onBreak = { ...base, state: 'ON_BREAK' as const, breakUntil: plus(30) };
    expect(sweepSession(onBreak, plus(29), T)).toEqual({ type: 'NONE' });
    expect(sweepSession(onBreak, plus(30), T)).toEqual({ type: 'AUTO_RESUME' });
    expect(sweepSession(onBreak, plus(90), T)).toEqual({ type: 'AUTO_RESUME' });
  });

  it('asks "Still working?" at 12 h (breaks included) and ends after 10 min unanswered', () => {
    const at12h = plus(12 * 60);
    expect(sweepSession({ ...base, lastFixAt: at12h }, at12h, T)).toEqual({ type: 'PROMPT_STILL_WORKING' });
    const prompted = { ...base, lastFixAt: plus(12 * 60 + 9), stillWorkingPromptedAt: at12h };
    expect(sweepSession(prompted, plus(12 * 60 + 9), T)).toEqual({ type: 'NONE' });
    expect(sweepSession(prompted, plus(12 * 60 + 10), T)).toEqual({ type: 'END', reason: 'MAX_DURATION' });
    const onBreak = {
      ...prompted,
      state: 'ON_BREAK' as const,
      breakUntil: plus(13 * 60),
    };
    expect(sweepSession(onBreak, plus(12 * 60 + 10), T)).toEqual({ type: 'END', reason: 'MAX_DURATION' });
  });

  it('starts a new 12 h period after a confirmation', () => {
    const confirmed = {
      ...base,
      lastFixAt: plus(13 * 60),
      stillWorkingPromptedAt: plus(12 * 60),
      stillWorkingConfirmedAt: plus(12 * 60 + 2),
    };
    expect(sweepSession(confirmed, plus(13 * 60), T)).toEqual({ type: 'NONE' });
    expect(sweepSession({ ...confirmed, lastFixAt: plus(24 * 60 + 2) }, plus(24 * 60 + 2), T)).toEqual({
      type: 'PROMPT_STILL_WORKING',
    });
  });

  it('gives at least the answer time even if the prompt went out late', () => {
    const late = { ...base, lastFixAt: plus(14 * 60), stillWorkingPromptedAt: plus(14 * 60) };
    expect(sweepSession(late, plus(14 * 60 + 5), T)).toEqual({ type: 'NONE' });
  });
});
