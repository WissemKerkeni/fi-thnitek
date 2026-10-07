import { ar } from './ar.js';
import { en } from './en.js';
import { fr } from './fr.js';
import type { Catalog } from './types.js';

export type { Catalog, TranslationKey } from './types.js';

export const LOCALES = ['ar', 'fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Arabic first (docs/ux.md). */
export const DEFAULT_LOCALE: Locale = 'ar';

export const catalogs: Readonly<Record<Locale, Catalog>> = { ar, fr, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function isRtl(locale: Locale): boolean {
  return locale === 'ar';
}

/** Resolves a device language tag (e.g. `fr-TN`, `ar`) to a supported locale. */
export function resolveLocale(tag: string | null | undefined): Locale {
  const base = tag?.toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : DEFAULT_LOCALE;
}

/** i18next `resources` shape. */
export const resources = {
  ar: { translation: ar },
  fr: { translation: fr },
  en: { translation: en },
} as const;
