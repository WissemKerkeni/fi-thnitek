import { describe, expect, it } from 'vitest';
import { InvalidEnvError, loadEnv } from './env.js';

const valid = { DATABASE_URL: 'postgres://app:secret@localhost:5432/fi' };

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(valid);
    expect(env).toMatchObject({ NODE_ENV: 'development', PORT: 3000, LOG_LEVEL: 'info', CORS_ORIGINS: [] });
  });

  it('coerces numbers and splits CORS origins', () => {
    const env = loadEnv({
      ...valid,
      PORT: '8080',
      CORS_ORIGINS: 'http://localhost:5173, https://admin.example',
    });
    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'https://admin.example']);
  });

  it('fails fast listing every problem', () => {
    const run = () => loadEnv({ PORT: 'abc', LOG_LEVEL: 'loud' });
    expect(run).toThrow(InvalidEnvError);
    try {
      run();
    } catch (error) {
      const issues = (error as InvalidEnvError).issues.join('\n');
      expect(issues).toContain('DATABASE_URL');
      expect(issues).toContain('PORT');
      expect(issues).toContain('LOG_LEVEL');
    }
  });

  it('rejects non-postgres database URLs', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://localhost/fi' })).toThrow(InvalidEnvError);
  });

  it('never echoes secret values in the error', () => {
    try {
      loadEnv({ DATABASE_URL: 'postgres://app:hunter2@', PORT: '0' });
    } catch (error) {
      expect((error as Error).message).not.toContain('hunter2');
    }
  });
});
