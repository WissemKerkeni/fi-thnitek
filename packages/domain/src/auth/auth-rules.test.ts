import { describe, expect, it } from 'vitest';
import { accountAccess, decideRefresh } from './auth-rules.js';

const now = new Date('2026-10-03T12:00:00Z');
const later = new Date('2026-12-01T00:00:00Z');
const earlier = new Date('2026-10-01T00:00:00Z');
const live = { expiresAt: later, rotatedAt: null, revokedAt: null };

describe('decideRefresh', () => {
  it('rotates a live, unused token', () => {
    expect(decideRefresh(live, now)).toBe('ROTATE');
  });

  it('treats an unknown token as invalid', () => {
    expect(decideRefresh(undefined, now)).toBe('UNKNOWN');
  });

  it('detects reuse of an already-rotated token', () => {
    expect(decideRefresh({ ...live, rotatedAt: earlier }, now)).toBe('REUSED');
  });

  it('reports revoked before reuse, so a revoked family stays revoked without re-flagging', () => {
    expect(decideRefresh({ ...live, rotatedAt: earlier, revokedAt: earlier }, now)).toBe('REVOKED');
    expect(decideRefresh({ ...live, revokedAt: earlier }, now)).toBe('REVOKED');
  });

  it('expires at the exact expiry instant', () => {
    expect(decideRefresh({ ...live, expiresAt: now }, now)).toBe('EXPIRED');
    expect(decideRefresh({ ...live, expiresAt: new Date(now.getTime() + 1) }, now)).toBe('ROTATE');
  });

  it('flags reuse of a rotated token even after it expired', () => {
    expect(decideRefresh({ expiresAt: earlier, rotatedAt: earlier, revokedAt: null }, now)).toBe('REUSED');
  });
});

describe('accountAccess', () => {
  it('lets only active accounts in', () => {
    expect(accountAccess('ACTIVE')).toBe('OK');
    expect(accountAccess('SUSPENDED')).toBe('ACCOUNT_SUSPENDED');
    expect(accountAccess('BANNED')).toBe('ACCOUNT_BANNED');
    expect(accountAccess('DELETED')).toBe('ACCOUNT_DELETED');
  });
});
