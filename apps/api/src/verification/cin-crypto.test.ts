import { describe, expect, it } from 'vitest';
import { DEV_CIN_ENCRYPTION_KEY, DEV_CIN_HMAC_KEY } from '../config/env.js';
import { CinProtector } from './cin-crypto.js';

const protector = new CinProtector(DEV_CIN_ENCRYPTION_KEY, DEV_CIN_HMAC_KEY);

describe('CinProtector', () => {
  it('round-trips and never stores the CIN in clear', () => {
    const encrypted = protector.encrypt('01234567');
    expect(encrypted).not.toContain('01234567');
    expect(protector.decrypt(encrypted)).toBe('01234567');
  });

  it('uses a fresh IV each time', () => {
    expect(protector.encrypt('01234567')).not.toBe(protector.encrypt('01234567'));
  });

  it('gives a stable, keyed HMAC for the uniqueness index', () => {
    expect(protector.hmac('01234567')).toBe(protector.hmac('01234567'));
    expect(protector.hmac('01234567')).not.toBe(protector.hmac('01234568'));
    const other = new CinProtector(DEV_CIN_ENCRYPTION_KEY, 'another-hmac-key-0123456789abcdef!!');
    expect(other.hmac('01234567')).not.toBe(protector.hmac('01234567'));
  });

  it('rejects tampered ciphertexts and the wrong key', () => {
    const [v, iv, tag, ct] = protector.encrypt('01234567').split('.');
    const flipped = Buffer.from(ct!, 'base64url');
    flipped[0] = flipped[0]! ^ 1;
    expect(() => protector.decrypt([v, iv, tag, flipped.toString('base64url')].join('.'))).toThrow();
    const wrongKey = new CinProtector(Buffer.alloc(32, 9).toString('base64'), DEV_CIN_HMAC_KEY);
    expect(() => wrongKey.decrypt(protector.encrypt('01234567'))).toThrow();
  });
});
