import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS as T } from '../config/thresholds.js';
import {
  type RoutineLike,
  type RoutineSchedule,
  daysMaskOf,
  daysOf,
  isPastOneOff,
  isRoutineLive,
  nextOccurrence,
  occurrenceNear,
  occurrences,
  parseLocalTime,
  routinePrefill,
  routineProblems,
  staleAction,
  usesRoutine,
} from './routines.js';

/** Tunis local time → UTC instant (UTC+1). 2026-10-05 is a Monday. */
const tunis = (iso: string) => new Date(`${iso}+01:00`);
const weekdays: RoutineSchedule = {
  kind: 'WEEKLY',
  daysMask: daysMaskOf(['MON', 'TUE', 'WED', 'THU', 'FRI']),
  localTime: '07:00',
};

describe('days mask', () => {
  it('uses Monday = 1 … Sunday = 64 and round-trips', () => {
    expect(daysMaskOf(['MON'])).toBe(1);
    expect(daysMaskOf(['SUN'])).toBe(64);
    expect(daysMaskOf(['MON', 'WED', 'SUN'])).toBe(1 + 4 + 64);
    expect(daysOf(1 + 4 + 64)).toEqual(['MON', 'WED', 'SUN']);
  });
});

describe('parseLocalTime', () => {
  it('accepts 24 h HH:MM only', () => {
    expect(parseLocalTime('00:00')).toBe(0);
    expect(parseLocalTime('07:30')).toBe(450);
    expect(parseLocalTime('23:59')).toBe(1439);
    for (const bad of ['24:00', '7:30', '07:60', '07h30', '']) expect(parseLocalTime(bad)).toBeNull();
  });
});

describe('occurrences (Africa/Tunis, UTC+1 all year)', () => {
  it('expands weekdays at the local time, across weeks', () => {
    const list = occurrences(weekdays, tunis('2026-10-03T12:00'), tunis('2026-10-12T23:00'));
    expect(list.map((d) => d.toISOString())).toEqual([
      '2026-10-05T06:00:00.000Z',
      '2026-10-06T06:00:00.000Z',
      '2026-10-07T06:00:00.000Z',
      '2026-10-08T06:00:00.000Z',
      '2026-10-09T06:00:00.000Z',
      '2026-10-12T06:00:00.000Z',
    ]);
  });

  it('keeps the same UTC time in winter and summer (no DST in Tunisia)', () => {
    const sunday: RoutineSchedule = { kind: 'WEEKLY', daysMask: daysMaskOf(['SUN']), localTime: '18:30' };
    expect(occurrences(sunday, tunis('2027-01-03T00:00'), tunis('2027-01-03T23:59'))[0]?.toISOString()).toBe(
      '2027-01-03T17:30:00.000Z',
    );
    expect(occurrences(sunday, tunis('2027-07-04T00:00'), tunis('2027-07-04T23:59'))[0]?.toISOString()).toBe(
      '2027-07-04T17:30:00.000Z',
    );
  });

  it('handles departures just after local midnight (still the previous UTC day)', () => {
    const late: RoutineSchedule = { kind: 'WEEKLY', daysMask: daysMaskOf(['MON']), localTime: '00:30' };
    expect(
      occurrences(late, tunis('2026-10-04T23:00'), tunis('2026-10-05T02:00')).map((d) => d.toISOString()),
    ).toEqual(['2026-10-04T23:30:00.000Z']);
  });

  it('includes a one-off only inside the range', () => {
    const once: RoutineSchedule = { kind: 'ONE_OFF', at: tunis('2026-10-10T09:00') };
    expect(occurrences(once, tunis('2026-10-10T08:00'), tunis('2026-10-10T10:00'))).toHaveLength(1);
    expect(occurrences(once, tunis('2026-10-10T09:01'), tunis('2026-10-11T10:00'))).toHaveLength(0);
  });

  it('returns nothing for an empty mask or a malformed time', () => {
    expect(
      occurrences({ ...weekdays, daysMask: 0 }, tunis('2026-10-05T00:00'), tunis('2026-10-12T00:00')),
    ).toEqual([]);
    expect(
      occurrences({ ...weekdays, localTime: '7h' }, tunis('2026-10-05T00:00'), tunis('2026-10-12T00:00')),
    ).toEqual([]);
  });
});

describe('nextOccurrence and occurrenceNear', () => {
  it('finds the next departure within 7 days', () => {
    expect(nextOccurrence(weekdays, tunis('2026-10-09T08:00'))?.toISOString()).toBe(
      '2026-10-12T06:00:00.000Z',
    );
    const once: RoutineSchedule = { kind: 'ONE_OFF', at: tunis('2026-10-20T09:00') };
    expect(nextOccurrence(once, tunis('2026-10-09T08:00'))).toBeNull();
  });

  it('finds the departure closest to a moment within the window', () => {
    expect(occurrenceNear(weekdays, tunis('2026-10-05T07:45'), 60)?.toISOString()).toBe(
      '2026-10-05T06:00:00.000Z',
    );
    expect(occurrenceNear(weekdays, tunis('2026-10-05T06:00'), 60)?.toISOString()).toBe(
      '2026-10-05T06:00:00.000Z',
    );
    expect(occurrenceNear(weekdays, tunis('2026-10-05T08:01'), 60)).toBeNull();
    expect(occurrenceNear(weekdays, tunis('2026-10-04T07:00'), 60)).toBeNull();
  });
});

