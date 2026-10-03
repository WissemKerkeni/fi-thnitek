import { HttpStatus } from '@nestjs/common';
import { type JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from 'jose';
import { ApiException } from '../common/api-exception.js';

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

export interface GoogleIdentity {
  sub: string;
  /** Lowercased; verified by Google (unverified emails are rejected). */
  email: string;
}

/**
 * Verifies a Google ID token server-side (docs/architecture.md §3): signature against Google's keys,
 * `aud` ∈ our client IDs, `iss`, `exp`, and `email_verified`. Any failure → 401 INVALID_GOOGLE_TOKEN,
 * without saying which check failed.
 */
export class GoogleTokenVerifier {
  constructor(
    private readonly clientIds: string[],
    private readonly keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL)),
  ) {}

  async verify(idToken: string): Promise<GoogleIdentity> {
    if (this.clientIds.length === 0) throw invalid();
    try {
      const { payload } = await jwtVerify(idToken, this.keys, {
        issuer: GOOGLE_ISSUERS,
        audience: this.clientIds,
        algorithms: ['RS256'],
        clockTolerance: 30,
        requiredClaims: ['sub', 'exp', 'iat'],
      });
      const email = payload.email;
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) throw invalid();
      if (payload.email_verified !== true || typeof email !== 'string') throw invalid();
      return { sub: payload.sub, email: email.toLowerCase() };
    } catch (error) {
      if (error instanceof ApiException) throw error;
      throw invalid();
    }
  }
}

function invalid(): ApiException {
  return new ApiException(
    'INVALID_GOOGLE_TOKEN',
    HttpStatus.UNAUTHORIZED,
    'Google sign-in could not be verified',
  );
}

/** DI token, so tests can verify against a local key set. */
export const GOOGLE_VERIFIER = Symbol('GOOGLE_VERIFIER');
