/**
 * Fields that must never reach the logs (CLAUDE.md rule 8, docs/security.md).
 * Matched at any of the first few nesting levels; pino's redact paths cannot express "any depth".
 */
export const REDACTED_KEYS = [
  'email',
  'name',
  'display_name',
  'displayName',
  'lat',
  'lng',
  'latitude',
  'longitude',
  'cin',
  'phone',
] as const;

const MAX_DEPTH = 4;

function pathsAtDepth(key: string): string[] {
  return Array.from({ length: MAX_DEPTH }, (_, depth) => [...Array<string>(depth).fill('*'), key].join('.'));
}

export const REDACT_PATHS: string[] = [
  ...REDACTED_KEYS.flatMap(pathsAtDepth),
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

export const REDACT_CENSOR = '[REDACTED]';
