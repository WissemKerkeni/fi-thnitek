import { describe, expect, it } from 'vitest';
import { normalizeSearchText, placePopularity, placeSearchText } from './places.js';

describe('normalizeSearchText', () => {
  it('folds French case and accents', () => {
    expect(normalizeSearchText('Médenine')).toBe('medenine');
    expect(normalizeSearchText('KÉBILI')).toBe('kebili');
    expect(normalizeSearchText('  Sousse  ')).toBe('sousse');
  });

  it('joins words across dashes and apostrophes', () => {
    expect(normalizeSearchText('Ben-Arous')).toBe('ben arous');
    expect(normalizeSearchText("Bou'Salem")).toBe('bou salem');
  });

  it('folds Arabic spelling variants so users find places however they type', () => {
    // أ/إ/آ → ا
    expect(normalizeSearchText('أريانة')).toBe(normalizeSearchText('اريانه'));
    expect(normalizeSearchText('إبن')).toBe(normalizeSearchText('ابن'));
    // ة → ه and ى → ي
    expect(normalizeSearchText('سوسة')).toBe('سوسه');
    expect(normalizeSearchText('مستشفى')).toBe('مستشفي');
    // Diacritics and tatweel are ignored.
    expect(normalizeSearchText('تُونِس')).toBe('تونس');
    expect(normalizeSearchText('تـــونس')).toBe('تونس');
  });

  it('converts Arabic-Indic digits', () => {
    expect(normalizeSearchText('حي ١٥')).toBe('حي 15');
  });

  it('drops punctuation', () => {
    expect(normalizeSearchText('Tunis (centre)!')).toBe('tunis centre');
  });
});

describe('placeSearchText', () => {
  it('joins all names once', () => {
    expect(placeSearchText(['Sousse', 'سوسة', 'SOUSSE', null, 'Susa'])).toBe('sousse | سوسه | susa');
  });
});

describe('placePopularity', () => {
  it('ranks cities above landmarks and rewards population, capped at 100', () => {
    expect(placePopularity('CITY')).toBeGreaterThan(placePopularity('LANDMARK'));
    expect(placePopularity('CITY', 600_000)).toBeGreaterThan(placePopularity('CITY', 5_000));
    expect(placePopularity('CITY', 10_000_000)).toBeLessThanOrEqual(100);
  });
});
