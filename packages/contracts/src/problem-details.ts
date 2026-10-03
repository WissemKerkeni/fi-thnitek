import { z } from 'zod';
import { ErrorCode } from './error-codes.js';

export const FieldError = z.object({
  path: z.string(),
  message: z.string(),
});
export type FieldError = z.infer<typeof FieldError>;

/** RFC 9457 Problem Details, extended with a stable `code`. Served as `application/problem+json`. */
export const ProblemDetails = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: ErrorCode,
  errors: z.array(FieldError).optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetails>;

export const PROBLEM_JSON = 'application/problem+json';

/** `type` URI for a code (a URN: no domain is assumed). */
export function problemType(code: ErrorCode): string {
  return `urn:fi-thnitek:problem:${code.toLowerCase().replaceAll('_', '-')}`;
}
