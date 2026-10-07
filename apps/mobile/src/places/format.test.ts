import { describe, expect, it } from 'vitest';
import { distanceParts, langOf, placeNames } from './format';

describe('placeNames', () => {
  const sousse = { nameAr: 'سوسة', nameFr: 'Sousse' };

  it('puts the UI language first and the other name as a hint', () => {
    expect(placeNames(sousse, 'ar')).toEqual({ name: 'سوسة', other: 'Sousse' });
    expect(placeNames(sousse, 'fr')).toEqual({ name: 'Sousse', other: 'سوسة' });
  });

  it('drops the hint when both names are the same', () => {
    expect(placeNames({ nameAr: 'TUN', nameFr: 'TUN' }, 'fr').other).toBeNull();
  });
});

describe('distanceParts', () => {
  it('rounds metres to 10 with a 10 m floor', () => {
    expect(distanceParts(3)).toEqual({ unit: 'meters', value: '10' });
    expect(distanceParts(244)).toEqual({ unit: 'meters', value: '240' });
  });

  it('uses km with one decimal under 10 km, whole km beyond', () => {
    expect(distanceParts(1250)).toEqual({ unit: 'kilometers', value: '1.3' });
    expect(distanceParts(23_400)).toEqual({ unit: 'kilometers', value: '23' });
  });
});

describe('langOf', () => {
  it('defaults to Arabic', () => {
    expect(langOf('fr-TN')).toBe('fr');
    expect(langOf('ar')).toBe('ar');
    expect(langOf(undefined)).toBe('ar');
    // English shows place names in their Latin (French) spelling.
    expect(langOf('en-GB')).toBe('fr');
  });
});
