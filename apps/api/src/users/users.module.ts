import { Module } from '@nestjs/common';
import { AdminMeController } from './admin-me.controller.js';
import { MeController } from './me.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [MeController, AdminMeController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
