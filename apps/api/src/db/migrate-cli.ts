import { loadEnv } from '../config/env.js';
import { runMigrations } from './migrate.js';

// `pnpm db:migrate` (tsx) or `node dist/db/migrate-cli.js` (container).
runMigrations(loadEnv().DATABASE_URL)
  .then(() => process.stdout.write('Migrations applied\n'))
  .catch((error: unknown) => {
    process.stderr.write(`Migration failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
