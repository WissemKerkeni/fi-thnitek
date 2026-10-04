import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS as T } from '../config/thresholds.js';
import { clusterPoints } from '../visibility/clusters.js';
import { alongSegment, finderGroup, finderOrder, isHeadingTo, routineMatches } from './finder.js';

const TUNIS = { lat: 36.8065, lng: 10.1815 };
const HAMMAMET = { lat: 36.4, lng: 10.6167 };
const ENFIDHA = { lat: 36.1333, lng: 10.3833 };
const SOUSSE = { lat: 35.8256, lng: 10.6084 };
const SFAX = { lat: 34.74, lng: 10.76 };
const BIZERTE = { lat: 37.2744, lng: 9.8739 };
const BAB_SAADOUN = { lat: 36.8106, lng: 10.1629 };
const LA_MARSA = { lat: 36.8782, lng: 10.3247 };

describe('alongSegment', () => {
  it('measures progress and distance from the route', () => {
    const mid = alongSegment(TUNIS, SFAX, ENFIDHA);
    expect(mid.progress).toBeGreaterThan(0.3);
    expect(mid.progress).toBeLessThan(0.5);
    expect(alongSegment(TUNIS, SFAX, BIZERTE).progress).toBeLessThan(0);
  });
});

describe('isHeadingTo (R-045a)', () => {
  const louage = { type: 'LOUAGE' as const, position: TUNIS, headingTo: SOUSSE };

  it('matches a "heading to" near the destination', () => {
    expect(isHeadingTo(louage, { lat: 35.83, lng: 10.62 }, null, T)).toBe(true);
  });

  it('matches a destination on the way, ahead of the driver', () => {
    expect(isHeadingTo({ ...louage, headingTo: SFAX }, ENFIDHA, null, T)).toBe(true);
  });

  it('follows the straight line, not the road (Sousse is ~14 km off the Tunis → Sfax line)', () => {
    expect(isHeadingTo({ ...louage, headingTo: SFAX }, SOUSSE, null, T)).toBe(false);
  });

  it('refuses destinations behind, beyond, or off the corridor', () => {
    expect(isHeadingTo({ ...louage, position: SOUSSE, headingTo: SFAX }, TUNIS, null, T)).toBe(false);
    expect(isHeadingTo(louage, SFAX, null, T)).toBe(false);
    expect(isHeadingTo(louage, BIZERTE, null, T)).toBe(false);
  });

  it('refuses a destination the driver passes before reaching the passenger', () => {
    // The passenger is in Hammamet, the destination Enfidha: a louage at Tunis passes Enfidha only after
    // Hammamet, so it fits; with the passenger in Sousse, Enfidha is already behind.
    expect(isHeadingTo({ ...louage, headingTo: SFAX }, ENFIDHA, HAMMAMET, T)).toBe(true);
    expect(isHeadingTo({ ...louage, headingTo: SFAX }, ENFIDHA, SOUSSE, T)).toBe(false);
  });

  it('uses the narrower urban corridor for taxis', () => {
    const taxi = { type: 'TAXI' as const, position: BAB_SAADOUN, headingTo: LA_MARSA };
    const offRoute = { lat: 36.88, lng: 10.24 };
    expect(isHeadingTo(taxi, offRoute, null, T)).toBe(false);
    expect(isHeadingTo({ ...taxi, type: 'LOUAGE' }, offRoute, null, T)).toBe(true);
  });

  it('never matches a driver without a "heading to"', () => {
    expect(isHeadingTo({ ...louage, headingTo: null }, SOUSSE, null, T)).toBe(false);
  });
});

describe('finderGroup (R-045 a/b)', () => {
  it('puts taxis without a destination in "taxis nearby", within 5 km of the passenger', () => {
    const taxi = { type: 'TAXI' as const, position: BAB_SAADOUN, headingTo: null, isFull: false };
    expect(finderGroup(taxi, SOUSSE, TUNIS, T)).toBe('TAXI_NEARBY');
    expect(finderGroup(taxi, SOUSSE, LA_MARSA, T)).toBeNull();
  });

  it('keeps louages within 15 km and drops the rest', () => {
    const louage = { type: 'LOUAGE' as const, position: TUNIS, headingTo: SOUSSE, isFull: false };
    expect(finderGroup(louage, SOUSSE, BAB_SAADOUN, T)).toBe('HEADING_THERE');
    expect(finderGroup(louage, SOUSSE, HAMMAMET, T)).toBeNull();
    expect(finderGroup({ ...louage, headingTo: null }, SOUSSE, BAB_SAADOUN, T)).toBeNull();
  });
});

describe('finderOrder (R-045d)', () => {
  it('lists available drivers by distance, full drivers last', () => {
    const list = [
      { id: 'full-near', isFull: true, distanceM: 100 },
      { id: 'far', isFull: false, distanceM: 4000 },
      { id: 'near', isFull: false, distanceM: 900 },
      { id: 'unknown', isFull: false, distanceM: null },
    ].sort(finderOrder);
    expect(list.map((d) => d.id)).toEqual(['near', 'far', 'unknown', 'full-near']);
  });
});

describe('routineMatches (R-045c)', () => {
  it('matches routines ending near the destination and starting near the passenger', () => {
    const route = { from: BAB_SAADOUN, to: SOUSSE };
    expect(routineMatches(route, { lat: 35.83, lng: 10.6 }, TUNIS, T)).toBe(true);
    expect(routineMatches(route, SFAX, TUNIS, T)).toBe(false);
    expect(routineMatches(route, SOUSSE, SFAX, T)).toBe(false);
    expect(routineMatches(route, SOUSSE, null, T)).toBe(true);
  });
});

describe('clusterPoints (R-020)', () => {
  it('counts points per cell by kind, keeping only a centre per cell', () => {
    const bbox = { south: 34, west: 9, north: 38, east: 11.5 };
    const clusters = clusterPoints(
      [
        { ...TUNIS, kind: 'TAXI' },
        { ...BAB_SAADOUN, kind: 'LOUAGE' },
        { ...TUNIS, kind: 'PASSENGER' },
        { ...SFAX, kind: 'BUS' },
        { lat: 40, lng: 10, kind: 'TAXI' },
      ],
      bbox,
      T,
    );
    expect(clusters).toHaveLength(2);
    const tunis = clusters.find((c) => c.count === 3)!;
    expect(tunis.byKind).toEqual({ TAXI: 1, LOUAGE: 1, BUS: 0, PASSENGER: 1 });
    expect(clusters.reduce((n, c) => n + c.count, 0)).toBe(4);
  });
});
