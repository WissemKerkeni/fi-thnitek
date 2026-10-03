import type { TFunction } from 'i18next';
import { ApiError } from '../lib/api';

const KNOWN = new Set([
  'CIN_ALREADY_REGISTERED',
  'PLATE_ALREADY_REGISTERED',
  'UNSUPPORTED_MEDIA_TYPE',
  'FILE_TOO_LARGE',
  'VERIFICATION_INCOMPLETE',
  'VERIFICATION_LOCKED',
]);

/** A user-facing message for an API failure in the driver flow. */
export function driverErrorMessage(t: TFunction, error: unknown): string {
  const code = error instanceof ApiError ? error.problem?.code : undefined;
  return code && KNOWN.has(code) ? t(`driver.error_${code}` as never) : t('common.error');
}
