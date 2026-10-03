import { describe, expect, it } from 'vitest';
import { DEV_JWT_SECRET, InvalidEnvError, loadEnv } from './env.js';

const valid = { DATABASE_URL: 'postgres://app:secret@localhost:5432/fi', JWT_SECRET: DEV_JWT_SECRET };

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

  it('splits Google client IDs and lowercases admin emails', () => {
    const env = loadEnv({
      ...valid,
      GOOGLE_CLIENT_IDS: 'a.apps.googleusercontent.com',
      ADMIN_EMAILS: ' Admin@Example.TN ,x@y.tn',
    });
    expect(env.GOOGLE_CLIENT_IDS).toEqual(['a.apps.googleusercontent.com']);
    expect(env.ADMIN_EMAILS).toEqual(['admin@example.tn', 'x@y.tn']);
    expect(env).toMatchObject({ ACCESS_TOKEN_TTL_S: 900, REFRESH_TOKEN_TTL_DAYS: 60 });
  });

  it('requires a JWT secret of at least 32 characters', () => {
    expect(() => loadEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(InvalidEnvError);
  });

  it('refuses the development JWT secret in production', () => {
    expect(() => loadEnv({ ...valid, NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(loadEnv({ ...valid, NODE_ENV: 'production', JWT_SECRET: 'p'.repeat(48) }).NODE_ENV).toBe(
      'production',
    );
  });

  it('never echoes secret values in the error', () => {
    try {
      loadEnv({ DATABASE_URL: 'postgres://app:hunter2@', PORT: '0', JWT_SECRET: 'tooshort-hunter3' });
    } catch (error) {
      expect((error as Error).message).not.toContain('hunter2');
      expect((error as Error).message).not.toContain('hunter3');
    }
  });
});
