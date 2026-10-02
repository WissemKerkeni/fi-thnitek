import { HttpException } from '@nestjs/common';
import type { ErrorCode, FieldError } from '@fi-thnitek/contracts';

/** Throw this for any expected failure; the ProblemDetailsFilter renders it as RFC 9457. */
export class ApiException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: number,
    readonly detail?: string,
    readonly errors?: FieldError[],
  ) {
    super(detail ?? code, status);
  }
}
