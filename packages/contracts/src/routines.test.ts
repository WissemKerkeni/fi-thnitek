import { describe, expect, it } from 'vitest';
import { RoutineInput } from './routines.js';

const base = {
  fromPlaceId: '0199a000-0000-7000-8000-000000000001',
  toPlaceId: '0199a000-0000-7000-8000-000000000002',
};

describe('routine contracts', () => {
  it('defaults the optional fields', () => {
    expect(
      RoutineInput.parse({ ...base, schedule: { kind: 'WEEKLY', days: ['MON'], localTime: '07:00' } }),
    ).toMatchObject({ seats: null, note: null, active: true });
  });

  it('requires days and a 24 h time for weekly routines, a date-time for one-offs', () => {
    expect(
      RoutineInput.safeParse({ ...base, schedule: { kind: 'WEEKLY', days: [], localTime: '07:00' } }).success,
    ).toBe(false);
    expect(
      RoutineInput.safeParse({ ...base, schedule: { kind: 'WEEKLY', days: ['SUN'], localTime: '7:00' } })
        .success,
    ).toBe(false);
    expect(
      RoutineInput.safeParse({ ...base, schedule: { kind: 'ONE_OFF', at: '2026-10-10T08:00:00Z' } }).success,
    ).toBe(true);
    expect(RoutineInput.safeParse({ ...base, schedule: { kind: 'ONE_OFF', at: 'demain' } }).success).toBe(
      false,
    );
  });

  it('limits the note to 80 characters', () => {
    const schedule = { kind: 'WEEKLY', days: ['MON'], localTime: '07:00' };
    expect(RoutineInput.safeParse({ ...base, schedule, note: 'x'.repeat(81) }).success).toBe(false);
  });
});
