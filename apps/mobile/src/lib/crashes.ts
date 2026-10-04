import type { ClientErrorReport } from '@fi-thnitek/contracts';
import { scrubText } from '@fi-thnitek/domain';

/** At most this many crash reports wait on the phone; older ones are dropped first. */
export const CRASH_QUEUE_MAX = 20;

/**
 * Phase 9 crash monitoring: a crash becomes a scrubbed report (no coordinates, e-mails, phones or
 * tokens, CLAUDE.md rule 8). `screen` is the route path without params.
 */
export function toCrashReport(
  error: unknown,
  fatal: boolean,
  screen: string | null,
  now: Date,
): ClientErrorReport {
  const e =
    error instanceof Error
      ? error
      : { name: 'Error', message: typeof error === 'string' ? error : 'Non-error thrown', stack: undefined };
  return {
    name: scrubText(e.name || 'Error', 200),
    message: scrubText(e.message || '(no message)'),
    // Only a real Error's stack says where it happened; a synthetic one would point here.
    stack: e.stack ? scrubText(e.stack, 8000) : null,
    screen: screen ? scrubText(screen.split('?')[0]!, 200) : null,
    fatal,
    occurredAt: now.toISOString(),
  };
}

/** Appends and keeps the newest `max` reports; the same crash repeating in a loop is kept once. */
export function enqueueCrash(
  queue: readonly ClientErrorReport[],
  report: ClientErrorReport,
  max = CRASH_QUEUE_MAX,
): ClientErrorReport[] {
  const last = queue[queue.length - 1];
  if (last && last.name === report.name && last.message === report.message && last.screen === report.screen) {
    return [...queue];
  }
  return [...queue, report].slice(-max);
}
