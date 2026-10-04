import { describe, expect, it } from 'vitest';
import { PingsResponse } from './sharing.js';
import { CreateRequestInput } from './requests.js';

const destination = { point: { lat: 35.8256, lng: 10.6084 } };

describe('request contracts', () => {
  it('is anonymous, one seat and without note by default', () => {
    expect(CreateRequestInput.parse({ destination, types: ['LOUAGE'] })).toEqual({
      destination: { ...destination, placeId: null },
      types: ['LOUAGE'],
      seats: 1,
      note: null,
      showIdentity: false,
    });
  });

  it('never accepts a bus, an empty or duplicated type list, or more than 8 seats', () => {
    expect(CreateRequestInput.safeParse({ destination, types: ['BUS'] }).success).toBe(false);
    expect(CreateRequestInput.safeParse({ destination, types: [] }).success).toBe(false);
    expect(CreateRequestInput.safeParse({ destination, types: ['TAXI', 'TAXI'] }).success).toBe(false);
    expect(CreateRequestInput.safeParse({ destination, types: ['TAXI'], seats: 9 }).success).toBe(false);
  });

  it('lets pings answer with a request closure reason', () => {
    expect(PingsResponse.safeParse({ stop: true, reason: 'MOVED_AWAY', cooldownUntil: null }).success).toBe(
      true,
    );
  });
});
