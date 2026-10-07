/** docs/domain-model.md § Places (R-010). */
export const PLACE_KINDS = [
  'GOVERNORATE',
  'DELEGATION',
  'CITY',
  'NEIGHBOURHOOD',
  'LOUAGE_STATION',
  'BUS_STATION',
  /** Taxi ranks (OSM amenity=taxi); usually unnamed, so named after their kind. */
  'TAXI_STATION',
  'AIRPORT',
  'LANDMARK',
] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

/**
 * Folds a name or a query into one comparable form so that "Sousse", "SOUSSE", "Soûsse" and
 * Arabic spelling variants (أ/إ/آ/ا, ى/ي, ة/ه, diacritics, tatweel) match. Used both when indexing
 * places (`search_text`) and when searching, so they always agree.
 */
export function normalizeSearchText(input: string): string {
  return (
    input
      .normalize('NFKD')
      // Latin diacritics (é → e) and Arabic harakat / Quranic marks.
      .replace(/[̀-ͯ]/g, '')
      .replace(/[ً-ٰٟۖ-ۭ]/g, '')
      // Tatweel.
      .replace(/ـ/g, '')
      // Alef variants → bare alef; alef maqsura → ya; ta marbuta → ha; hamza carriers → base letter.
      .replace(/[آأإٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      // Arabic-Indic digits → ASCII.
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .toLowerCase()
      // Apostrophes and dashes join words ("Ben Arous", "Ben-Arous", "Bou'Salem").
      .replace(/['’`-]/g, ' ')
      .replace(/[^\p{L}\p{N} ]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Builds the indexed search text of a place from all its names (deduplicated). */
export function placeSearchText(names: readonly (string | null | undefined)[]): string {
  const parts = new Set<string>();
  for (const name of names) {
    if (!name) continue;
    const n = normalizeSearchText(name);
    if (n) parts.add(n);
  }
  return [...parts].join(' | ');
}

/** Default ranking weight by kind: towns and stations are the usual destinations. */
export const KIND_POPULARITY: Readonly<Record<PlaceKind, number>> = {
  CITY: 60,
  LOUAGE_STATION: 55,
  TAXI_STATION: 35,
  AIRPORT: 55,
  BUS_STATION: 45,
  DELEGATION: 40,
  NEIGHBOURHOOD: 35,
  GOVERNORATE: 30,
  LANDMARK: 25,
};

/** 0–100: kind weight plus a log bonus for population when known. */
export function placePopularity(kind: PlaceKind, population?: number | null): number {
  const bonus = population && population > 0 ? Math.min(40, Math.round(Math.log10(population) * 7)) : 0;
  return Math.min(100, KIND_POPULARITY[kind] + bonus);
}

/**
 * Minimum pg_trgm word similarity for a fuzzy match ("Sousa" → Sousse, "Monastir" → Monastir).
 * pg_trgm's default (0.6) misses common one-letter misspellings of short names.
 */
export const PLACE_SEARCH_MIN_SIMILARITY = 0.4;
