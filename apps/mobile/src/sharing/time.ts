import type { Lang } from '../places/format';

/** "14:30" in the phone's time zone (Tunisia: no DST). Latin digits in both languages, as on Tunisian signs. */
export function clockTime(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleTimeString(lang === 'ar' ? 'ar-TN-u-nu-latn' : 'fr-TN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** "12:05" (mm:ss) or "1:02:05" until `iso`; "0:00" once passed. */
export function countdown(iso: string, now: number): string {
  const left = Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000));
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = String(left % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Break options as labels: 30 → "30 min", 60 → "1 h", 120 → "2 h". */
export function breakLabel(minutes: number): {
  key: 'sharing.breakMinutes' | 'sharing.breakHours';
  value: number;
} {
  return minutes % 60 === 0
    ? { key: 'sharing.breakHours', value: minutes / 60 }
    : { key: 'sharing.breakMinutes', value: minutes };
}
