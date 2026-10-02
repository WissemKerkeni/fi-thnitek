import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

/**
 * Placeholder proving the scheduler is wired. The 30 s rule sweeps (docs/architecture.md §7) replace it
 * in Phases 5–6; every job must be idempotent SQL.
 */
@Injectable()
export class HeartbeatJob {
  private readonly logger = new Logger(HeartbeatJob.name);

  @Interval('heartbeat', 30_000)
  tick(): void {
    this.logger.debug('scheduler heartbeat');
  }
}
