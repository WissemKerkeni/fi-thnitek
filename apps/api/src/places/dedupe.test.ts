import { describe, expect, it } from 'vitest';
import { dedupePlaces } from './dedupe.js';
import type { PlaceRecord } from './place-record.js';

const rec = (
  source: string,
  nameFr: string,
  lat: number,
  kind: PlaceRecord['kind'] = 'LOUAGE_STATION',
): PlaceRecord => ({
  source,
  kind,
  nameAr: nameFr,
  nameFr,
  aliases: [],
  lat,
  lng: 10.19,
  governorateCode: null,
  popularity: 50,
});

describe('dedupePlaces', () => {
  it('merges the point and the area of one station (same kind and name, < 200 m)', () => {
    const out = dedupePlaces([
      rec('osm:way/2', 'Station Louage Moncef Bey', 36.7915),
      rec('osm:node/1', 'Station louage Moncef-Bey', 36.7916),
    ]);
    expect(out.map((r) => r.source)).toEqual(['osm:node/1']);
  });

  it('keeps same-named places that are far apart, and different kinds or names', () => {
    const out = dedupePlaces([
      rec('osm:node/1', 'Station de taxi', 36.8, 'TAXI_STATION'),
      rec('osm:node/2', 'Station de taxi', 36.81, 'TAXI_STATION'),
      rec('osm:node/3', 'Station de taxi', 36.8, 'BUS_STATION'),
      rec('osm:node/4', 'Bab Saadoun', 36.8),
    ]);
    expect(out).toHaveLength(4);
  });
});
