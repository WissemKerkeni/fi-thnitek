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
  // Driver verification (R-060…R-064)
  'CIN_ALREADY_REGISTERED',
  'PLATE_ALREADY_REGISTERED',
  'VERIFICATION_INCOMPLETE',
  /** The file cannot be edited in its current state (e.g. under review). */
  'VERIFICATION_LOCKED',
  'UNSUPPORTED_MEDIA_TYPE',
  'FILE_TOO_LARGE',
  // Domain (docs/domain-model.md §2)
  'SHARING_REQUIRED',
  'COOLDOWN_ACTIVE',
  // Driver sharing (R-050…R-059)
  /** Start refused: not verified, no vehicle or account suspended (`detail` lists the blockers). */
  'SHARING_NOT_ALLOWED',
  'ALREADY_SHARING',
  /** The action needs an active sharing session. */
  'NOT_SHARING',
  /** The fix sent with start/resume is too old or comes from a mock location provider. */
  'FIX_REJECTED',
  /** A break cannot be ended early (R-055). */
  'BREAK_NOT_OVER',
  /** The resume window after the break has passed: the session has ended. */
  'BREAK_RESUME_EXPIRED',
  // Routine routes (R-065…R-068)
  /** At most `routine_max` routines per driver. */
  'ROUTINE_LIMIT',
  // Passenger requests (R-030…R-042)
  /** Driver accounts, suspended accounts and buses cannot be requested (`detail` says which). */
  'REQUEST_NOT_ALLOWED',
  /** One open request per passenger (R-031). */
  'REQUEST_ALREADY_OPEN',
  /** Daily request limit reached (R-040). */
  'REQUEST_LIMIT',
  'NO_OPEN_REQUEST',
  /** No renewal left, or the request already expired. */
  'RENEW_NOT_ALLOWED',
  /** A request pause is in force (anti-abuse §3); `pausedUntil` is in GET /v1/requests/current. */
  'REQUEST_PAUSED',
  // Safety (R-070…R-073)
  /** Reporting yourself, or a category that does not fit (e.g. "nobody there" from a passenger). */
  'REPORT_NOT_ALLOWED',
  /** Daily report limit reached. */
  'REPORT_LIMIT',
  'INVALID_STATE_TRANSITION',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;
