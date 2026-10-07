import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS as T } from '../config/thresholds.js';
import { VERIFICATION_STATES } from '../verification/verification.js';
import {
  type DriverMarkerSource,
  driverMarker,
  isDriverVisible,
  isMapSpanTooWide,
  liveMapAccess,
} from './drivers.js';

const NOW = Date.UTC(2026, 9, 3, 10, 0, 0);

describe('liveMapAccess (R-026, invariant 4)', () => {
  const sharing = { state: 'SHARING' as const, lastFixTs: NOW - 10_000 };

  it('lets passengers and unapproved driver files see the map', () => {
    for (const verification of [null, 'DRAFT', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'REJECTED'] as const) {
      expect(liveMapAccess({ verification, session: null }, NOW, T)).toBe('ALLOWED');
    }
  });

  it('requires driver accounts to be sharing with a fresh fix', () => {
    for (const verification of ['VERIFIED', 'EXPIRED', 'SUSPENDED'] as const) {
      expect(liveMapAccess({ verification, session: null }, NOW, T)).toBe('SHARING_REQUIRED');
    }
    expect(liveMapAccess({ verification: 'VERIFIED', session: sharing }, NOW, T)).toBe('ALLOWED');
    expect(
      liveMapAccess({ verification: 'VERIFIED', session: { ...sharing, lastFixTs: NOW - 121_000 } }, NOW, T),
    ).toBe('SHARING_REQUIRED');
    expect(
      liveMapAccess({ verification: 'VERIFIED', session: { ...sharing, lastFixTs: null } }, NOW, T),
    ).toBe('SHARING_REQUIRED');
  });

  it('denies the map during a break', () => {
    expect(
      liveMapAccess({ verification: 'VERIFIED', session: { ...sharing, state: 'ON_BREAK' } }, NOW, T),
    ).toBe('SHARING_REQUIRED');
  });

  it('covers every verification state', () => {
    expect(VERIFICATION_STATES).toHaveLength(7);
  });
});

describe('isDriverVisible', () => {
  it('shows only sharing drivers with a fresh fix', () => {
    expect(isDriverVisible('SHARING', NOW - 60_000, NOW, T)).toBe(true);
    expect(isDriverVisible('SHARING', NOW - 121_000, NOW, T)).toBe(false);
    // ADR-227: on a break the driver stays visible, frozen where the break began.
    expect(isDriverVisible('ON_BREAK', NOW - 3_600_000, NOW, T)).toBe(true);
    expect(isDriverVisible('ON_BREAK', null, NOW, T)).toBe(false);
    expect(isDriverVisible('ENDED', NOW, NOW, T)).toBe(false);
  });
});

describe('isMapSpanTooWide', () => {
  it('accepts a city view and refuses a whole-region view', () => {
    expect(isMapSpanTooWide({ south: 36.75, west: 10.1, north: 36.9, east: 10.3 }, T)).toBe(false);
    expect(isMapSpanTooWide({ south: 35.5, west: 10.0, north: 36.9, east: 10.8 }, T)).toBe(true);
  });
});

describe('driverMarker (R-022, invariant 9)', () => {
  const source: DriverMarkerSource = {
    sessionId: '0199a000-0000-7000-8000-000000000001',
    type: 'LOUAGE',
    lat: 36.8,
    lng: 10.18,
    headingDeg: 90,
    displayName: 'Sami',
    legalFirstName: 'Samir',
    isFull: true,
    headingTo: { nameAr: 'سوسة', nameFr: 'Sousse' },
    lineLabel: 'L20',
    plateDisplay: '123 تونس 4567',
    fixTs: NOW - 4_400,
  };

  it('always carries a name, falling back to the legal first name', () => {
    expect(driverMarker(source, NOW).name).toBe('Sami');
    expect(driverMarker({ ...source, displayName: null }, NOW).name).toBe('Samir');
    expect(driverMarker({ ...source, displayName: '   ' }, NOW).name).toBe('Samir');
  });

  it('shows the line label only for buses', () => {
    expect(driverMarker(source, NOW).lineLabel).toBeNull();
    expect(driverMarker({ ...source, type: 'BUS' }, NOW).lineLabel).toBe('L20');
  });

  it('exposes exactly the public fields, with the session id instead of the user id', () => {
    expect(Object.keys(driverMarker(source, NOW)).sort()).toEqual([
      'breakUntil',
      'headingDeg',
      'headingTo',
      'id',
      'isFull',
      'lat',
      'lineLabel',
      'lng',
      'name',
      'nextRoutine',
      'onBreak',
      'plateDisplay',
      'type',
      'updatedAgoS',
    ]);
    expect(driverMarker(source, NOW)).toMatchObject({ id: source.sessionId, updatedAgoS: 4, isFull: true });
  });
});
