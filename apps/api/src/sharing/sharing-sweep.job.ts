import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SharingService } from './sharing.service.js';

/** Every 30 s (docs/architecture.md §7). Runs never overlap; each action is idempotent SQL. */
@Injectable()
export class SharingSweepJob {
  private readonly logger = new Logger(SharingSweepJob.name);
  private running = false;

  constructor(private readonly sharing: SharingService) {}

  @Interval('sharing-sweep', 30_000)
  async handle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const counts = await this.sharing.sweep();
      if (counts.ended + counts.reminded + counts.prompted > 0) this.logger.log(counts, 'sharing sweep');
    } catch (error) {
      this.logger.error({ err: error }, 'sharing sweep failed');
    } finally {
      this.running = false;
    }
  }
}
