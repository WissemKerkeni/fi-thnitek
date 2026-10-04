import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type AdminSessionDetail,
  type AdminSessionList,
  AdminSessionQuery,
  MapDriversRequest,
  type MapDriversResponse,
  PingsRequest,
  type PingsResponse,
  ResumeSharingRequest,
  SetFullRequest,
  type SharingStatus,
  StartBreakRequest,
  StartSharingRequest,
  UpdateSharingRequest,
} from '@fi-thnitek/contracts';
import type { z } from 'zod';
import { AdminOnly, type AuthContext, CurrentAuth } from '../auth/decorators.js';
import { ApiException } from '../common/api-exception.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AdminSessionsService } from './admin-sessions.service.js';
import { MapService } from './map.service.js';
import { PING_MIN_INTERVAL_MS, PingRateLimiter } from './ping-rate-limiter.js';
import { SharingService } from './sharing.service.js';

/** D3/D4 (R-050…R-058). Every action answers with the full status so the app has one source of truth. */
@ApiTags('driver')
@ApiBearerAuth()
@Controller('driver/sharing')
export class DriverSharingController {
  constructor(private readonly sharing: SharingService) {}

  @Get()
  status(@CurrentAuth() auth: AuthContext): Promise<SharingStatus> {
    return this.sharing.status(auth.userId);
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  start(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(StartSharingRequest)) body: z.output<typeof StartSharingRequest>,
  ): Promise<SharingStatus> {
    return this.sharing.start(auth.userId, body);
  }

  @Patch()
  update(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(UpdateSharingRequest)) body: z.output<typeof UpdateSharingRequest>,
  ): Promise<SharingStatus> {
    return this.sharing.update(auth.userId, body);
  }

  @Post('full')
  @HttpCode(HttpStatus.OK)
  full(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(SetFullRequest)) body: SetFullRequest,
  ): Promise<SharingStatus> {
    return this.sharing.setFull(auth.userId, body.isFull);
  }

  @Post('break')
  @HttpCode(HttpStatus.OK)
  startBreak(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(StartBreakRequest)) body: StartBreakRequest,
  ): Promise<SharingStatus> {
    return this.sharing.startBreak(auth.userId, body.minutes);
  }

  @Post('resume')
  @HttpCode(HttpStatus.OK)
  resume(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(ResumeSharingRequest)) body: z.output<typeof ResumeSharingRequest>,
  ): Promise<SharingStatus> {
    return this.sharing.resume(auth.userId, body);
  }

  @Post('still-working')
  @HttpCode(HttpStatus.OK)
  stillWorking(@CurrentAuth() auth: AuthContext): Promise<SharingStatus> {
    return this.sharing.confirmStillWorking(auth.userId);
  }

  @Post('stop')
  @HttpCode(HttpStatus.OK)
  stop(@CurrentAuth() auth: AuthContext): Promise<SharingStatus> {
    return this.sharing.stop(auth.userId);
  }
}

/** docs/architecture.md §4.2. The mode is inferred from server state; passenger requests join in Phase 6. */
@ApiTags('location')
@ApiBearerAuth()
@Controller('location')
export class LocationController {
  private readonly limiter: PingRateLimiter;

  constructor(
    private readonly sharing: SharingService,
    @Inject(PING_MIN_INTERVAL_MS) minIntervalMs: number,
  ) {
    this.limiter = new PingRateLimiter(minIntervalMs);
  }

  @Post('pings')
  @HttpCode(HttpStatus.OK)
  pings(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(PingsRequest)) body: z.output<typeof PingsRequest>,
  ): Promise<PingsResponse> {
    if (!this.limiter.allow(auth.userId))
      throw new ApiException('RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS);
    return this.sharing.ingest(auth.userId, body);
  }
}

/** The live map (R-020…R-026). The visible area travels in the body, never in the URL. */
@ApiTags('map')
@ApiBearerAuth()
@Controller('map')
export class MapController {
  constructor(private readonly map: MapService) {}

  @Post('drivers')
  @HttpCode(HttpStatus.OK)
  drivers(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(MapDriversRequest)) body: MapDriversRequest,
  ): Promise<MapDriversResponse> {
    return this.map.drivers(auth.userId, body.bbox);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@AdminOnly()
@Controller('admin')
export class AdminSessionsController {
  constructor(private readonly sessions: AdminSessionsService) {}

  @Get('sessions')
  list(
    @Query(new ZodValidationPipe(AdminSessionQuery)) q: z.output<typeof AdminSessionQuery>,
  ): Promise<AdminSessionList> {
    return this.sessions.list(q, q.page, q.pageSize);
  }

  @Get('sessions/:id')
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminSessionDetail> {
    return this.sessions.detail(id);
  }

  @Post('sessions/:id/end')
  @HttpCode(HttpStatus.OK)
  end(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<AdminSessionDetail> {
    return this.sessions.end(id, auth.userId);
  }

  @Post('drivers/:userId/clear-cooldown')
  @HttpCode(HttpStatus.NO_CONTENT)
  clearCooldown(
    @CurrentAuth() auth: AuthContext,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.sessions.clearCooldown(userId, auth.userId);
  }
}
