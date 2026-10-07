import type { Me } from '@fi-thnitek/contracts';

export type Route =
  '/sign-in' | '/language' | '/terms' | '/name' | '/role' | '/location' | '/home' | '/sharing' | '/driver';

/** Screens reachable before location is granted: the first-run steps and the location screen. */
export const BEFORE_LOCATION: readonly string[] = [
  '/sign-in',
  '/language',
  '/terms',
  '/name',
  '/role',
  '/location',
];

export type SessionState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; me: Me };

/** Passenger screens a driver account never sees (ADR-226): the passenger map, requests, finder. */
export const PASSENGER_ONLY: readonly string[] = [
  '/home',
  '/request',
  '/request/new',
  '/finder',
  '/history/requests',
];

/** Where a driver account lives: sharing once approved, else its driver file (ADR-225). */
export function driverHome(state: Me['driverVerification'] | undefined): '/sharing' | '/driver' {
  return isDriverAccount(state) ? '/sharing' : '/driver';
}

/** Driver-only accounts (ADR-205): approved once, even if later expired or suspended. */
export function isDriverAccount(state: Me['driverVerification'] | undefined): boolean {
  return state === 'VERIFIED' || state === 'EXPIRED' || state === 'SUSPENDED';
}

/**
 * First-run order from docs/ux.md §1: Sign-in (Google) → Language → Terms → Name → Role (ADR-225)
 * → Location (ADR-224) → home: the passenger map, the sharing screen for an approved driver, or the
 * driver file while it is not approved yet.
 * Returns null while the session is still loading.
 */
export function nextRoute(
  session: SessionState,
  hasChosenLanguage: boolean,
  locationOk = true,
): Route | null {
  if (session.status === 'loading') return null;
  if (session.status === 'signedOut') return '/sign-in';
  if (!hasChosenLanguage) return '/language';
  const { me } = session;
  if (me.termsAcceptedVersion !== me.currentTermsVersion) return '/terms';
  if (!me.displayName) return '/name';
  if (!me.role) return '/role';
  if (!locationOk) return '/location';
  if (me.role === 'DRIVER') return driverHome(me.driverVerification);
  return '/home';
}
