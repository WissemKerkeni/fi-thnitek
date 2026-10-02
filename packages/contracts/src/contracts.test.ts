import { describe, expect, it } from 'vitest';
import { HealthResponse, ProblemDetails, problemType } from './index.js';

describe('ProblemDetails', () => {
  it('accepts an RFC 9457 body with a known code', () => {
    const body = {
      type: problemType('SHARING_REQUIRED'),
      title: 'Sharing required',
      status: 403,
      code: 'SHARING_REQUIRED',
    };
    expect(ProblemDetails.parse(body)).toEqual(body);
  });

  it('rejects unknown codes and non-error statuses', () => {
    expect(ProblemDetails.safeParse({ type: 'x', title: 'x', status: 403, code: 'NOPE' }).success).toBe(
      false,
    );
    expect(ProblemDetails.safeParse({ type: 'x', title: 'x', status: 200, code: 'NOT_FOUND' }).success).toBe(
      false,
    );
  });

  it('builds kebab-case type URNs', () => {
    expect(problemType('SHARING_REQUIRED')).toBe('urn:fi-thnitek:problem:sharing-required');
  });
});

describe('HealthResponse', () => {
  it('requires an ISO timestamp', () => {
    const ok = {
      status: 'up',
      version: '0.0.0',
      time: '2026-10-02T10:00:00.000Z',
      checks: { database: 'up' },
    };
    expect(HealthResponse.safeParse(ok).success).toBe(true);
    expect(HealthResponse.safeParse({ ...ok, time: 'yesterday' }).success).toBe(false);
  });
});
