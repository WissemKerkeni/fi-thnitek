import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ENV, type Env } from '../config/env.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { GOOGLE_VERIFIER, GoogleTokenVerifier } from './google-verifier.js';
import { ACCESS_TOKENS, AccessTokens } from './tokens.js';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: GOOGLE_VERIFIER,
      inject: [ENV],
      useFactory: (env: Env) => new GoogleTokenVerifier(env.GOOGLE_CLIENT_IDS),
    },
    {
      provide: ACCESS_TOKENS,
      inject: [ENV],
      useFactory: (env: Env) => new AccessTokens(env.JWT_SECRET, env.ACCESS_TOKEN_TTL_S),
    },
    // Every route requires a valid session unless marked @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [GOOGLE_VERIFIER],
})
export class AuthModule {}
