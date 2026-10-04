import { describe, expect, it } from 'vitest';
import { MapDriversRequest } from './map.js';
import { AdminSessionQuery, PingsRequest, PingsResponse, StartSharingRequest } from './sharing.js';

const fix = { ts: 1_790_000_000_000, lat: 36.8, lng: 10.18, accuracyM: 8 };

describe('sharing contracts', () => {
  it('defaults the optional parts of a fix and of the start request', () => {
    expect(StartSharingRequest.parse({ fix })).toEqual({
      fix: { ...fix, speedMps: null, headingDeg: null, isMock: false },
      headingToPlaceId: null,
      lineLabel: null,
    });
  });

  it('rejects impossible coordinates and oversized batches', () => {
    expect(PingsRequest.safeParse({ fixes: [{ ...fix, lat: 91 }], locationServicesOn: true }).success).toBe(
      false,
    );
    const fixes = Array.from({ length: 501 }, (_, i) => ({ ...fix, ts: fix.ts + i }));
    expect(PingsRequest.safeParse({ fixes, locationServicesOn: true }).success).toBe(false);
  });

  it('accepts end reasons and the two "no active mode" reasons as stop reasons', () => {
    for (const reason of ['PING_GAP', 'NOT_SHARING', 'ON_BREAK']) {
      expect(PingsResponse.safeParse({ stop: true, reason, cooldownUntil: null }).success).toBe(true);
    }
    expect(PingsResponse.safeParse({ stop: true, reason: 'NOPE', cooldownUntil: null }).success).toBe(false);
  });

  it('parses the admin session filter from a query string', () => {
    expect(AdminSessionQuery.parse({ active: 'true' })).toEqual({ active: true, page: 1, pageSize: 25 });
    expect(AdminSessionQuery.parse({}).active).toBeUndefined();
  });
});

describe('map contracts', () => {
  it('requires an ordered bounding box', () => {
    const bbox = { south: 36.7, west: 10.1, north: 36.9, east: 10.3 };
    expect(MapDriversRequest.safeParse({ bbox }).success).toBe(true);
    expect(MapDriversRequest.safeParse({ bbox: { ...bbox, north: 36.6 } }).success).toBe(false);
  });
});
