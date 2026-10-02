import { loadEnv } from '../config/env.js';

/** Development seed. Phase 1 has no feature tables; places and transport types arrive in later phases. */
function seed(): void {
  loadEnv();
  process.stdout.write('Nothing to seed yet (Phase 1)\n');
}

try {
  seed();
} catch (error) {
  process.stderr.write(`Seed failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
