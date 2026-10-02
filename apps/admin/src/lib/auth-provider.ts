import type { AuthProvider } from '@refinedev/core';

const KEY = 'fi-thnitek.admin.placeholder-session';

/**
 * PLACEHOLDER for Phase 1: any click "signs in" for this browser tab only.
 * Phase 2 replaces it with Google sign-in restricted to the admin allow-list (docs/architecture.md §3).
 * It guards no data: the API has no admin endpoints yet.
 */
export const placeholderAuthProvider: AuthProvider = {
  login: () => {
    sessionStorage.setItem(KEY, '1');
    return Promise.resolve({ success: true, redirectTo: '/' });
  },
  logout: () => {
    sessionStorage.removeItem(KEY);
    return Promise.resolve({ success: true, redirectTo: '/login' });
  },
  check: () =>
    Promise.resolve(
      sessionStorage.getItem(KEY) ? { authenticated: true } : { authenticated: false, redirectTo: '/login' },
    ),
  onError: () => Promise.resolve({}),
};
