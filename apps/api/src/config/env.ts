import { z } from 'zod';

/** Placeholder shipped in .env.example; refused in production. */
export const DEV_JWT_SECRET = 'dev-only-secret-change-me-0123456789abcdef';

const commaList = (lowercase = false) =>
  z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((v) => (lowercase ? v.trim().toLowerCase() : v.trim()))
        .filter(Boolean),
    );

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    /** Comma-separated origins allowed by CORS (the admin web app). Empty = CORS off. */
    CORS_ORIGINS: commaList(),
    APP_VERSION: z.string().default('0.0.0'),

    /** HMAC key for our access tokens (HS256). */
    JWT_SECRET: z.string().min(32),
    /** OAuth client IDs accepted as the Google ID token `aud` (the web client, used by Android and admin). */
    GOOGLE_CLIENT_IDS: commaList(),
    /** Google accounts (verified emails) admitted to the admin web app. */
    ADMIN_EMAILS: commaList(true),
    ACCESS_TOKEN_TTL_S: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(60),
    /** Current Terms & Privacy version; users must accept it during onboarding (R-002). */
    TERMS_VERSION: z.string().min(1).max(32).default('draft-2026-10'),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.JWT_SECRET !== DEV_JWT_SECRET, {
    path: ['JWT_SECRET'],
    message: 'the development placeholder cannot be used in production',
  });

export type Env = z.infer<typeof EnvSchema>;

export class InvalidEnvError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'InvalidEnvError';
  }
}

/** Parses the environment once at startup and fails fast with every problem listed (never the values). */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new InvalidEnvError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  return result.data;
}

/** DI token for the parsed {@link Env}. */
export const ENV = Symbol('ENV');
