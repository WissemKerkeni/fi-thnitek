import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS as T } from '../config/thresholds.js';
import { distanceM } from '../geo/distance.js';
import { coarsenRequest, retentionCutoffs } from './retention.js';

const NOW = new Date('2026-10-04T12:00:00Z');
const DAY = 86_400_000;

describe('retentionCutoffs (domain-model §4)', () => {
  it('derives each cutoff from its threshold', () => {
    const c = retentionCutoffs(NOW, T);
    expect(NOW.getTime() - c.coarsenRequestsBefore.getTime()).toBe(30 * DAY);
    expect(NOW.getTime() - c.purgeSessionsBefore.getTime()).toBe(365 * DAY);
    expect(NOW.getTime() - c.purgePickupsBefore.getTime()).toBe(90 * DAY);
    expect(NOW.getTime() - c.purgeClientErrorsBefore.getTime()).toBe(90 * DAY);
  });
});

describe('coarsenRequest', () => {
  const anchor = { lat: 36.80651, lng: 10.18149 };
  const destination = { lat: 35.82561, lng: 10.60842 };

  it('moves points to the centre of a ~1 km cell, never more than a cell away', () => {
    const c = coarsenRequest({ anchor, destination }, T);
    expect(c.anchor).not.toEqual(anchor);
    expect(distanceM(anchor, c.anchor!)).toBeLessThan(T.request_coarse_grid_m);
    expect(distanceM(destination, c.destination)).toBeLessThan(T.request_coarse_grid_m);
  });

  it('puts nearby points in the same cell, so the exact spot cannot be told apart', () => {
    const near = { lat: anchor.lat + 0.0001, lng: anchor.lng + 0.0001 };
    expect(coarsenRequest({ anchor: near, destination }, T).anchor).toEqual(
      coarsenRequest({ anchor, destination }, T).anchor,
    );
  });

  it('is stable (coarsening twice changes nothing) and keeps a missing anchor missing', () => {
    const once = coarsenRequest({ anchor, destination }, T);
    expect(coarsenRequest({ anchor: once.anchor, destination: once.destination }, T)).toEqual(once);
    expect(coarsenRequest({ anchor: null, destination }, T).anchor).toBeNull();
  });
});
