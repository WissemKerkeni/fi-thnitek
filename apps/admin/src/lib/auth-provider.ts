import type { AuthProvider } from '@refinedev/core';
import { AdminApiError, createAdminSession } from './session';

const session = createAdminSession();

const MESSAGES: Record<string, string> = {
  ADMIN_REQUIRED: "Ce compte Google n'est pas administrateur.",
  INVALID_GOOGLE_TOKEN: 'La connexion Google a échoué.',
  ACCOUNT_SUSPENDED: 'Ce compte est suspendu.',
  ACCOUNT_BANNED: 'Ce compte est bloqué.',
};

/**
 * Google sign-in restricted to the ADMIN_EMAILS allow-list (docs/architecture.md §3): the API admits the
 * account only if GET /v1/admin/me succeeds. `login` receives the ID token from Google Identity Services.
 */
export const authProvider: AuthProvider = {
  async login({ idToken }: { idToken: string }) {
    try {
      await session.signIn(idToken);
      return { success: true, redirectTo: '/' };
    } catch (error) {
      const code = error instanceof AdminApiError ? error.code : undefined;
      return {
        success: false,
        error: { name: 'Connexion refusée', message: (code && MESSAGES[code]) ?? 'Connexion impossible.' },
      };
    }
  },

  async logout() {
    await session.signOut();
    return { success: true, redirectTo: '/login' };
  },

  async check() {
    if (!session.hasSession()) return { authenticated: false, redirectTo: '/login' };
    try {
      await session.getAdminMe();
      return { authenticated: true };
    } catch {
      return { authenticated: false, redirectTo: '/login', logout: true };
    }
  },

  async getIdentity() {
    const me = await session.getAdminMe().catch(() => null);
    return me ? { id: me.id, name: me.displayName ?? 'Admin' } : null;
  },

  onError: (error: unknown) =>
    Promise.resolve(
      error instanceof AdminApiError && (error.status === 401 || error.status === 403)
        ? { logout: true }
        : {},
    ),
};
