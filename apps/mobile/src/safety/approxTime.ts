import { tunisParts, tunisToIso } from '../routines/format';

/**
 * R-070, "around what time?" for a sharing session: the driver types a Tunis-local HH:MM and we find
 * the instant inside the session (which may run past midnight). Null when the time is malformed or
 * falls outside the session.
 */
export function approxInstant(time: string, fromIso: string, toIso: string): string | null {
  const m = /^([01]?\d|2[0-3])[:.h]([0-5]\d)$/.exec(time.trim());
  if (!m) return null;
  const hhmm = `${m[1]!.padStart(2, '0')}:${m[2]}`;
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  const days = new Set([tunisParts(fromIso).date, tunisParts(toIso).date]);
  for (const date of days) {
    const iso = tunisToIso(date, hhmm);
    const at = new Date(iso).getTime();
    // Minutes are what the driver typed: a session that started at 08:12 accepts 08:12.
    if (at >= from - 60_000 && at <= to) return new Date(Math.max(at, from)).toISOString();
  }
  return null;
}
