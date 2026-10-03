import { describe, expect, it } from 'vitest';
import { NearestPlaceRequest, PlaceInput, PlaceSearchRequest } from './places.js';

describe('place contracts', () => {
  it('defaults the search limit and validates coordinates', () => {
    expect(PlaceSearchRequest.parse({ q: 'sousse' }).limit).toBe(8);
    expect(PlaceSearchRequest.safeParse({ q: '' }).success).toBe(false);
    expect(PlaceSearchRequest.safeParse({ q: 'x', near: { lat: 99, lng: 10 } }).success).toBe(false);
    expect(PlaceSearchRequest.safeParse({ q: 'x', limit: 50 }).success).toBe(false);
  });

  it('defaults the nearest-place radius to 5 km', () => {
    expect(NearestPlaceRequest.parse({ point: { lat: 36.8, lng: 10.18 } }).maxDistanceM).toBe(5000);
  });

  it('requires both names and a TN governorate code format', () => {
    const base = { kind: 'LOUAGE_STATION', nameAr: 'محطة', nameFr: 'Station', location: { lat: 36.8, lng: 10.1 } };
    expect(PlaceInput.parse(base)).toMatchObject({ aliases: [], governorateCode: null });
    expect(PlaceInput.safeParse({ ...base, governorateCode: 'TN-11' }).success).toBe(true);
    expect(PlaceInput.safeParse({ ...base, governorateCode: 'Tunis' }).success).toBe(false);
    expect(PlaceInput.safeParse({ ...base, nameFr: '' }).success).toBe(false);
  });
});
