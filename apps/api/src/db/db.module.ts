import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { Pool } from 'pg';
import { ENV, type Env } from '../config/env.js';
import { createDatabase, createPool } from './client.js';

export const PG_POOL = Symbol('PG_POOL');
export const DB = Symbol('DB');

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ENV],
      useFactory: (env: Env) => createPool(env.DATABASE_URL, env.DATABASE_POOL_MAX),
    },
    { provide: DB, inject: [PG_POOL], useFactory: createDatabase },
  ],
  exports: [PG_POOL, DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
