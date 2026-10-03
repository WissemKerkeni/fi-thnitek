import { z } from 'zod';

/** Placeholder shipped in .env.example; refused in production. */
export const DEV_JWT_SECRET = 'dev-only-secret-change-me-0123456789abcdef';
/** Development placeholders for CIN protection; refused in production. */
export const DEV_CIN_ENCRYPTION_KEY = 'ZGV2LW9ubHktY2luLWtleS0zMi1ieXRlcy1sb25nISE=';
export const DEV_CIN_HMAC_KEY = 'dev-only-cin-hmac-key-change-me-0123456789';

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

    /** S3-compatible store for verification documents (Garage, ADR-215). */
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().default('garage'),
    S3_BUCKET: z.string().min(3),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    /** Largest accepted document photo. */
    MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(20).default(8),

    /** AES-256-GCM key for CINs at rest: 32 bytes, base64. */
    CIN_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64-encoded'),
    /** HMAC key for the CIN uniqueness index. */
    CIN_HMAC_KEY: z.string().min(32),

    /** Firebase service-account JSON file for FCM pushes. Unset = pushes are logged, not sent. */
    FIREBASE_SERVICE_ACCOUNT_FILE: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    // Development placeholders are committed in .env.example; production must set its own secrets.
    const placeholders: [keyof typeof env, string][] = [
      ['JWT_SECRET', DEV_JWT_SECRET],
      ['CIN_ENCRYPTION_KEY', DEV_CIN_ENCRYPTION_KEY],
      ['CIN_HMAC_KEY', DEV_CIN_HMAC_KEY],
    ];
    for (const [key, placeholder] of placeholders) {
      if (env[key] === placeholder) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'the development placeholder cannot be used in production',
        });
      }
    }
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
