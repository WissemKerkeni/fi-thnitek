import type { Place } from '@fi-thnitek/contracts';

/** The script of place names: Arabic, or the Latin (French) spelling, also used in English (ADR-224). */
export type Lang = 'ar' | 'fr';

export const langOf = (language: string | undefined): Lang =>
  language?.startsWith('fr') || language?.startsWith('en') ? 'fr' : 'ar';

/** The name in the UI language, and the other one as a hint (shown only when it differs). */
export function placeNames(
  place: Pick<Place, 'nameAr' | 'nameFr'>,
  lang: Lang,
): { name: string; other: string | null } {
  const name = lang === 'ar' ? place.nameAr : place.nameFr;
  const other = lang === 'ar' ? place.nameFr : place.nameAr;
  return { name, other: other.trim() && other !== name ? other : null };
}

/** Distance for display: metres rounded to 10 below 1 km, then km with one decimal below 10 km. */
export function distanceParts(meters: number): { unit: 'meters' | 'kilometers'; value: string } {
  if (meters < 1000) return { unit: 'meters', value: String(Math.max(10, Math.round(meters / 10) * 10)) };
  const km = meters / 1000;
  return { unit: 'kilometers', value: km < 10 ? km.toFixed(1) : String(Math.round(km)) };
}
