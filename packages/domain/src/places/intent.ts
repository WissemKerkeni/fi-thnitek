import { type PlaceKind, normalizeSearchText } from './places.js';

/**
 * ADR-224: a search for a *type* of place ("station louage", "محطة اللواج", "bus station", "taxi",
 * "aéroport") rather than a name. With nothing else in the query, the API answers with the nearest
 * places of that kind; with more words ("louage Sousse"), it searches those words among that kind.
 */
export interface PlaceIntent {
  kind: PlaceKind;
  /** The query without the kind and filler words; empty = "the nearest one". */
  rest: string;
}

/** Normalised keywords (normalizeSearchText form, Arabic without the article). */
const KIND_WORDS: Readonly<Record<string, PlaceKind>> = {
  louage: 'LOUAGE_STATION',
  louages: 'LOUAGE_STATION',
  louaj: 'LOUAGE_STATION',
  lwaj: 'LOUAGE_STATION',
  لواج: 'LOUAGE_STATION',
  لواجات: 'LOUAGE_STATION',
  bus: 'BUS_STATION',
  buses: 'BUS_STATION',
  autobus: 'BUS_STATION',
  routiere: 'BUS_STATION',
  حافله: 'BUS_STATION',
  حافلات: 'BUS_STATION',
  كار: 'BUS_STATION',
  كيران: 'BUS_STATION',
  car: 'BUS_STATION',
  cars: 'BUS_STATION',
  taxi: 'TAXI_STATION',
  taxis: 'TAXI_STATION',
  تاكسي: 'TAXI_STATION',
  تكسي: 'TAXI_STATION',
  airport: 'AIRPORT',
  aeroport: 'AIRPORT',
  مطار: 'AIRPORT',
};

/** Words that only say "a station / the nearest": dropped before deciding. */
const FILLER = new Set([
  'station',
  'stations',
  'gare',
  'stand',
  'rank',
  'stop',
  'arret',
  'de',
  'des',
  'du',
  'la',
  'le',
  'les',
  'the',
  'a',
  'nearest',
  'near',
  'closest',
  'me',
  'proche',
  'plus',
  'محطه',
  'محطات',
  'موقف',
  'اقرب',
  'قريب',
  'قريبه',
]);

/** Arabic words carry the article ("اللواج" → "لواج"); prefixed ones keep a 2-letter stem at least. */
function stem(word: string): string {
  return /^ال[؀-ۿ]{2,}/.test(word) ? word.slice(2) : word;
}

export function placeIntent(query: string): PlaceIntent | null {
  const words = normalizeSearchText(query).split(' ').filter(Boolean);
  let kind: PlaceKind | null = null;
  const rest: string[] = [];
  for (const word of words) {
    const s = stem(word);
    const k = KIND_WORDS[word] ?? KIND_WORDS[s];
    if (k && (kind === null || kind === k)) {
      kind = k;
    } else if (!FILLER.has(word) && !FILLER.has(s)) {
      rest.push(word);
    }
  }
  return kind ? { kind, rest: rest.join(' ') } : null;
}
