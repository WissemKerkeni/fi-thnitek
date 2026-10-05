import { describe, expect, it } from 'vitest';
import { placeIntent } from './intent.js';

describe('placeIntent (ADR-224)', () => {
  it.each([
    ['station louage', 'LOUAGE_STATION'],
    ['Station Louage', 'LOUAGE_STATION'],
    ['louage', 'LOUAGE_STATION'],
    ['louaj', 'LOUAGE_STATION'],
    ['محطة اللواج', 'LOUAGE_STATION'],
    ['لواج', 'LOUAGE_STATION'],
    ['gare routière', 'BUS_STATION'],
    ['bus station', 'BUS_STATION'],
    ['station de bus', 'BUS_STATION'],
    ['محطة الحافلات', 'BUS_STATION'],
    ['الكار', 'BUS_STATION'],
    ['taxi', 'TAXI_STATION'],
    ['station taxi', 'TAXI_STATION'],
    ['nearest taxi stand', 'TAXI_STATION'],
    ['محطة تاكسي', 'TAXI_STATION'],
    ['أقرب محطة تاكسي', 'TAXI_STATION'],
    ['aéroport', 'AIRPORT'],
    ['مطار', 'AIRPORT'],
  ] as const)('"%s" asks for the nearest %s', (query, kind) => {
    expect(placeIntent(query)).toEqual({ kind, rest: '' });
  });

  it('understands the quick-search chip labels of every language', () => {
    for (const [label, kind] of [
      ['Station louage', 'LOUAGE_STATION'],
      ['Gare routière', 'BUS_STATION'],
      ['Station taxi', 'TAXI_STATION'],
      ['محطة لواج', 'LOUAGE_STATION'],
      ['محطة كيران', 'BUS_STATION'],
      ['محطة تاكسي', 'TAXI_STATION'],
      ['Louage station', 'LOUAGE_STATION'],
      ['Bus station', 'BUS_STATION'],
      ['Taxi rank', 'TAXI_STATION'],
    ] as const) {
      expect(placeIntent(label), label).toEqual({ kind, rest: '' });
    }
  });

  it('keeps the other words for a search among that kind', () => {
    expect(placeIntent('louage Sousse')).toEqual({ kind: 'LOUAGE_STATION', rest: 'sousse' });
    expect(placeIntent('station louage de Bab Saadoun')).toEqual({
      kind: 'LOUAGE_STATION',
      rest: 'bab saadoun',
    });
    expect(placeIntent('محطة لواج سوسة')).toEqual({ kind: 'LOUAGE_STATION', rest: 'سوسه' });
  });

  it('is not an intent for a plain name, or for "station" alone', () => {
    expect(placeIntent('Sousse')).toBeNull();
    expect(placeIntent('station')).toBeNull();
    expect(placeIntent('Bab Saadoun')).toBeNull();
    // A name that merely contains the letters is not a keyword.
    expect(placeIntent('Busra')).toBeNull();
    expect(placeIntent('الالواج')).toBeNull();
  });
});
