import { Module } from '@nestjs/common';
import { thresholdsProvider } from '../config/thresholds.provider.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AdminSessionsService } from './admin-sessions.service.js';
import { MapService } from './map.service.js';
import { PING_MIN_INTERVAL_MS } from './ping-rate-limiter.js';
import {
  AdminSessionsController,
  DriverSharingController,
  LocationController,
  MapController,
} from './sharing.controllers.js';
import { SharingSweepJob } from './sharing-sweep.job.js';
import { SharingService } from './sharing.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [DriverSharingController, LocationController, MapController, AdminSessionsController],
  providers: [
    SharingService,
    MapService,
    AdminSessionsService,
    SharingSweepJob,
    thresholdsProvider,
    { provide: PING_MIN_INTERVAL_MS, useValue: 3_000 },
  ],
  exports: [SharingService],
})
export class SharingModule {}
