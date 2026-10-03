import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { SignJWT, errors, jwtVerify } from 'jose';
import { ApiException } from '../common/api-exception.js';

const ISSUER = 'fi-thnitek';
const AUDIENCE = 'fi-thnitek-api';

export interface AccessClaims {
  userId: string;
  /** The session family (stable across refreshes). */
  familyId: string;
}

/** Our own short-lived access token (HS256, 15 min by default). Carries IDs only, never PII. */
export class AccessTokens {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    readonly ttlSeconds: number,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  sign(claims: AccessClaims, now = new Date()): Promise<string> {
    const iat = Math.floor(now.getTime() / 1000);
    return new SignJWT({ sid: claims.familyId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(iat + this.ttlSeconds)
      .sign(this.key);
  }

  /** Throws TOKEN_EXPIRED (client should refresh) or UNAUTHENTICATED (anything else). */
  async verify(token: string, now = new Date()): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
        currentDate: now,
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') throw new Error('claims');
      return { userId: payload.sub, familyId: payload.sid };
    } catch (error) {
      if (error instanceof errors.JWTExpired) {
        throw new ApiException('TOKEN_EXPIRED', HttpStatus.UNAUTHORIZED, 'The access token expired');
      }
      throw new ApiException('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED);
    }
  }
}

/** 256-bit random, URL-safe. */
export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const ACCESS_TOKENS = Symbol('ACCESS_TOKENS');
