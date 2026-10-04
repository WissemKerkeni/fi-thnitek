import { HttpException } from '@nestjs/common';
import type { AccountSanction, ErrorCode, FieldError } from '@fi-thnitek/contracts';

/** Throw this for any expected failure; the ProblemDetailsFilter renders it as RFC 9457. */
export class ApiException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: number,
    readonly detail?: string,
    readonly errors?: FieldError[],
    /** ACCOUNT_SUSPENDED / ACCOUNT_BANNED only: why and until when (R-073). */
    readonly sanction?: AccountSanction,
  ) {
    super(detail ?? code, status);
  }
}
