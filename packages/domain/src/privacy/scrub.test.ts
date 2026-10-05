import { describe, expect, it } from 'vitest';
import { errorFingerprint, scrubText } from './scrub.js';

describe('scrubText (CLAUDE.md rule 8)', () => {
  it('removes coordinates in every common shape', () => {
    expect(scrubText('fix at 36.80651, 10.18149 failed')).toBe('fix at [coords] failed');
    expect(scrubText('{"lat":36.806512,"lng":10.181499}')).toBe('{"lat":[number],"lng":[number]}');
    expect(scrubText('Point(10.1815 36.8065)')).toBe('Point([number] [number])');
  });

  it('removes e-mails, phone numbers and tokens', () => {
    expect(scrubText('user sami.benali@example.tn not found')).toBe('user [email] not found');
    expect(scrubText('call +216 22 345 678 or 98123456')).toBe('call [phone] or [phone]');
    expect(scrubText('Authorization: Bearer abc.def-ghi')).toBe('Authorization: Bearer [token]');
    expect(scrubText('token eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl')).toBe('token [token]');
    expect(scrubText(`key ${'A1b2'.repeat(12)}`)).toBe('key [secret]');
  });

  it('keeps what is needed to debug: ids, codes, small numbers, stack frames', () => {
    const id = '0199b5a2-7c1e-7d3a-9f00-1234567890ab';
    expect(scrubText(`ApiError: NOT_SHARING (409) session ${id}`)).toBe(
      `ApiError: NOT_SHARING (409) session ${id}`,
    );
    expect(scrubText('at render (index.bundle:1234:56)')).toBe('at render (index.bundle:1234:56)');
    expect(scrubText('retry 3 of 5 after 2.5 s')).toBe('retry 3 of 5 after 2.5 s');
  });

  it('caps the length', () => {
    expect(scrubText('ab '.repeat(2000), 100)).toHaveLength(101);
  });
});

describe('errorFingerprint', () => {
  const stack =
    'TypeError: x is undefined\n    at MapScreen (index.bundle:120:7)\n    at render (index.bundle:9:1)';

  it('groups the same crash whatever the numbers and ids in the message or line numbers', () => {
    const a = errorFingerprint(
      'TypeError',
      'cannot read 3 of request 0199b5a2-7c1e-7d3a-9f00-1234567890ab',
      stack,
    );
    const b = errorFingerprint(
      'TypeError',
      'cannot read 7 of request 0199b5a2-0000-7d3a-9f00-aaaaaaaaaaaa',
      stack.replace('120:7', '133:2'),
    );
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it('separates different crashes', () => {
    expect(errorFingerprint('TypeError', 'x', stack)).not.toBe(errorFingerprint('RangeError', 'x', stack));
    expect(errorFingerprint('TypeError', 'x', stack)).not.toBe(
      errorFingerprint('TypeError', 'x', stack.replace('MapScreen', 'Sharing')),
    );
  });
});
