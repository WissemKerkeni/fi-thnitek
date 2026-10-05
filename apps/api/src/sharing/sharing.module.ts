import { Module } from '@nestjs/common';
import { thresholdsProvider } from '../config/thresholds.provider.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RequestsModule } from '../requests/requests.module.js';
import { RoutinesModule } from '../routines/routines.module.js';
import { AdminSessionsService } from './admin-sessions.service.js';
import { MAP_CACHE_MS, MapService } from './map.service.js';
import { PING_MIN_INTERVAL_MS } from './ping-rate-limiter.js';
import { MAP_RATE_LIMIT } from './window-rate-limiter.js';
import {
  AdminSessionsController,
  DriverSharingController,
  LocationController,
  MapController,
} from './sharing.controllers.js';
import { SharingSweepJob } from './sharing-sweep.job.js';
import { SharingService } from './sharing.service.js';

@Module({
  imports: [NotificationsModule, RoutinesModule, RequestsModule],
  controllers: [DriverSharingController, LocationController, MapController, AdminSessionsController],
  providers: [
    SharingService,
    MapService,
    AdminSessionsService,
    SharingSweepJob,
    thresholdsProvider,
    { provide: PING_MIN_INTERVAL_MS, useValue: 3_000 },
    // About one poll per 2 s on average, with room for panning (docs/security.md §6).
    { provide: MAP_RATE_LIMIT, useValue: { limit: 5, windowMs: 10_000 } },
    // Drivers and requests of an area are shared by its viewers for 2 s (architecture §8).
    { provide: MAP_CACHE_MS, useValue: 2_000 },
  ],
  exports: [SharingService],
})
export class SharingModule {}
