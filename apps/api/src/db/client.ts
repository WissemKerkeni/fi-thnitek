import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

export type Database = NodePgDatabase<typeof schema>;

export function createPool(
  connectionString: string,
  max = 10,
  onIdleError: (error: Error) => void = (error) => process.stderr.write(`db pool: ${error.message}\n`),
): Pool {
  // All timestamps are UTC (CLAUDE.md rule 9).
  const pool = new Pool({ connectionString, max, options: '-c timezone=UTC' });
  // An idle connection dropped by the server (restart, network) must not crash the process: the pool
  // discards it and opens a new one for the next query. Without a listener, Node treats it as fatal.
  pool.on('error', onIdleError);
  return pool;
}

export function createDatabase(pool: Pool): Database {
  return drizzle(pool, { schema });
}

/** A transaction handle, for helpers that must run inside the caller's transaction. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Executor = Database | Tx;
