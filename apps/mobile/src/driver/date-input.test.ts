import { describe, expect, it } from 'vitest';
import { fromIsoDate, toIsoDate } from './date-input.js';

describe('toIsoDate', () => {
  it('builds ISO dates from day/month/year boxes', () => {
    expect(toIsoDate('5', '3', '2028')).toBe('2028-03-05');
    expect(toIsoDate('31', '12', '2030')).toBe('2030-12-31');
  });

  it('rejects impossible or incomplete dates', () => {
    expect(toIsoDate('31', '2', '2028')).toBeNull();
    expect(toIsoDate('', '2', '2028')).toBeNull();
    expect(toIsoDate('1', '13', '2028')).toBeNull();
    expect(toIsoDate('1', '1', '28')).toBeNull();
  });

  it('round-trips with fromIsoDate', () => {
    expect(fromIsoDate('2029-07-14')).toEqual({ day: '14', month: '07', year: '2029' });
    expect(fromIsoDate(null)).toEqual({ day: '', month: '', year: '' });
  });
});
