import { type Server } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type JWTPayload, SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.factory.js';
import { GOOGLE_VERIFIER, GoogleTokenVerifier } from '../src/auth/google-verifier.js';
import { DEV_CIN_ENCRYPTION_KEY, DEV_CIN_HMAC_KEY, DEV_JWT_SECRET, ENV, loadEnv } from '../src/config/env.js';
import { runMigrations } from '../src/db/migrate.js';
import { PUSH_TRANSPORT, RecordingTransport } from '../src/notifications/push.service.js';
import { TEST_S3, startGarage } from './garage.js';
import { startPostgis } from './postgis.js';

export const TEST_CLIENT_ID = 'test-web.apps.googleusercontent.com';
export const TEST_ADMIN_EMAIL = 'admin@fi-thnitek.test';
export const TEST_TERMS_VERSION = 'test-terms-1';

export interface TestApp {
  app: INestApplication;
  server: () => Server;
  /** A direct pool for assertions and fixtures (bypasses the API). */
  pool: Pool;
  /** Signs a Google-like ID token with the local test key. */
  googleToken: (claims?: JWTPayload) => Promise<string>;
  /** Pushes the app tried to send (no FCM in tests). */
  push: RecordingTransport;
  close: () => Promise<void>;
}

/**
 * Real PostGIS and Garage (Testcontainers) + migrations + the full Nest app. Only Google's key set is local
 * and pushes are recorded instead of sent.
 */
export async function startTestApp(): Promise<TestApp> {
  const [container, garage] = await Promise.all([startPostgis(), startGarage()]);
  const databaseUrl = container.getConnectionUri();
  const push = new RecordingTransport();
  await runMigrations(databaseUrl);
  const pool = new Pool({ connectionString: databaseUrl });

  const keys = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'test', alg: 'RS256', use: 'sig' };
  const verifier = new GoogleTokenVerifier([TEST_CLIENT_ID], createLocalJWKSet({ keys: [jwk] }));

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(
      loadEnv({
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
        LOG_LEVEL: 'silent',
        JWT_SECRET: DEV_JWT_SECRET,
        GOOGLE_CLIENT_IDS: TEST_CLIENT_ID,
        ADMIN_EMAILS: TEST_ADMIN_EMAIL,
        TERMS_VERSION: TEST_TERMS_VERSION,
        S3_ENDPOINT: garage.endpoint,
        S3_BUCKET: TEST_S3.bucket,
        S3_ACCESS_KEY_ID: TEST_S3.accessKeyId,
        S3_SECRET_ACCESS_KEY: TEST_S3.secretAccessKey,
        CIN_ENCRYPTION_KEY: DEV_CIN_ENCRYPTION_KEY,
        CIN_HMAC_KEY: DEV_CIN_HMAC_KEY,
      }),
    )
    .overrideProvider(GOOGLE_VERIFIER)
    .useValue(verifier)
    .overrideProvider(PUSH_TRANSPORT)
    .useValue(push)
    .compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.init();

  const googleToken = (claims: JWTPayload = {}) => {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      sub: 'google-sub-1',
      iss: 'https://accounts.google.com',
      aud: TEST_CLIENT_ID,
      email: 'sami@example.tn',
      email_verified: true,
      ...claims,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(keys.privateKey);
  };

  return {
    app,
    server: () => app.getHttpServer() as Server,
    pool,
    googleToken,
    push,
    close: async () => {
      await app.close();
      await pool.end();
      await Promise.all([container.stop(), garage.container.stop()]);
    },
  };
}
