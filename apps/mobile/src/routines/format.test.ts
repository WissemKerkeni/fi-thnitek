import { describe, expect, it } from 'vitest';
import { scheduleSummary, stepTime, tunisParts, tunisToIso, tunisTomorrow } from './format';

const t = (key: string) => key.replace('routines.', '');

describe('Tunis-local date and time', () => {
  it('converts both ways at UTC+1', () => {
    expect(tunisToIso('2026-10-12', '09:30')).toBe('2026-10-12T08:30:00.000Z');
    expect(tunisParts('2026-10-12T23:30:00.000Z')).toEqual({ date: '2026-10-13', time: '00:30' });
  });

  it('defaults a one-off trip to tomorrow in Tunis', () => {
    expect(tunisTomorrow(Date.UTC(2026, 9, 12, 23, 30))).toBe('2026-10-14');
  });
});

describe('scheduleSummary', () => {
  it('summarises weekly schedules', () => {
    expect(
      scheduleSummary({ kind: 'WEEKLY', days: ['MON', 'TUE', 'WED', 'THU', 'FRI'], localTime: '07:00' }, t),
    ).toBe('weekdays · 07:00');
    expect(
      scheduleSummary(
        { kind: 'WEEKLY', days: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], localTime: '06:30' },
        t,
      ),
    ).toBe('everyDay · 06:30');
    expect(scheduleSummary({ kind: 'WEEKLY', days: ['WED', 'MON'], localTime: '18:00' }, t)).toBe(
      'day_MON, day_WED · 18:00',
    );
  });

  it('shows a one-off as its Tunis date and time', () => {
    expect(scheduleSummary({ kind: 'ONE_OFF', at: '2026-10-12T08:30:00.000Z' }, t)).toBe('12/10 · 09:30');
  });
});

describe('stepTime', () => {
  it('steps hours and 5-minute slots with wrap-around', () => {
    expect(stepTime('07:00', 'hour', 1)).toBe('08:00');
    expect(stepTime('23:10', 'hour', 1)).toBe('00:10');
    expect(stepTime('00:00', 'hour', -1)).toBe('23:00');
    expect(stepTime('07:55', 'minute', 1)).toBe('07:00');
    expect(stepTime('07:00', 'minute', -1)).toBe('07:55');
    expect(stepTime('07:07', 'minute', 1)).toBe('07:10');
  });
});