describe('liveness', () => {
  it('drops inactive, hidden and past one-off routines', () => {
    const now = tunis('2026-10-05T12:00');
    expect(isRoutineLive({ schedule: weekdays, active: true, hiddenAt: null }, now)).toBe(true);
    expect(isRoutineLive({ schedule: weekdays, active: false, hiddenAt: null }, now)).toBe(false);
    expect(isRoutineLive({ schedule: weekdays, active: true, hiddenAt: now }, now)).toBe(false);
    const past: RoutineSchedule = { kind: 'ONE_OFF', at: tunis('2026-10-05T11:00') };
    expect(isPastOneOff(past, now)).toBe(true);
    expect(isRoutineLive({ schedule: past, active: true, hiddenAt: null }, now)).toBe(false);
  });
});

describe('routinePrefill (R-051)', () => {
  const routine = (id: string, schedule: RoutineSchedule, patch: Partial<RoutineLike> = {}): RoutineLike => ({
    id,
    toPlaceId: `place-${id}`,
    schedule,
    active: true,
    hiddenAt: null,
    ...patch,
  });

  it('picks the live routine departing closest to now within ±60 min', () => {
    const routines = [
      routine('a', weekdays),
      routine('b', { kind: 'WEEKLY', daysMask: daysMaskOf(['MON']), localTime: '07:40' }),
      routine('c', { kind: 'WEEKLY', daysMask: daysMaskOf(['MON']), localTime: '07:20' }, { active: false }),
    ];
    expect(routinePrefill(routines, tunis('2026-10-05T07:25'), T)?.routine.id).toBe('b');
    expect(routinePrefill(routines, tunis('2026-10-05T06:10'), T)?.routine.id).toBe('a');
  });

  it('suggests nothing outside the window', () => {
    expect(routinePrefill([routine('a', weekdays)], tunis('2026-10-05T09:00'), T)).toBeNull();
  });
});

describe('usesRoutine (R-067)', () => {
  const r = { toPlaceId: 'sousse', schedule: weekdays };

  it('counts a session to the same place near a departure', () => {
    expect(usesRoutine(r, 'sousse', tunis('2026-10-05T07:30'), T)).toBe(true);
  });

  it('ignores another destination, no destination, or another time', () => {
    expect(usesRoutine(r, 'sfax', tunis('2026-10-05T07:30'), T)).toBe(false);
    expect(usesRoutine(r, null, tunis('2026-10-05T07:30'), T)).toBe(false);
    expect(usesRoutine(r, 'sousse', tunis('2026-10-05T12:00'), T)).toBe(false);
  });
});

describe('staleAction (R-067)', () => {
  const created = tunis('2026-09-01T10:00');
  const base = { active: true, hiddenAt: null, createdAt: created, lastUsedAt: null, stalePromptedAt: null };
  const day = (n: number) => new Date(created.getTime() + n * 86_400_000);

  it('asks after 30 days without use', () => {
    expect(staleAction(base, day(29), T)).toBe('NONE');
    expect(staleAction(base, day(30), T)).toBe('PROMPT');
  });

  it('counts from the last use', () => {
    expect(staleAction({ ...base, lastUsedAt: day(20) }, day(40), T)).toBe('NONE');
    expect(staleAction({ ...base, lastUsedAt: day(20) }, day(50), T)).toBe('PROMPT');
  });

  it('hides 7 days after an unanswered prompt', () => {
    const prompted = { ...base, stalePromptedAt: day(30) };
    expect(staleAction(prompted, day(36), T)).toBe('NONE');
    expect(staleAction(prompted, day(37), T)).toBe('HIDE');
  });

  it('leaves inactive and hidden routines alone', () => {
    expect(staleAction({ ...base, active: false }, day(90), T)).toBe('NONE');
    expect(staleAction({ ...base, hiddenAt: day(40) }, day(90), T)).toBe('NONE');
  });
});

describe('routineProblems (R-065)', () => {
  const now = tunis('2026-10-05T12:00');
  const ok = { fromPlaceId: 'tunis', toPlaceId: 'sousse', schedule: weekdays };

  it('accepts a valid weekly routine', () => {
    expect(routineProblems(ok, 4, now, T)).toEqual([]);
  });

  it('allows at most 5 routines', () => {
    expect(routineProblems(ok, 5, now, T)).toEqual(['TOO_MANY']);
  });

  it('rejects the same place twice, no day, a bad time, a one-off in the past', () => {
    expect(routineProblems({ ...ok, toPlaceId: 'tunis' }, 0, now, T)).toEqual(['SAME_PLACES']);
    expect(routineProblems({ ...ok, schedule: { ...weekdays, daysMask: 0 } }, 0, now, T)).toEqual([
      'NO_DAYS',
    ]);
    expect(routineProblems({ ...ok, schedule: { ...weekdays, localTime: '25:00' } }, 0, now, T)).toEqual([
      'BAD_TIME',
    ]);
    expect(
      routineProblems({ ...ok, schedule: { kind: 'ONE_OFF', at: tunis('2026-10-05T11:00') } }, 0, now, T),
    ).toEqual(['IN_THE_PAST']);
  });
});
