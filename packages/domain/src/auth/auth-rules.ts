/**
 * Refresh-token rotation with reuse detection (docs/security.md §1): every refresh replaces the token;
 * presenting an already-rotated token means it was copied, so the caller revokes the whole session family.
 */
export interface RefreshTokenState {
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}

export type RefreshDecision = 'ROTATE' | 'REUSED' | 'REVOKED' | 'EXPIRED' | 'UNKNOWN';

export function decideRefresh(token: RefreshTokenState | undefined, now: Date): RefreshDecision {
  if (!token) return 'UNKNOWN';
  if (token.revokedAt) return 'REVOKED';
  if (token.rotatedAt) return 'REUSED';
  if (token.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  return 'ROTATE';
}

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DELETED';
export type AccountAccess = 'OK' | 'ACCOUNT_SUSPENDED' | 'ACCOUNT_BANNED' | 'ACCOUNT_DELETED';

/** Only ACTIVE accounts may sign in or use their sessions; all sessions are revoked otherwise. */
export function accountAccess(status: UserStatus): AccountAccess {
  switch (status) {
    case 'ACTIVE':
      return 'OK';
    case 'SUSPENDED':
      return 'ACCOUNT_SUSPENDED';
    case 'BANNED':
      return 'ACCOUNT_BANNED';
    case 'DELETED':
      return 'ACCOUNT_DELETED';
  }
}
