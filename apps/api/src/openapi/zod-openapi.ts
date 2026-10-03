import { HealthResponse, ProblemDetails } from '@fi-thnitek/contracts';
import { z } from 'zod';

/** Contract schemas published in the OpenAPI document, derived from Zod (single source of truth). */
const SCHEMAS = { HealthResponse, ProblemDetails } as const;
export type SchemaName = keyof typeof SCHEMAS;

export function openApiComponents(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(SCHEMAS).map(([name, schema]) => [
      name,
      z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'output' }) as Record<string, unknown>,
    ]),
  );
}

export const schemaRef = (name: SchemaName) => ({ $ref: `#/components/schemas/${name}` });
