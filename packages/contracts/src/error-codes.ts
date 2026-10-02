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
  // Domain (docs/domain-model.md §2)
  'SHARING_REQUIRED',
  'COOLDOWN_ACTIVE',
  'INVALID_STATE_TRANSITION',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;
