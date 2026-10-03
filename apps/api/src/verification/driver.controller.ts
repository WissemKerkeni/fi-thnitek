import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  DocumentUploadFields,
  type DocumentView,
  DriverProfileInput,
  type MyVerification,
  VehicleInput,
} from '@fi-thnitek/contracts';
import { type AuthContext, CurrentAuth } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { VerificationService } from './verification.service.js';

/** Hard cap before the configurable MAX_UPLOAD_MB check in the service. */
const MULTIPART_LIMITS = { fileSize: 20 * 1024 * 1024, files: 1, fields: 4, parts: 6 };

/** D1/D2: the caller's own driver file. The user ID always comes from the token. */
@ApiTags('driver')
@ApiBearerAuth()
@Controller('driver')
export class DriverController {
  constructor(private readonly verification: VerificationService) {}

  @Get('verification')
  get(@CurrentAuth() auth: AuthContext): Promise<MyVerification> {
    return this.verification.getMine(auth.userId);
  }

  @Put('profile')
  saveProfile(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(DriverProfileInput)) body: DriverProfileInput,
  ): Promise<MyVerification> {
    return this.verification.saveProfile(auth.userId, body);
  }

  @Put('vehicle')
  saveVehicle(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(VehicleInput)) body: VehicleInput,
  ): Promise<MyVerification> {
    return this.verification.saveVehicle(auth.userId, body);
  }

  @Post('documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: MULTIPART_LIMITS }))
  upload(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(DocumentUploadFields)) fields: DocumentUploadFields,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<DocumentView> {
    return this.verification.uploadDocument(auth.userId, fields, file);
  }

  @Delete('documents/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDocument(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.verification.deleteDocument(auth.userId, id);
  }

  @Post('verification/submit')
  @HttpCode(HttpStatus.OK)
  submit(@CurrentAuth() auth: AuthContext): Promise<MyVerification> {
    return this.verification.submit(auth.userId);
  }
}
