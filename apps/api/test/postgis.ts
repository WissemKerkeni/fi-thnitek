import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Wait } from 'testcontainers';

/** Same major versions as production: PostgreSQL 16 + PostGIS 3. */
export const POSTGIS_IMAGE = 'postgis/postgis:16-3.5';

export async function startPostgis(): Promise<StartedPostgreSqlContainer> {
  return (
    new PostgreSqlContainer(POSTGIS_IMAGE)
      .withDatabase('fi_thnitek_test')
      .withUsername('app')
      .withPassword('app')
      // The image's init script installs PostGIS, topology and the Tiger geocoder into two databases, which
      // takes minutes on a busy laptop. Migration 0000 creates the extensions we use, so skip it.
      .withCopyContentToContainer([
        { content: '#!/bin/sh\n', target: '/docker-entrypoint-initdb.d/10_postgis.sh', mode: 0o755 },
      ])
      // TCP answers only once init is over and the real server is up (the init server is socket-only).
      .withWaitStrategy(Wait.forSuccessfulCommand('pg_isready -h 127.0.0.1 -U app -d fi_thnitek_test'))
      .withStartupTimeout(300_000)
      .start()
  );
}
