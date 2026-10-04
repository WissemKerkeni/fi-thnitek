import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InvalidStateTransitionError } from '@fi-thnitek/domain';
import { type ErrorCode, PROBLEM_JSON, type ProblemDetails, problemType } from '@fi-thnitek/contracts';
import type { Request, Response } from 'express';
import { ApiException } from './api-exception.js';

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'FILE_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

const TITLE_BY_CODE: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Validation failed',
  UNAUTHENTICATED: 'Authentication required',
  FORBIDDEN: 'Forbidden',
  NOT_FOUND: 'Not found',
  CONFLICT: 'Conflict',
  RATE_LIMITED: 'Too many requests',
  INTERNAL_ERROR: 'Internal error',
  SERVICE_UNAVAILABLE: 'Service unavailable',
  INVALID_GOOGLE_TOKEN: 'Google sign-in failed',
  TOKEN_EXPIRED: 'Access token expired',
  REFRESH_TOKEN_INVALID: 'Session expired',
  REFRESH_TOKEN_REUSED: 'Session revoked',
  ACCOUNT_SUSPENDED: 'Account suspended',
  ACCOUNT_BANNED: 'Account banned',
  ADMIN_REQUIRED: 'Admin access required',
  CIN_ALREADY_REGISTERED: 'CIN already registered',
  PLATE_ALREADY_REGISTERED: 'Plate already registered',
  VERIFICATION_INCOMPLETE: 'Verification file incomplete',
  VERIFICATION_LOCKED: 'Verification file locked',
  UNSUPPORTED_MEDIA_TYPE: 'Unsupported file type',
  FILE_TOO_LARGE: 'File too large',
  SHARING_REQUIRED: 'Sharing required',
  COOLDOWN_ACTIVE: 'Cooldown active',
  SHARING_NOT_ALLOWED: 'Sharing not allowed',
  ALREADY_SHARING: 'Already sharing',
  NOT_SHARING: 'Not sharing',
  FIX_REJECTED: 'Location fix rejected',
  BREAK_NOT_OVER: 'Break not over',
  BREAK_RESUME_EXPIRED: 'Resume window passed',
  ROUTINE_LIMIT: 'Too many routine routes',
  INVALID_STATE_TRANSITION: 'Invalid state transition',
};

/** Maps any thrown value to a ProblemDetails body. Pure, so it is unit-tested without HTTP. */
export function toProblem(exception: unknown, instance?: string): ProblemDetails {
  let status: number;
  let code: ErrorCode;
  let detail: string | undefined;
  let errors: ProblemDetails['errors'];

  if (exception instanceof ApiException) {
    status = exception.getStatus();
    code = exception.code;
    detail = exception.detail;
    errors = exception.errors;
  } else if (exception instanceof InvalidStateTransitionError) {
    status = HttpStatus.CONFLICT;
    code = 'INVALID_STATE_TRANSITION';
  } else if (exception instanceof HttpException) {
    status = exception.getStatus();
    code = CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_FAILED');
  } else {
    status = HttpStatus.INTERNAL_SERVER_ERROR;
    code = 'INTERNAL_ERROR';
  }

  return {
    type: problemType(code),
    title: TITLE_BY_CODE[code],
    status,
    code,
    ...(detail !== undefined && { detail }),
    ...(instance !== undefined && { instance }),
    ...(errors !== undefined && { errors }),
  };
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    // The full path (originalUrl keeps the /v1 prefix) without the query string, which is never echoed
    // back or logged (CLAUDE.md rule 8).
    const problem = toProblem(exception, req.originalUrl.split('?')[0]);

    if (problem.status >= 500) {
      this.logger.error({ err: exception, code: problem.code }, 'Unhandled error');
    }
    res.status(problem.status).type(PROBLEM_JSON).json(problem);
  }
}
