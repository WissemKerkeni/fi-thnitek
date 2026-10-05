import type { Me } from '@fi-thnitek/contracts';

export type Route = '/sign-in' | '/language' | '/terms' | '/name' | '/location' | '/home' | '/sharing';

/** Screens reachable before location is granted: the first-run steps and the location screen. */
export const BEFORE_LOCATION: readonly string[] = ['/sign-in', '/language', '/terms', '/name', '/location'];

export type SessionState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; me: Me };

/** Driver-only accounts (ADR-205): approved once, even if later expired or suspended. */
export function isDriverAccount(state: Me['driverVerification'] | undefined): boolean {
  return state === 'VERIFIED' || state === 'EXPIRED' || state === 'SUSPENDED';
}

/**
 * First-run order from docs/ux.md §1: Sign-in (Google) → Language → Terms → Name → Location (ADR-224)
 * → home (the passenger map, or the sharing screen for driver accounts).
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
  if (!locationOk) return '/location';
  return isDriverAccount(me.driverVerification) ? '/sharing' : '/home';
}
