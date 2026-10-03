import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type Me, RegisterDeviceRequest, UpdateMeRequest } from '@fi-thnitek/contracts';
import { type AuthContext, CurrentAuth } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { UsersService } from './users.service.js';

/** Everything here acts on the caller only: the user ID always comes from the token, never the request. */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  get(@CurrentAuth() auth: AuthContext): Promise<Me> {
    return this.users.getMe(auth.userId);
  }

  @Patch()
  update(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(UpdateMeRequest)) body: UpdateMeRequest,
  ): Promise<Me> {
    return this.users.updateMe(auth.userId, body);
  }

  @Put('device')
  @HttpCode(HttpStatus.NO_CONTENT)
  registerDevice(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(RegisterDeviceRequest)) body: RegisterDeviceRequest,
  ): Promise<void> {
    return this.users.registerDevice(auth.userId, body);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@CurrentAuth() auth: AuthContext): Promise<void> {
    return this.users.deleteAccount(auth.userId);
  }
}
