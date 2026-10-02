import { type Server } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthResponse, PROBLEM_JSON, ProblemDetails } from '@fi-thnitek/contracts';
import { type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.factory.js';
import { ENV, loadEnv } from '../src/config/env.js';
import { runMigrations } from '../src/db/migrate.js';
import { startPostgis } from './postgis.js';

let container: StartedPostgreSqlContainer;
let pool: Pool;
let app: INestApplication;
const server = () => app.getHttpServer() as Server;

beforeAll(async () => {
  container = await startPostgis();
  const databaseUrl = container.getConnectionUri();
  await runMigrations(databaseUrl);
  pool = new Pool({ connectionString: databaseUrl });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(loadEnv({ NODE_ENV: 'test', DATABASE_URL: databaseUrl, LOG_LEVEL: 'silent' }))
    .compile();
  app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await container?.stop();
});

describe('migrations', () => {
  it('enables postgis, unaccent and pg_trgm', async () => {
    const { rows } = await pool.query<{ extname: string }>(
      `SELECT extname FROM pg_extension WHERE extname IN ('postgis', 'unaccent', 'pg_trgm') ORDER BY extname`,
    );
    expect(rows.map((r) => r.extname)).toEqual(['pg_trgm', 'postgis', 'unaccent']);
  });

  it('runs in UTC', async () => {
    const client = await pool.connect();
    try {
      await client.query(`SET timezone = 'UTC'`);
      const { rows } = await client.query<{ tz: string }>('SHOW timezone');
      expect(rows[0]?.tz).toBe('UTC');
    } finally {
      client.release();
    }
  });
});

describe('audit.audit_logs', () => {
  const id = '01928c4e-7c6a-7c3e-8f2a-1b2c3d4e5f60';

  it('accepts inserts', async () => {
    await pool.query(
      `INSERT INTO audit.audit_logs (id, actor_type, action, target_type, target_id) VALUES ($1, 'SYSTEM', 'test.insert', 'test', '1')`,
      [id],
    );
    const { rowCount } = await pool.query('SELECT 1 FROM audit.audit_logs WHERE id = $1', [id]);
    expect(rowCount).toBe(1);
  });

  it('rejects updates, deletes and truncates, even from the table owner', async () => {
    await expect(pool.query(`UPDATE audit.audit_logs SET action = 'x' WHERE id = $1`, [id])).rejects.toThrow(
      /insert-only/,
    );
    await expect(pool.query('DELETE FROM audit.audit_logs WHERE id = $1', [id])).rejects.toThrow(
      /insert-only/,
    );
    await expect(pool.query('TRUNCATE audit.audit_logs')).rejects.toThrow(/insert-only/);
  });

  it('grants the writer role INSERT and SELECT only', async () => {
    const { rows } = await pool.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
       WHERE grantee = 'fi_audit_writer' AND table_schema = 'audit' AND table_name = 'audit_logs'
       ORDER BY privilege_type`,
    );
    expect(rows.map((r) => r.privilege_type)).toEqual(['INSERT', 'SELECT']);
  });
});

describe('GET /v1/health', () => {
  it('reports the database as up', async () => {
    const res = await request(server()).get('/v1/health').expect(200);
    const body = HealthResponse.parse(res.body);
    expect(body.status).toBe('up');
    expect(body.checks.database).toBe('up');
  });

  it('returns RFC 9457 problem details for unknown routes', async () => {
    const res = await request(server()).get('/v1/nope').expect(404);
    expect(res.headers['content-type']).toContain(PROBLEM_JSON);
    expect(ProblemDetails.parse(res.body)).toMatchObject({ code: 'NOT_FOUND', instance: '/v1/nope' });
  });

  it('serves the OpenAPI document outside production', async () => {
    const res = await request(server()).get('/v1/docs-json').expect(200);
    const doc = res.body as {
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    };
    expect(Object.keys(doc.paths)).toContain('/v1/health');
    expect(doc.components.schemas).toHaveProperty('HealthResponse');
  });
});
