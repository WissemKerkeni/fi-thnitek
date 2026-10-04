import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Logger,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoutineInput, type RoutineList, type RoutineView, StillRunningRequest } from '@fi-thnitek/contracts';
import type { z } from 'zod';
import { type AuthContext, CurrentAuth } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { thresholdsProvider } from '../config/thresholds.provider.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RoutinesService } from './routines.service.js';

/** D5 routine routes, available without sharing (product plan rule 5). */
@ApiTags('driver')
@ApiBearerAuth()
@Controller('driver/routines')
export class RoutinesController {
  constructor(private readonly routines: RoutinesService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext): Promise<RoutineList> {
    return this.routines.list(auth.userId);
  }

  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(RoutineInput)) body: z.output<typeof RoutineInput>,
  ): Promise<RoutineView> {
    return this.routines.create(auth.userId, body);
  }

  @Put(':id')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RoutineInput)) body: z.output<typeof RoutineInput>,
  ): Promise<RoutineView> {
    return this.routines.update(auth.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.routines.remove(auth.userId, id);
  }

  @Post(':id/still-running')
  @HttpCode(HttpStatus.OK)
  stillRunning(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(StillRunningRequest)) body: StillRunningRequest,
  ): Promise<RoutineView> {
    return this.routines.stillRunning(auth.userId, id, body.running);
  }
}

/** Daily at 09:00 Tunis time: staleness prompts and hiding (R-067). Idempotent. */
@Injectable()
export class RoutineStalenessJob {
  private readonly logger = new Logger(RoutineStalenessJob.name);

  constructor(private readonly routines: RoutinesService) {}

  @Cron('0 9 * * *', { name: 'routine-staleness', timeZone: 'Africa/Tunis' })
  async handle(): Promise<void> {
    try {
      const counts = await this.routines.staleSweep();
      if (counts.prompted + counts.hidden > 0) this.logger.log(counts, 'routine staleness');
    } catch (error) {
      this.logger.error({ err: error }, 'routine staleness failed');
    }
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [RoutinesController],
  providers: [RoutinesService, RoutineStalenessJob, thresholdsProvider],
  exports: [RoutinesService],
})
export class RoutinesModule {}
