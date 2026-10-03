import { type JWTPayload, SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { toProblem } from '../common/problem-details.filter.js';
import { GoogleTokenVerifier } from './google-verifier.js';
import { AccessTokens, hashRefreshToken, newRefreshToken } from './tokens.js';

const CLIENT_ID = 'web-client.apps.googleusercontent.com';
type Keys = Awaited<ReturnType<typeof generateKeyPair>>;
let google: Keys;
let attacker: Keys;
let verifier: GoogleTokenVerifier;

beforeAll(async () => {
  google = await generateKeyPair('RS256');
  attacker = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(google.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  verifier = new GoogleTokenVerifier([CLIENT_ID], createLocalJWKSet({ keys: [jwk] }));
});

function idToken(claims: JWTPayload, key = google.privateKey, expSeconds = 3600): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  // Defaults first, then the test's overrides (setters would overwrite them).
  return new SignJWT({
    sub: 'google-sub-1',
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    email: 'Sami@Example.TN',
    email_verified: true,
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuedAt(now)
    .setExpirationTime(now + expSeconds)
    .sign(key);
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  return toProblem(error).code;
}

describe('GoogleTokenVerifier', () => {
  it('accepts a valid token and lowercases the email', async () => {
    await expect(verifier.verify(await idToken({}))).resolves.toEqual({
      sub: 'google-sub-1',
      email: 'sami@example.tn',
    });
  });

  it.each([
    ['a token signed by another key', () => idToken({}, attacker.privateKey)],
    ['another app (aud)', () => idToken({ aud: 'other.apps.googleusercontent.com' })],
    ['another issuer', () => idToken({ iss: 'https://evil.example' })],
    ['an expired token', () => idToken({}, google.privateKey, -120)],
    ['an unverified email', () => idToken({ email_verified: false })],
    ['a missing email', () => idToken({ email: undefined })],
  ])('rejects %s with INVALID_GOOGLE_TOKEN', async (_label, make) => {
    expect(await codeOf(verifier.verify(await make()))).toBe('INVALID_GOOGLE_TOKEN');
  });

  it('rejects garbage', async () => {
    expect(await codeOf(verifier.verify('not-a-jwt'))).toBe('INVALID_GOOGLE_TOKEN');
  });

  it('rejects everything when no client ID is configured', async () => {
    const unconfigured = new GoogleTokenVerifier([], createLocalJWKSet({ keys: [] }));
    expect(await codeOf(unconfigured.verify(await idToken({})))).toBe('INVALID_GOOGLE_TOKEN');
  });
});

describe('AccessTokens', () => {
  const tokens = new AccessTokens('s'.repeat(32), 900);
  const claims = {
    userId: '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
    familyId: '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c',
  };

  it('round-trips user and session family IDs', async () => {
    await expect(tokens.verify(await tokens.sign(claims))).resolves.toEqual(claims);
  });

  it('reports expiry distinctly so the client knows to refresh', async () => {
    const token = await tokens.sign(claims, new Date('2026-10-03T10:00:00Z'));
    expect(await codeOf(tokens.verify(token, new Date('2026-10-03T10:15:01Z')))).toBe('TOKEN_EXPIRED');
  });

  it('rejects tokens signed with another secret or tampered with', async () => {
    const other = new AccessTokens('t'.repeat(32), 900);
    expect(await codeOf(tokens.verify(await other.sign(claims)))).toBe('UNAUTHENTICATED');
    const [h, , s] = (await tokens.sign(claims)).split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: 'someone-else' })).toString('base64url');
    expect(await codeOf(tokens.verify(`${h}.${forged}.${s}`))).toBe('UNAUTHENTICATED');
  });

  it('carries no PII', async () => {
    const payload = JSON.parse(
      Buffer.from((await tokens.sign(claims)).split('.')[1]!, 'base64url').toString(),
    ) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sid', 'sub']);
  });
});

describe('refresh tokens', () => {
  it('are random, URL-safe and stored only as a SHA-256 hash', () => {
    const a = newRefreshToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(newRefreshToken());
    expect(hashRefreshToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(a)).toBe(hashRefreshToken(a));
  });
});
