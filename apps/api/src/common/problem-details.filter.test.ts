import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ProblemDetails } from '@fi-thnitek/contracts';
import { InvalidStateTransitionError } from '@fi-thnitek/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiException } from './api-exception.js';
import { toProblem } from './problem-details.filter.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('toProblem', () => {
  it('renders ApiException with its code, detail and field errors', () => {
    const problem = toProblem(new ApiException('SHARING_REQUIRED', 403, 'Start sharing first'), '/v1/map');
    expect(problem).toEqual({
      type: 'urn:fi-thnitek:problem:sharing-required',
      title: 'Sharing required',
      status: 403,
      code: 'SHARING_REQUIRED',
      detail: 'Start sharing first',
      instance: '/v1/map',
    });
    expect(ProblemDetails.safeParse(problem).success).toBe(true);
  });

  it('maps domain transition errors to 409', () => {
    const problem = toProblem(new InvalidStateTransitionError('sharing_session', 'ON_BREAK', 'END'));
    expect(problem).toMatchObject({ status: 409, code: 'INVALID_STATE_TRANSITION' });
  });

  it('maps Nest HTTP exceptions by status', () => {
    expect(toProblem(new NotFoundException()).code).toBe('NOT_FOUND');
    expect(toProblem(new BadRequestException()).code).toBe('VALIDATION_FAILED');
    expect(toProblem(new ServiceUnavailableException()).code).toBe('SERVICE_UNAVAILABLE');
  });

  it('hides unknown errors behind a generic 500', () => {
    const problem = toProblem(new Error('connection string postgres://user:pw@db'));
    expect(problem).toEqual({
      type: 'urn:fi-thnitek:problem:internal-error',
      title: 'Internal error',
      status: 500,
      code: 'INTERNAL_ERROR',
    });
  });
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ seats: z.number().int().min(1) }));

  it('returns parsed data', () => {
    expect(pipe.transform({ seats: 2 })).toEqual({ seats: 2 });
  });

  it('throws VALIDATION_FAILED with field paths', () => {
    let caught: unknown;
    try {
      pipe.transform({ seats: 0 });
    } catch (error) {
      caught = error;
    }
    const problem = toProblem(caught);
    expect(problem.status).toBe(400);
    expect(problem.code).toBe('VALIDATION_FAILED');
    expect(problem.errors?.[0]?.path).toBe('seats');
  });
});
