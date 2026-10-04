import { Module } from '@nestjs/common';
import { ENV } from '../config/env.js';
import { PUSH_TRANSPORT, PushService, createPushTransport } from './push.service.js';

/** One push transport per process (firebase-admin allows a single default app). */
@Module({
  providers: [PushService, { provide: PUSH_TRANSPORT, inject: [ENV], useFactory: createPushTransport }],
  exports: [PushService],
})
export class NotificationsModule {}
