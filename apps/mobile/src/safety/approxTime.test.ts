import { describe, expect, it } from 'vitest';
import { approxInstant } from './approxTime';

// Tunis is UTC+1: 08:00 UTC is 09:00 in Tunis.
const FROM = '2026-10-04T08:12:30Z';
const TO = '2026-10-04T11:00:00Z';

describe('approxInstant (R-070)', () => {
  it('finds the instant of a Tunis time inside the session', () => {
    expect(approxInstant('10:30', FROM, TO)).toBe('2026-10-04T09:30:00.000Z');
    expect(approxInstant('9.15', FROM, TO)).toBe('2026-10-04T08:15:00.000Z');
    expect(approxInstant('11h05', FROM, TO)).toBe('2026-10-04T10:05:00.000Z');
  });

  it('accepts the start minute and the end', () => {
    expect(approxInstant('09:12', FROM, TO)).toBe(FROM.replace('Z', '.000Z'));
    expect(approxInstant('12:00', FROM, TO)).toBe('2026-10-04T11:00:00.000Z');
  });

  it('refuses times outside the session and malformed input', () => {
    expect(approxInstant('08:59', FROM, TO)).toBeNull();
    expect(approxInstant('12:01', FROM, TO)).toBeNull();
    expect(approxInstant('25:00', FROM, TO)).toBeNull();
    expect(approxInstant('abc', FROM, TO)).toBeNull();
  });

  it('handles a session that runs past midnight', () => {
    const from = '2026-10-04T21:00:00Z'; // 22:00 Tunis
    const to = '2026-10-05T01:00:00Z'; // 02:00 Tunis
    expect(approxInstant('23:30', from, to)).toBe('2026-10-04T22:30:00.000Z');
    expect(approxInstant('01:15', from, to)).toBe('2026-10-05T00:15:00.000Z');
    expect(approxInstant('03:00', from, to)).toBeNull();
  });
});
