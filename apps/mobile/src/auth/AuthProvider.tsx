import type { Me, UpdateMeRequest } from '@fi-thnitek/contracts';
import {
  GoogleSignin,
  isCancelledResponse,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { type ApiClient, type ApiError, createApiClient } from '../lib/api';
import { API_URL, GOOGLE_WEB_CLIENT_ID } from '../lib/config';
import { deviceInfo } from './device';
import type { SessionState } from './next-route';
import { createSecureTokenStore } from './token-store';

export type SignInResult = 'ok' | 'cancelled' | 'not-configured';

interface AuthContextValue {
  session: SessionState;
  /** The signed-in API client (tokens and refresh handled for you). */
  api: ApiClient;
  /** Set when the server ended the session (e.g. ACCOUNT_SUSPENDED); shown on the sign-in screen. */
  endedReason: string | null;
  signIn: () => Promise<SignInResult>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  updateMe: (patch: UpdateMeRequest) => Promise<Me>;
  /** Re-reads /v1/me (e.g. after a verification decision push). */
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const tokens = createSecureTokenStore();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });
  const [endedReason, setEndedReason] = useState<string | null>(null);

  const api = useMemo(
    () =>
      createApiClient(API_URL, {
        tokens,
        onSessionEnded: (error: ApiError) => {
          setEndedReason(error.problem?.code ?? null);
          setSession({ status: 'signedOut' });
        },
      }),
    [],
  );

  // Restore the session on launch (the client refreshes from the stored refresh token).
  useEffect(() => {
    if (GOOGLE_WEB_CLIENT_ID) GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    void (async () => {
      if (!(await tokens.getRefreshToken())) return setSession({ status: 'signedOut' });
      try {
        setSession({ status: 'signedIn', me: await api.getMe() });
      } catch {
        // Offline or session over: onSessionEnded already handled the latter.
        setSession((s) => (s.status === 'loading' ? { status: 'signedOut' } : s));
      }
    })();
  }, [api]);

  const signIn = useCallback(async (): Promise<SignInResult> => {
    if (!GOOGLE_WEB_CLIENT_ID) return 'not-configured';
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) return 'cancelled';
    if (!isSuccessResponse(response) || !response.data.idToken) throw new Error('No Google ID token');
    const { me } = await api.signInWithGoogle(response.data.idToken, await deviceInfo());
    setEndedReason(null);
    setSession({ status: 'signedIn', me });
    return 'ok';
  }, [api]);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    await GoogleSignin.signOut().catch(() => undefined);
    setSession({ status: 'signedOut' });
  }, [api]);

  const deleteAccount = useCallback(async () => {
    await api.deleteMe();
    await GoogleSignin.revokeAccess().catch(() => undefined);
    setSession({ status: 'signedOut' });
  }, [api]);

  const updateMe = useCallback(
    async (patch: UpdateMeRequest) => {
      const me = await api.updateMe(patch);
      setSession({ status: 'signedIn', me });
      return me;
    },
    [api],
  );

  const refreshMe = useCallback(async () => {
    const me = await api.getMe();
    setSession({ status: 'signedIn', me });
  }, [api]);

  const value = useMemo(
    () => ({ session, api, endedReason, signIn, signOut, deleteAccount, updateMe, refreshMe }),
    [session, api, endedReason, signIn, signOut, deleteAccount, updateMe, refreshMe],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
