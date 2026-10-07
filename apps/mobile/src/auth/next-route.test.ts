import type { Me } from '@fi-thnitek/contracts';
import { describe, expect, it } from 'vitest';
import { nextRoute } from './next-route.js';

const me: Me = {
  id: '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  displayName: 'Sami',
  locale: 'ar',
  status: 'ACTIVE',
  isAdmin: false,
  termsAcceptedVersion: 'v2',
  currentTermsVersion: 'v2',
  driverVerification: null,
  needsOnboarding: false,
};

describe('nextRoute (docs/ux.md §1)', () => {
  it('waits while the session loads', () => {
    expect(nextRoute({ status: 'loading' }, true)).toBeNull();
  });

  it('starts with Google sign-in', () => {
    expect(nextRoute({ status: 'signedOut' }, false)).toBe('/sign-in');
    expect(nextRoute({ status: 'signedOut' }, true)).toBe('/sign-in');
  });

  it('then language, terms and name, in that order', () => {
    const fresh = { ...me, displayName: null, termsAcceptedVersion: null };
    expect(nextRoute({ status: 'signedIn', me: fresh }, false)).toBe('/language');
    expect(nextRoute({ status: 'signedIn', me: fresh }, true)).toBe('/terms');
    expect(nextRoute({ status: 'signedIn', me: { ...fresh, termsAcceptedVersion: 'v2' } }, true)).toBe(
      '/name',
    );
    expect(nextRoute({ status: 'signedIn', me }, true)).toBe('/home');
  });

  it('sends driver accounts to the sharing screen, other driver files to the passenger map', () => {
    for (const state of ['VERIFIED', 'EXPIRED', 'SUSPENDED'] as const) {
      expect(nextRoute({ status: 'signedIn', me: { ...me, driverVerification: state } }, true)).toBe(
        '/sharing',
      );
    }
    for (const state of ['DRAFT', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'REJECTED'] as const) {
      expect(nextRoute({ status: 'signedIn', me: { ...me, driverVerification: state } }, true)).toBe('/home');
    }
  });

  it('requires location after the first-run steps, and only then (ADR-224)', () => {
    expect(nextRoute({ status: 'signedIn', me }, true, false)).toBe('/location');
    expect(nextRoute({ status: 'signedIn', me: { ...me, displayName: null } }, true, false)).toBe('/name');
    expect(nextRoute({ status: 'signedOut' }, true, false)).toBe('/sign-in');
    expect(nextRoute({ status: 'signedIn', me }, true, true)).toBe('/home');
  });

  it('asks again when the terms change', () => {
    expect(nextRoute({ status: 'signedIn', me: { ...me, termsAcceptedVersion: 'v1' } }, true)).toBe('/terms');
  });
});
