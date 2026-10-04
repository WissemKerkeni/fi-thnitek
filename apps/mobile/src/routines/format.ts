import type { RoutineSchedule, Weekday } from '@fi-thnitek/contracts';

/** Africa/Tunis is UTC+1 all year; routine times are always Tunis-local. */
const TUNIS_OFFSET_MS = 3_600_000;

export const ALL_DAYS: readonly Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const WORK_DAYS: readonly Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Tunis-local date "YYYY-MM-DD" and time "HH:MM" of an instant. */
export function tunisParts(iso: string): { date: string; time: string } {
  const local = new Date(new Date(iso).getTime() + TUNIS_OFFSET_MS).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

/** The instant of a Tunis-local date and time. */
export function tunisToIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+01:00`).toISOString();
}

/** "DD/MM" for a Tunis-local "YYYY-MM-DD". */
export function shortDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** "Lun, Mer · 07:00", "Du lundi au vendredi · 07:00", "Tous les jours · 07:00" or "12/10 · 09:30". */
export function scheduleSummary(s: RoutineSchedule, t: Translate): string {
  if (s.kind === 'ONE_OFF') {
    const { date, time } = tunisParts(s.at);
    return `${shortDate(date)} · ${time}`;
  }
  const sorted = ALL_DAYS.filter((d) => s.days.includes(d));
  const days =
    sorted.length === 7
      ? t('routines.everyDay')
      : sorted.length === 5 && WORK_DAYS.every((d) => sorted.includes(d))
        ? t('routines.weekdays')
        : sorted.map((d) => t(`routines.day_${d}`)).join(', ');
  return `${days} · ${s.localTime}`;
}

/** Hour ±1 (wraps 0–23) or minute ±5 (wraps 0–55) of "HH:MM". */
export function stepTime(value: string, field: 'hour' | 'minute', delta: 1 | -1): string {
  const [h = 0, m = 0] = value.split(':').map(Number);
  const hour = field === 'hour' ? (h + delta + 24) % 24 : h;
  const minute = field === 'minute' ? (Math.round(m / 5) * 5 + delta * 5 + 60) % 60 : m;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Tomorrow's Tunis-local date, a sensible default for a new one-off trip. */
export function tunisTomorrow(now = Date.now()): string {
  return new Date(now + TUNIS_OFFSET_MS + 86_400_000).toISOString().slice(0, 10);
}
