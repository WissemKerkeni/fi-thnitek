import { Module } from '@nestjs/common';
import { thresholdsProvider } from '../config/thresholds.provider.js';
import { RetentionService } from './retention.service.js';

@Module({ providers: [RetentionService, thresholdsProvider], exports: [RetentionService] })
export class RetentionModule {}
