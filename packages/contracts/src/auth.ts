import { z } from 'zod';

export const Locale = z.enum(['ar', 'fr', 'en']);
export type Locale = z.infer<typeof Locale>;

export const Platform = z.enum(['android', 'ios', 'web']);
export type Platform = z.infer<typeof Platform>;

/** A random UUID generated once per install and kept in secure storage (never a hardware ID). */
export const InstallId = z.uuid();

export const DeviceInfo = z.object({
  installId: InstallId,
  platform: Platform,
  appVersion: z.string().min(1).max(32),
});
export type DeviceInfo = z.infer<typeof DeviceInfo>;

/** POST /v1/auth/google. `device` is omitted by the admin web app. */
export const GoogleSignInRequest = z.object({
  idToken: z.string().min(1).max(8192),
  device: DeviceInfo.optional(),
});
export type GoogleSignInRequest = z.infer<typeof GoogleSignInRequest>;

/** POST /v1/auth/refresh */
export const RefreshRequest = z.object({
  refreshToken: z.string().min(32).max(256),
});
export type RefreshRequest = z.infer<typeof RefreshRequest>;

export const TokenPair = z.object({
  accessToken: z.string(),
  /** Seconds until the access token expires. */
  expiresIn: z.number().int().positive(),
  refreshToken: z.string(),
});
export type TokenPair = z.infer<typeof TokenPair>;

export const UserStatus = z.enum(['ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED']);
export type UserStatus = z.infer<typeof UserStatus>;

/** The signed-in user's own profile. Email is deliberately not returned (docs/security.md). */
export const Me = z.object({
  id: z.uuid(),
  displayName: z.string().nullable(),
  locale: Locale,
  status: UserStatus,
  isAdmin: z.boolean(),
  termsAcceptedVersion: z.string().nullable(),
  /** The Terms & Privacy version the app must show and send back as `acceptTermsVersion`. */
  currentTermsVersion: z.string(),
  /** Driver verification state, or null if the user never started one. VERIFIED ⇒ driver-only (ADR-205). */
  driverVerification: z
    .enum(['DRAFT', 'UNDER_REVIEW', 'VERIFIED', 'CHANGES_REQUESTED', 'REJECTED', 'EXPIRED', 'SUSPENDED'])
    .nullable(),
  /** True until the onboarding steps (terms + display name) are complete (R-002). */
  needsOnboarding: z.boolean(),
});
export type Me = z.infer<typeof Me>;

export const SignInResponse = TokenPair.extend({ me: Me });
export type SignInResponse = z.infer<typeof SignInResponse>;

export const DisplayName = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[\p{L}\p{M}' .-]+$/u, 'letters, spaces, apostrophes, dots and hyphens only');

/** PATCH /v1/me — onboarding and settings. */
export const UpdateMeRequest = z
  .object({
    displayName: DisplayName.optional(),
    locale: Locale.optional(),
    /** The Terms & Privacy version the user just accepted. */
    acceptTermsVersion: z.string().min(1).max(32).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'nothing to update');
export type UpdateMeRequest = z.infer<typeof UpdateMeRequest>;

/** PUT /v1/me/device — R-004. `pushToken: null` clears it. */
export const RegisterDeviceRequest = DeviceInfo.extend({
  pushToken: z.string().min(1).max(4096).nullable().optional(),
});
export type RegisterDeviceRequest = z.infer<typeof RegisterDeviceRequest>;
