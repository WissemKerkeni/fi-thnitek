import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { type HealthResponse } from '@fi-thnitek/contracts';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { Public } from '../auth/decorators.js';
import { ENV, type Env } from '../config/env.js';
import { PG_POOL } from '../db/db.module.js';
import { schemaRef } from '../openapi/zod-openapi.js';

const DB_CHECK_TIMEOUT_MS = 2_000;

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  @ApiOkResponse({ schema: schemaRef('HealthResponse') })
  @ApiServiceUnavailableResponse({ schema: schemaRef('HealthResponse') })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const database = (await this.databaseIsUp()) ? 'up' : 'down';
    const body: HealthResponse = {
      status: database,
      version: this.env.APP_VERSION,
      time: new Date().toISOString(),
      checks: { database },
    };
    res.status(database === 'up' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return body;
  }

  private async databaseIsUp(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), DB_CHECK_TIMEOUT_MS);
    });
    const query = this.pool.query('SELECT 1').then(
      () => true,
      () => false,
    );
    try {
      return await Promise.race([query, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
