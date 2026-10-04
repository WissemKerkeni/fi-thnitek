import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { thresholdsProvider } from '../config/thresholds.provider.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { STORAGE, StorageService } from '../storage/storage.service.js';
import { AdminVerificationController } from './admin-verification.controller.js';
import { AdminVerificationService } from './admin-verification.service.js';
import { CIN_PROTECTOR, CinProtector } from './cin-crypto.js';
import { DocumentExpiryJob } from './document-expiry.job.js';
import { DriverController } from './driver.controller.js';
import { VerificationService } from './verification.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [DriverController, AdminVerificationController],
  providers: [
    VerificationService,
    AdminVerificationService,
    DocumentExpiryJob,
    thresholdsProvider,
    { provide: STORAGE, inject: [ENV], useFactory: (env: Env) => new StorageService(env) },
    {
      provide: CIN_PROTECTOR,
      inject: [ENV],
      useFactory: (env: Env) => new CinProtector(env.CIN_ENCRYPTION_KEY, env.CIN_HMAC_KEY),
    },
  ],
  exports: [VerificationService],
})
export class VerificationModule {}
