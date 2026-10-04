import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Logger,
  Module,
  Post,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateRequestInput, type CurrentRequest, type RequestHistory } from '@fi-thnitek/contracts';
import type { z } from 'zod';
import { type AuthContext, CurrentAuth } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { thresholdsProvider } from '../config/thresholds.provider.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RequestsService } from './requests.service.js';

/** P3–P5 (R-030…R-042): one open taxi/louage request per passenger. */
@ApiTags('requests')
@ApiBearerAuth()
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(CreateRequestInput)) body: z.output<typeof CreateRequestInput>,
  ): Promise<CurrentRequest> {
    return this.requests.create(auth.userId, body);
  }

  @Get('current')
  current(@CurrentAuth() auth: AuthContext): Promise<CurrentRequest> {
    return this.requests.current(auth.userId);
  }

  @Post('current/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentAuth() auth: AuthContext): Promise<CurrentRequest> {
    return this.requests.cancel(auth.userId);
  }

  @Post('current/renew')
  @HttpCode(HttpStatus.OK)
  renew(@CurrentAuth() auth: AuthContext): Promise<CurrentRequest> {
    return this.requests.renew(auth.userId);
  }

  @Get('history')
  history(@CurrentAuth() auth: AuthContext): Promise<RequestHistory> {
    return this.requests.history(auth.userId);
  }
}

/** Every 30 s (docs/architecture.md §4.3). Runs never overlap; each action is a conditional update. */
@Injectable()
export class RequestsSweepJob {
  private readonly logger = new Logger(RequestsSweepJob.name);
  private running = false;

  constructor(private readonly requests: RequestsService) {}

  @Interval('requests-sweep', 30_000)
  async handle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const counts = await this.requests.sweep();
      if (counts.closed + counts.reminded > 0) this.logger.log(counts, 'requests sweep');
    } catch (error) {
      this.logger.error({ err: error }, 'requests sweep failed');
    } finally {
      this.running = false;
    }
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [RequestsController],
  providers: [RequestsService, RequestsSweepJob, thresholdsProvider],
  exports: [RequestsService],
})
export class RequestsModule {}
