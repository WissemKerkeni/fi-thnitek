import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase, createPool } from './client.js';

/** `apps/api/drizzle`, from both `src/db` (tsx, Vitest) and `dist/db` (built image). */
export const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../drizzle');

/** Applies pending migrations. Used by `migrate-cli.ts` and by the integration tests. */
export async function runMigrations(
  databaseUrl: string,
  migrationsFolder = MIGRATIONS_FOLDER,
): Promise<void> {
  const pool = createPool(databaseUrl, 1);
  try {
    await migrate(createDatabase(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
