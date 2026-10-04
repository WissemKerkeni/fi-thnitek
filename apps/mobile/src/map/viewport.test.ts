import { describe, expect, it } from 'vitest';
import { bboxAround, bboxKey, bboxOf } from './viewport';

describe('viewport', () => {
  it('converts MapLibre bounds (west, south, east, north)', () => {
    expect(bboxOf([10.1, 36.7, 10.3, 36.9])).toEqual({ south: 36.7, west: 10.1, north: 36.9, east: 10.3 });
  });

  it('builds a box around a centre', () => {
    expect(bboxAround([10, 36], 0.5)).toEqual({ south: 35.5, west: 9.5, north: 36.5, east: 10.5 });
  });

  it('keys boxes to ~100 m so small pans share a query', () => {
    const a = bboxKey({ south: 36.70001, west: 10.1, north: 36.9, east: 10.3 });
    const b = bboxKey({ south: 36.70004, west: 10.1, north: 36.9, east: 10.3 });
    expect(a).toBe(b);
  });
});
