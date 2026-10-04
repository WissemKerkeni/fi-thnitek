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

  it('asks again when the terms change', () => {
    expect(nextRoute({ status: 'signedIn', me: { ...me, termsAcceptedVersion: 'v1' } }, true)).toBe('/terms');
  });
});
