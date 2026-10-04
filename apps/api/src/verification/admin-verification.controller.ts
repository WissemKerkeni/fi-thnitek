import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type AdminVerificationDetail,
  DecisionRequest,
  type DocumentUrl,
  type VerificationQueueItem,
  VerificationState,
} from '@fi-thnitek/contracts';
import { AdminOnly, type AuthContext, CurrentAuth } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AdminVerificationService } from './admin-verification.service.js';

@ApiTags('admin')
@ApiBearerAuth()
@AdminOnly()
@Controller('admin')
export class AdminVerificationController {
  constructor(private readonly admin: AdminVerificationService) {}

  @Get('verifications')
  queue(
    @Query('state', new ZodValidationPipe(VerificationState.optional())) state?: VerificationState,
  ): Promise<VerificationQueueItem[]> {
    return this.admin.queue(state);
  }

  @Get('verifications/:userId')
  detail(
    @CurrentAuth() auth: AuthContext,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<AdminVerificationDetail> {
    return this.admin.detail(userId, auth.userId);
  }

  @Post('verifications/:userId/decision')
  @HttpCode(HttpStatus.OK)
  decide(
    @CurrentAuth() auth: AuthContext,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(DecisionRequest)) body: DecisionRequest,
  ): Promise<AdminVerificationDetail> {
    return this.admin.decide(userId, auth.userId, body);
  }

  @Get('documents/:id/url')
  documentUrl(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentUrl> {
    return this.admin.documentUrl(id, auth.userId);
  }
}
