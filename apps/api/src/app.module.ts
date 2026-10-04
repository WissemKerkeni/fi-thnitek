import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProblemDetailsFilter } from './common/problem-details.filter.js';
import { ConfigModule } from './config/config.module.js';
import { DbModule } from './db/db.module.js';
import { HealthModule } from './health/health.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { LoggingModule } from './logging/logging.module.js';
import { PlacesModule } from './places/places.module.js';
import { UsersModule } from './users/users.module.js';
import { VerificationModule } from './verification/verification.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DbModule,
    AuditModule,
    JobsModule,
    HealthModule,
    UsersModule,
    AuthModule,
    VerificationModule,
    PlacesModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
})
export class AppModule {}
