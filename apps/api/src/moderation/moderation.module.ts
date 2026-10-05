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
  Query,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AdminAppealQuery,
  type AdminFieldMetrics,
  AdminFieldMetricsQuery,
  type AdminAppealList,
  AdminPickupQuery,
  type AdminPickupList,
  type AdminReportDetail,
  type AdminReportList,
  AdminReportQuery,
  type AdminRiskFlagList,
  AdminRiskFlagQuery,
  type AdminStats,
  type AdminUserDetail,
  type AdminUserList,
  AdminUserQuery,
  AppealInput,
  type BlockList,
  type BlockView,
  CreateBlockInput,
  CreateReportInput,
  CreateSanctionInput,
  type ReportCreated,
  ResolveReportInput,
  RevokeSanctionInput,
} from '@fi-thnitek/contracts';
import type { z } from 'zod';
import { AuthModule } from '../auth/auth.module.js';
import { AdminOnly, type AuthContext, CurrentAuth, Public } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { thresholdsProvider } from '../config/thresholds.provider.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RequestsModule } from '../requests/requests.module.js';
import { SharingModule } from '../sharing/sharing.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminModerationService } from './admin-moderation.service.js';
import { FieldMetricsService } from './field-metrics.service.js';
import { ModerationService } from './moderation.service.js';
import { SanctionsService } from './sanctions.service.js';

/** R-070, R-071: reports and blocks. */
@ApiTags('safety')
@ApiBearerAuth()
@Controller()
export class SafetyController {
  constructor(private readonly moderation: ModerationService) {}

  @Post('reports')
  report(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(CreateReportInput)) body: z.output<typeof CreateReportInput>,
  ): Promise<ReportCreated> {
    return this.moderation.report(auth.userId, body);
  }

  @Post('blocks')
  block(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(CreateBlockInput)) body: z.output<typeof CreateBlockInput>,
  ): Promise<BlockView> {
    return this.moderation.block(auth.userId, body);
  }

  @Get('blocks')
  blocks(@CurrentAuth() auth: AuthContext): Promise<BlockList> {
    return this.moderation.blocks(auth.userId);
  }

  @Delete('blocks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  unblock(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.moderation.unblock(auth.userId, id);
  }
}

/** R-073: the contact form of a suspended or banned person (who cannot sign in). */
@ApiTags('auth')
@Public()
@Controller('auth')
export class AppealController {
  constructor(private readonly moderation: ModerationService) {}

  @Post('appeal')
  @HttpCode(HttpStatus.NO_CONTENT)
  appeal(@Body(new ZodValidationPipe(AppealInput)) body: AppealInput): Promise<void> {
    return this.moderation.appeal(body);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@AdminOnly()
@Controller('admin')
export class AdminModerationController {
  constructor(
    private readonly admin: AdminModerationService,
    private readonly sanctions: SanctionsService,
    private readonly fieldMetrics: FieldMetricsService,
  ) {}

  @Get('reports')
  reports(
    @Query(new ZodValidationPipe(AdminReportQuery)) q: z.output<typeof AdminReportQuery>,
  ): Promise<AdminReportList> {
    return this.admin.reports(q);
  }

  @Get('reports/:id')
  report(@Param('id', ParseUUIDPipe) id: string): Promise<AdminReportDetail> {
    return this.admin.report(id);
  }

  @Post('reports/:id/resolve')
  @HttpCode(HttpStatus.OK)
  resolve(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ResolveReportInput)) body: z.output<typeof ResolveReportInput>,
  ): Promise<AdminReportDetail> {
    return this.admin.resolve(id, body, auth.userId);
  }

  /** NFR-06: every read is audited. */
  @Get('pickups')
  pickups(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(AdminPickupQuery)) q: z.output<typeof AdminPickupQuery>,
  ): Promise<AdminPickupList> {
    return this.admin.pickups(q, auth.userId);
  }

  @Get('users')
  users(
    @Query(new ZodValidationPipe(AdminUserQuery)) q: z.output<typeof AdminUserQuery>,
  ): Promise<AdminUserList> {
    return this.admin.users(q);
  }

  @Get('users/:id')
  user(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserDetail> {
    return this.admin.user(id);
  }

  @Post('users/:id/sanctions')
  async sanction(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CreateSanctionInput)) body: z.output<typeof CreateSanctionInput>,
  ): Promise<AdminUserDetail> {
    await this.sanctions.apply(id, body, auth.userId);
    return this.admin.user(id);
  }

  @Post('sanctions/:id/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RevokeSanctionInput)) body: RevokeSanctionInput,
  ): Promise<void> {
    return this.sanctions.revoke(id, body.reason, auth.userId);
  }

  @Get('risk-flags')
  flags(
    @Query(new ZodValidationPipe(AdminRiskFlagQuery)) q: z.output<typeof AdminRiskFlagQuery>,
  ): Promise<AdminRiskFlagList> {
    return this.admin.flags(q);
  }

  @Post('risk-flags/:id/review')
  @HttpCode(HttpStatus.NO_CONTENT)
  reviewFlag(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.admin.reviewFlag(id, auth.userId);
  }

  @Get('appeals')
  appeals(
    @Query(new ZodValidationPipe(AdminAppealQuery)) q: z.output<typeof AdminAppealQuery>,
  ): Promise<AdminAppealList> {
    return this.admin.appeals(q);
  }

  @Post('appeals/:id/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  closeAppeal(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.admin.closeAppeal(id, auth.userId);
  }

  @Get('stats')
  stats(): Promise<AdminStats> {
    return this.admin.stats();
  }

  /** Phase 9: aggregates over a period for threshold tuning (no positions, no people). */
  @Get('field-metrics')
  metrics(
    @Query(new ZodValidationPipe(AdminFieldMetricsQuery)) q: z.output<typeof AdminFieldMetricsQuery>,
  ): Promise<AdminFieldMetrics> {
    return this.fieldMetrics.metrics(new Date(q.from), new Date(q.to));
  }
}

/** Every 5 min: suspensions that ran out give the account back. */
@Injectable()
export class ModerationSweepJob {
  private readonly logger = new Logger(ModerationSweepJob.name);
  private running = false;

  constructor(private readonly sanctions: SanctionsService) {}

  @Interval('moderation-sweep', 300_000)
  async handle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const restored = await this.sanctions.sweep();
      if (restored > 0) this.logger.log({ restored }, 'suspensions ended');
    } catch (error) {
      this.logger.error({ err: error }, 'moderation sweep failed');
    } finally {
      this.running = false;
    }
  }
}

@Module({
  imports: [AuthModule, NotificationsModule, UsersModule, SharingModule, RequestsModule],
  controllers: [SafetyController, AppealController, AdminModerationController],
  providers: [
    ModerationService,
    SanctionsService,
    AdminModerationService,
    FieldMetricsService,
    ModerationSweepJob,
    thresholdsProvider,
  ],
  exports: [SanctionsService],
})
export class ModerationModule {}
