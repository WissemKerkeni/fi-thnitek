import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Me } from '@fi-thnitek/contracts';
import { AdminOnly, type AuthContext, CurrentAuth } from '../auth/decorators.js';
import { UsersService } from './users.service.js';

/** Lets the admin web app confirm the signed-in Google account is on the allow-list. */
@ApiTags('admin')
@ApiBearerAuth()
@AdminOnly()
@Controller('admin/me')
export class AdminMeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  get(@CurrentAuth() auth: AuthContext): Promise<Me> {
    return this.users.getMe(auth.userId);
  }
}
