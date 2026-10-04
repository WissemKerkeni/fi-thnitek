import { Me, PROBLEM_JSON, ProblemDetails, SignInResponse, TokenPair } from '@fi-thnitek/contracts';
import type { ZodType } from 'zod';
import { API_URL } from './api';

/** A non-2xx API response with its problem code, if any. */
export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super(code ?? `HTTP ${status}`);
    this.name = 'AdminApiError';
  }
}

/**
 * Admin session tokens. Kept in sessionStorage (this tab only, gone when it closes): the admin app has no
 * third-party scripts besides Google's sign-in, and a cookie-based session is a later hardening step.
 */
export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = 'fi-thnitek.admin.session';

export function createAdminSession(
  storage: SessionStorage = window.sessionStorage,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  baseUrl: string = API_URL,
) {
  const root = `${baseUrl.replace(/\/+$/, '')}/v1`;
  let refreshing: Promise<boolean> | null = null;

  const load = (): TokenPair | null => {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed = TokenPair.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  };
  const save = (pair: TokenPair) => storage.setItem(KEY, JSON.stringify(pair));
  const clear = () => storage.removeItem(KEY);

  async function errorOf(res: Response): Promise<AdminApiError> {
    const body: unknown = await res.json().catch(() => undefined);
    const problem = res.headers.get('content-type')?.includes(PROBLEM_JSON)
      ? ProblemDetails.safeParse(body)
      : undefined;
    return new AdminApiError(res.status, problem?.success ? problem.data.code : undefined);
  }

  const post = (path: string, body: unknown, token?: string) =>
    fetchImpl(`${root}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    });

  function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      const current = load();
      if (!current) return false;
      const res = await post('/auth/refresh', { refreshToken: current.refreshToken });
      if (!res.ok) {
        clear();
        return false;
      }
      save(TokenPair.parse(await res.json()));
      return true;
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  /** Authenticated call: refreshes once on TOKEN_EXPIRED; a 401/403 ends the admin session. */
  async function request<T>(method: string, path: string, schema: ZodType<T>, body?: unknown): Promise<T> {
    const call = () =>
      fetchImpl(`${root}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${load()?.accessToken ?? ''}`,
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    let res = await call();
    if (res.status === 401) {
      const error = await errorOf(res);
      if (error.code !== 'TOKEN_EXPIRED' || !(await refresh())) {
        clear();
        throw error;
      }
      res = await call();
    }
    if (!res.ok) {
      const error = await errorOf(res);
      if (res.status === 401 || (res.status === 403 && error.code !== 'VALIDATION_FAILED')) clear();
      throw error;
    }
    return schema.parse(res.status === 204 ? undefined : await res.json());
  }

  const getAdminMe = () => request('GET', '/admin/me', Me);

  return {
    hasSession: () => load() !== null,

    /** Exchanges a Google ID token, then checks the allow-list; non-admins are signed out at once. */
    async signIn(idToken: string): Promise<Me> {
      const res = await post('/auth/google', { idToken });
      if (!res.ok) throw await errorOf(res);
      const signedIn = SignInResponse.parse(await res.json());
      save(signedIn);
      try {
        return await getAdminMe();
      } catch (error) {
        await post('/auth/logout', {}, signedIn.accessToken).catch(() => undefined);
        clear();
        throw error;
      }
    },

    getAdminMe,
    request,

    async signOut(): Promise<void> {
      const current = load();
      clear();
      if (current) await post('/auth/logout', {}, current.accessToken).catch(() => undefined);
    },
  };
}

export type AdminSession = ReturnType<typeof createAdminSession>;
