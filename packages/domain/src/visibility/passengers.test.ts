import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS as T } from '../config/thresholds.js';
import { distanceM } from '../geo/distance.js';
import {
  type RequestSource,
  type SharingDriverPosition,
  type Viewer,
  passengerMarker,
  seesExactPosition,
  snapToGrid,
} from './passengers.js';

const NOW = new Date(Date.UTC(2026, 9, 5, 8, 30));
const at = (northM: number, eastM = 0) => ({ lat: 36.8 + northM / 111_195, lng: 10.18 + eastM / 89_000 });

const request: RequestSource = {
  id: 'req-1',
  passengerUserId: 'passenger',
  types: ['LOUAGE'],
  anchor: at(0),
  destination: { nameAr: 'سوسة', nameFr: 'Sousse' },
  seats: 2,
  visibleAt: new Date(NOW.getTime() - 6.5 * 60_000),
  showIdentity: false,
  name: 'Marwen',
  note: 'J’ai une grande valise',
};

const driver = (userId: string, type: SharingDriverPosition['type'], northM: number, isFull = false) => ({
  userId,
  type,
  isFull,
  position: at(northM),
});
const viewerFrom = (d: SharingDriverPosition): Viewer => ({
  kind: 'SHARING_DRIVER',
  userId: d.userId,
  type: d.type,
  position: d.position,
});

describe('snapToGrid (R-023)', () => {
  it('moves the point to the centre of its ~100 m cell, the same for every point of the cell', () => {
    const centre = snapToGrid(at(10, 10), 100);
    expect(distanceM(centre, at(10, 10))).toBeLessThan(75);
    expect(snapToGrid(centre, 100)).toEqual(centre);
    const sameCell = { lat: centre.lat + 30 / 111_195, lng: centre.lng - 30 / 89_000 };
    expect(snapToGrid(sameCell, 100)).toEqual(centre);
    expect(snapToGrid(at(200), 100)).not.toEqual(centre);
  });
});

describe('passengerMarker: exact coordinates (invariant 6)', () => {
  const me = driver('me', 'LOUAGE', 450);
  const others = [
    me,
    driver('closer', 'LOUAGE', 180),
    driver('closer-full', 'LOUAGE', 100, true),
    driver('taxi', 'TAXI', 50),
  ];

  it('gives the exact spot, seats, waiting time, distance and closer drivers to a matching sharing driver', () => {
    expect(passengerMarker(request, viewerFrom(me), others, NOW, T)).toEqual({
      id: 'req-1',
      exact: true,
      lat: request.anchor.lat,
      lng: request.anchor.lng,
      types: ['LOUAGE'],
      destination: { nameAr: 'سوسة', nameFr: 'Sousse' },
      seats: 2,
      waitingMin: 6,
      distanceM: 450,
      // The full louage and the taxi (not requested) do not count.
      closerDrivers: 1,
      name: null,
      note: null,
    });
  });

  it('adds the name and note only when the passenger chose to show them', () => {
    const named = passengerMarker({ ...request, showIdentity: true }, viewerFrom(me), others, NOW, T);
    expect(named).toMatchObject({ exact: true, name: 'Marwen', note: 'J’ai une grande valise' });
  });

  it('accepts either requested type', () => {
    const taxi = driver('taxi-viewer', 'TAXI', 300);
    expect(
      passengerMarker({ ...request, types: ['TAXI', 'LOUAGE'] }, viewerFrom(taxi), [taxi], NOW, T)?.exact,
    ).toBe(true);
  });
});

describe('passengerMarker: approximate for everyone else (R-023)', () => {
  const approx = (viewer: Viewer, r: RequestSource = request) => passengerMarker(r, viewer, [], NOW, T);

  it('shows a passenger a ~100 m cell and the destination only', () => {
    const marker = approx({ kind: 'PUBLIC' })!;
    expect(marker).toEqual({
      id: 'req-1',
      exact: false,
      ...snapToGrid(request.anchor, 100),
      types: ['LOUAGE'],
      destination: { nameAr: 'سوسة', nameFr: 'Sousse' },
    });
    expect(Object.keys(marker)).not.toEqual(expect.arrayContaining(['name']));
  });

  it('never leaks the name or note, even when shown to drivers', () => {
    const marker = approx({ kind: 'PUBLIC' }, { ...request, showIdentity: true });
    expect(JSON.stringify(marker)).not.toMatch(/Marwen|valise/);
  });

  it.each([
    ['a taxi driver when only a louage was requested', viewerFrom(driver('t', 'TAXI', 10))],
    ['a bus driver', viewerFrom(driver('b', 'BUS', 10))],
  ])('shows nothing at all to %s: drivers only see passengers they can take (ADR-226)', (_label, viewer) => {
    expect(approx(viewer)).toBeNull();
  });

  it('never gives buses exact positions (they cannot be requested)', () => {
    expect(seesExactPosition(viewerFrom(driver('b', 'BUS', 0)), { types: ['TAXI', 'LOUAGE'] })).toBe(false);
  });

  it('hides the passenger’s own request from themselves', () => {
    expect(passengerMarker(request, viewerFrom(driver('passenger', 'LOUAGE', 0)), [], NOW, T)).toBeNull();
  });
});
