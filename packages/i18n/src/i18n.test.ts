import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, catalogs, isRtl, resolveLocale } from './index.js';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : keys(v as object, `${prefix}${k}.`),
  );
}

describe('catalogs', () => {
  it('ar, fr and en have exactly the same keys', () => {
    expect(keys(catalogs.ar).sort()).toEqual(keys(catalogs.fr).sort());
    expect(keys(catalogs.en).sort()).toEqual(keys(catalogs.fr).sort());
  });

  it('keeps the same {{placeholders}} in every language', () => {
    const placeholders = (catalog: object, key: string) => {
      const value = key.split('.').reduce<unknown>((o, p) => (o as never)[p], catalog) as string;
      return [...value.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort();
    };
    for (const key of keys(catalogs.fr)) {
      expect(placeholders(catalogs.en, key), key).toEqual(placeholders(catalogs.fr, key));
      expect(placeholders(catalogs.ar, key), key).toEqual(placeholders(catalogs.fr, key));
    }
  });

  it('has no empty translations', () => {
    for (const catalog of Object.values(catalogs)) {
      const values = keys(catalog).map((k) =>
        k.split('.').reduce<unknown>((o, p) => (o as never)[p], catalog),
      );
      expect(values.every((v) => typeof v === 'string' && v.trim().length > 0)).toBe(true);
    }
  });
});

describe('locale helpers', () => {
  it('defaults to Arabic', () => {
    expect(DEFAULT_LOCALE).toBe('ar');
    expect(resolveLocale(undefined)).toBe('ar');
    expect(resolveLocale('de-DE')).toBe('ar');
  });

  it('resolves regional tags', () => {
    expect(resolveLocale('fr-TN')).toBe('fr');
    expect(resolveLocale('ar_TN')).toBe('ar');
    expect(resolveLocale('en-GB')).toBe('en');
  });

  it('marks only Arabic as right-to-left', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('fr')).toBe(false);
    expect(isRtl('en')).toBe(false);
  });
});
