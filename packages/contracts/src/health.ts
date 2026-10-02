import { z } from 'zod';

export const HealthCheckStatus = z.enum(['up', 'down']);

export const HealthResponse = z.object({
  status: HealthCheckStatus,
  version: z.string(),
  time: z.iso.datetime(),
  checks: z.object({
    database: HealthCheckStatus,
  }),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
