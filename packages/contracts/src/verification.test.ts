import { VERIFICATION_STATES } from '@fi-thnitek/domain';
import { describe, expect, it } from 'vitest';
import { Me } from './auth.js';
import { DecisionRequest, DriverProfileInput, VehicleInput } from './verification.js';

describe('verification contracts', () => {
  it('requires a reason to request changes or reject, not to approve', () => {
    expect(DecisionRequest.safeParse({ decision: 'APPROVE' }).success).toBe(true);
    expect(DecisionRequest.safeParse({ decision: 'REJECT' }).success).toBe(false);
    expect(DecisionRequest.safeParse({ decision: 'REQUEST_CHANGES', reason: 'Photo floue' }).success).toBe(
      true,
    );
  });

  it('validates the driver profile and vehicle', () => {
    expect(
      DriverProfileInput.safeParse({
        legalFirstName: 'Sami',
        legalLastName: 'Ben Ali',
        cin: '01234567',
        transportType: 'LOUAGE',
      }).success,
    ).toBe(true);
    expect(
      DriverProfileInput.safeParse({
        legalFirstName: 'Sami',
        legalLastName: 'B',
        cin: '0123',
        transportType: 'CAR',
      }).success,
    ).toBe(false);
    expect(VehicleInput.safeParse({ plate: '123 تونس 4567' }).success).toBe(true);
    expect(VehicleInput.safeParse({ plate: '' }).success).toBe(false);
  });

  it('keeps Me.driverVerification in sync with the domain states', () => {
    expect(Me.shape.driverVerification.unwrap().options).toEqual([...VERIFICATION_STATES]);
  });
});
