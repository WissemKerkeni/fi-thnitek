import type { fr } from './fr.js';

type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** Every catalog must have exactly the French key shape. */
export type Catalog = Widen<typeof fr>;

type Paths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Paths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Dot-path translation keys, e.g. `'health.title'`. */
export type TranslationKey = Paths<Catalog>;
