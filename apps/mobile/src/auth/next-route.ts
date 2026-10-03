import type { Me } from '@fi-thnitek/contracts';

export type Route = '/sign-in' | '/language' | '/terms' | '/name' | '/home' | '/sharing';

export type SessionState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; me: Me };

/** Driver-only accounts (ADR-205): approved once, even if later expired or suspended. */
export function isDriverAccount(state: Me['driverVerification'] | undefined): boolean {
  return state === 'VERIFIED' || state === 'EXPIRED' || state === 'SUSPENDED';
}

/**
 * First-run order from docs/ux.md §1: Sign-in (Google) → Language → Terms → Name → home
 * (the passenger map, or the sharing screen for driver accounts).
 * Returns null while the session is still loading.
 */
export function nextRoute(session: SessionState, hasChosenLanguage: boolean): Route | null {
  if (session.status === 'loading') return null;
  if (session.status === 'signedOut') return '/sign-in';
  if (!hasChosenLanguage) return '/language';
  const { me } = session;
  if (me.termsAcceptedVersion !== me.currentTermsVersion) return '/terms';
  if (!me.displayName) return '/name';
  return isDriverAccount(me.driverVerification) ? '/sharing' : '/home';
}
