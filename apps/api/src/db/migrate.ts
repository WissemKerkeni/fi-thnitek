import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadEnv } from '../config/env.js';
import { createDatabase, createPool } from './client.js';

export const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../drizzle');

/** Applies pending migrations. Used by `pnpm db:migrate` and by the integration tests. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = createPool(databaseUrl, 1);
  try {
    await migrate(createDatabase(pool), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations(loadEnv().DATABASE_URL)
    .then(() => process.stdout.write('Migrations applied\n'))
    .catch((error: unknown) => {
      process.stderr.write(`Migration failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    });
}
