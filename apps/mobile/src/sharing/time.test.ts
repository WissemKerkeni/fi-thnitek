import { describe, expect, it } from 'vitest';
import { breakLabel, countdown } from './time';

describe('countdown', () => {
  const now = Date.UTC(2026, 9, 3, 10, 0, 0);
  const at = (s: number) => new Date(now + s * 1000).toISOString();

  it('shows minutes and seconds, then hours', () => {
    expect(countdown(at(65), now)).toBe('1:05');
    expect(countdown(at(3_725), now)).toBe('1:02:05');
  });

  it('stops at zero', () => {
    expect(countdown(at(-30), now)).toBe('0:00');
  });
});

describe('breakLabel', () => {
  it('uses hours for whole hours', () => {
    expect(breakLabel(30)).toEqual({ key: 'sharing.breakMinutes', value: 30 });
    expect(breakLabel(120)).toEqual({ key: 'sharing.breakHours', value: 2 });
  });
});
