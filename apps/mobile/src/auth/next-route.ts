import type { Me } from '@fi-thnitek/contracts';

export type Route = '/sign-in' | '/language' | '/terms' | '/name' | '/home';

export type SessionState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; me: Me };

/**
 * First-run order from docs/ux.md §1: Sign-in (Google) → Language → Terms → Name → home.
 * Returns null while the session is still loading.
 */
export function nextRoute(session: SessionState, hasChosenLanguage: boolean): Route | null {
  if (session.status === 'loading') return null;
  if (session.status === 'signedOut') return '/sign-in';
  if (!hasChosenLanguage) return '/language';
  const { me } = session;
  if (me.termsAcceptedVersion !== me.currentTermsVersion) return '/terms';
  if (!me.displayName) return '/name';
  return '/home';
}
