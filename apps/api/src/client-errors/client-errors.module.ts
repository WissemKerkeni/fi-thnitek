import { Body, Controller, Get, HttpCode, HttpStatus, Ip, Module, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminClientErrorQuery, type AdminClientErrorList, ClientErrorsRequest } from '@fi-thnitek/contracts';
import type { z } from 'zod';
import { AdminOnly, Public } from '../auth/decorators.js';
import { ApiException } from '../common/api-exception.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { WindowRateLimiter } from '../sharing/window-rate-limiter.js';
import { ClientErrorsService } from './client-errors.service.js';

/** Phase 9 crash monitoring: the phone sends scrubbed crashes here, without signing in. */
@ApiTags('client-errors')
@Public()
@Controller('client-errors')
export class ClientErrorsController {
  /** Per install and per network address: a crash loop cannot flood the table. */
  private readonly byInstall = new WindowRateLimiter({ limit: 10, windowMs: 3_600_000 });
  private readonly byIp = new WindowRateLimiter({ limit: 60, windowMs: 3_600_000 });

  constructor(private readonly errors: ClientErrorsService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async report(
    @Ip() ip: string,
    @Body(new ZodValidationPipe(ClientErrorsRequest)) body: ClientErrorsRequest,
  ): Promise<void> {
    if (!this.byIp.allow(ip) || !this.byInstall.allow(body.installId)) {
      throw new ApiException('RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.errors.record(body);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@AdminOnly()
@Controller('admin/client-errors')
export class AdminClientErrorsController {
  constructor(private readonly errors: ClientErrorsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(AdminClientErrorQuery)) q: z.output<typeof AdminClientErrorQuery>,
  ): Promise<AdminClientErrorList> {
    return this.errors.groups(q.days);
  }
}

@Module({
  controllers: [ClientErrorsController, AdminClientErrorsController],
  providers: [ClientErrorsService],
})
export class ClientErrorsModule {}
