import { z } from 'zod';
import { InstallId, Platform } from './auth.js';

/** One crash or unexpected error on the phone, already scrubbed there (and again by the API). */
export const ClientErrorReport = z.object({
  name: z.string().max(200),
  message: z.string().max(4000),
  stack: z.string().max(8000).nullable(),
  /** The route on screen, e.g. "/sharing" (no params). */
  screen: z.string().max(200).nullable(),
  fatal: z.boolean(),
  occurredAt: z.iso.datetime(),
});
export type ClientErrorReport = z.infer<typeof ClientErrorReport>;

/** POST /v1/client-errors (public, rate-limited): no account, no position, only the build. */
export const ClientErrorsRequest = z.object({
  installId: InstallId,
  platform: Platform,
  appVersion: z.string().min(1).max(32),
  errors: z.array(ClientErrorReport).min(1).max(20),
});
export type ClientErrorsRequest = z.infer<typeof ClientErrorsRequest>;

/** GET /admin/client-errors: crashes grouped by fingerprint, most recent first. */
export const AdminClientErrorQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});
export type AdminClientErrorQuery = z.input<typeof AdminClientErrorQuery>;

export const AdminClientErrorGroup = z.object({
  fingerprint: z.string(),
  name: z.string(),
  message: z.string(),
  stack: z.string().nullable(),
  screen: z.string().nullable(),
  fatal: z.boolean(),
  count: z.number().int(),
  installs: z.number().int(),
  appVersions: z.array(z.string()),
  firstAt: z.iso.datetime(),
  lastAt: z.iso.datetime(),
});
export type AdminClientErrorGroup = z.infer<typeof AdminClientErrorGroup>;
export const AdminClientErrorList = z.object({ groups: z.array(AdminClientErrorGroup) });
export type AdminClientErrorList = z.infer<typeof AdminClientErrorList>;
