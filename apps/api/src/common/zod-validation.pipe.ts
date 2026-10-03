import { HttpStatus, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ApiException } from './api-exception.js';

/** `@Body(new ZodValidationPipe(Schema))`: contracts in packages/contracts are the single source of truth. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new ApiException(
      'VALIDATION_FAILED',
      HttpStatus.BAD_REQUEST,
      'The request is invalid',
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
}
