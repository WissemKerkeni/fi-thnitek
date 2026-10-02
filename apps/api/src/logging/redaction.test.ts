import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACT_CENSOR, REDACT_PATHS } from './redaction.js';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  const logger = pino({ redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR } }, stream);
  return { logger, output: () => lines.join('') };
}

describe('log redaction', () => {
  it('redacts PII and coordinates at the top level and nested', () => {
    const { logger, output } = capture();
    logger.info(
      {
        email: 'a@b.tn',
        user: { name: 'Sami', phone: '+21622000000', cin: '01234567' },
        fix: { point: { lat: 36.8, lng: 10.18 } },
        req: { headers: { authorization: 'Bearer secret' } },
      },
      'event',
    );
    const out = output();
    for (const secret of ['a@b.tn', 'Sami', '+21622000000', '01234567', '36.8', '10.18', 'Bearer secret']) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain(REDACT_CENSOR);
  });

  it('keeps non-sensitive fields', () => {
    const { logger, output } = capture();
    logger.info({ requestId: 'r-1', status: 200 }, 'ok');
    expect(output()).toContain('r-1');
  });
});
