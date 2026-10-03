import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/** Same major versions as production: PostgreSQL 16 + PostGIS 3. */
export const POSTGIS_IMAGE = 'postgis/postgis:16-3.5';

export async function startPostgis(): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer(POSTGIS_IMAGE)
    .withDatabase('fi_thnitek_test')
    .withUsername('app')
    .withPassword('app')
    .start();
}
