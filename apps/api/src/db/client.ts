import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

export type Database = NodePgDatabase<typeof schema>;

export function createPool(connectionString: string, max = 10): Pool {
  // All timestamps are UTC (CLAUDE.md rule 9).
  return new Pool({ connectionString, max, options: '-c timezone=UTC' });
}

export function createDatabase(pool: Pool): Database {
  return drizzle(pool, { schema });
}

/** A transaction handle, for helpers that must run inside the caller's transaction. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Executor = Database | Tx;
