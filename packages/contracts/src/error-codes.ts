import { z } from 'zod';

/**
 * Stable, machine-readable error codes returned in `ProblemDetails.code`.
 * Clients branch on these, never on `title` or `detail` (which are localisable).
 */
export const ErrorCode = z.enum([
  // Generic
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
  // Auth (docs/architecture.md §3)
  'INVALID_GOOGLE_TOKEN',
  /** The access token expired: refresh and retry. */
  'TOKEN_EXPIRED',
  /** Unknown, expired or revoked refresh token: sign in again. */
  'REFRESH_TOKEN_INVALID',
  /** A rotated refresh token was replayed: the whole session was revoked. */
  'REFRESH_TOKEN_REUSED',
  'ACCOUNT_SUSPENDED',
  'ACCOUNT_BANNED',
  'ADMIN_REQUIRED',
  // Domain (docs/domain-model.md §2)
  'SHARING_REQUIRED',
  'COOLDOWN_ACTIVE',
  'INVALID_STATE_TRANSITION',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;
