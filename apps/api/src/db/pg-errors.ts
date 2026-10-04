/** Unwraps the PostgreSQL error code and constraint from a pg or Drizzle-wrapped error. */
export function pgError(error: unknown): { code?: string; constraint?: string } {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  for (const e of candidates) {
    if (e && typeof e === 'object' && 'code' in e && typeof e.code === 'string') {
      const { code, constraint } = e as { code: string; constraint?: string };
      return { code, constraint };
    }
  }
  return {};
}

export const UNIQUE_VIOLATION = '23505';
export const FOREIGN_KEY_VIOLATION = '23503';
