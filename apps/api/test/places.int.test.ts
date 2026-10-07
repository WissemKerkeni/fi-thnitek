import {
  AdminPlace,
  AdminPlaceList,
  NearestPlaceResponse,
  PlaceSearchResponse,
  ProblemDetails,
  SignInResponse,
} from '@fi-thnitek/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db/client.js';
import { importPlaces } from '../src/places/import-places.js';
import type { PlaceRecord } from '../src/places/place-record.js';
import { TEST_ADMIN_EMAIL, TEST_TERMS_VERSION, type TestApp, startTestApp } from './test-app.js';

let t: TestApp;
let admin: SignInResponse;
let user: SignInResponse;

const FIXTURES: PlaceRecord[] = [
  {
    source: 'osm:node/1',
    kind: 'CITY',
    nameAr: 'تونس',
    nameFr: 'Tunis',
    aliases: ['Tunis City'],
    lat: 36.8008,
    lng: 10.18,
    governorateCode: null,
    popularity: 100,
  },
  {
    source: 'osm:node/2',
    kind: 'LOUAGE_STATION',
    nameAr: 'محطة اللواج باب سعدون',
    nameFr: 'Station louage Bab Saadoun',
    aliases: [],
    lat: 36.8106,
    lng: 10.1629,
    governorateCode: null,
    popularity: 55,
  },
  {
    source: 'osm:node/3',
    kind: 'CITY',
    nameAr: 'سوسة',
    nameFr: 'Sousse',
    aliases: [],
    lat: 35.8256,
    lng: 10.6084,
    governorateCode: null,
    popularity: 90,
  },
  {
    source: 'osm:node/4',
    kind: 'CITY',
    nameAr: 'سيدي بو سعيد',
    nameFr: 'Sidi Bou Saïd',
    aliases: [],
    lat: 36.8687,
    lng: 10.3416,
    governorateCode: null,
    popularity: 60,
  },
  {
    source: 'osm:relation/5',
    kind: 'GOVERNORATE',
    nameAr: 'سوسة',
    nameFr: 'Sousse',
    aliases: [],
    lat: 35.9,
    lng: 10.5,
    governorateCode: 'TN-51',
    popularity: 30,
  },
  {
    source: 'osm:way/6',
    kind: 'AIRPORT',
    nameAr: 'مطار تونس قرطاج الدولي',
    nameFr: 'Aéroport international de Tunis-Carthage',
    aliases: ['TUN'],
    lat: 36.851,
    lng: 10.2272,
    governorateCode: null,
    popularity: 55,
  },
  // ADR-224: stations around central Tunis for "the nearest station" searches.
  ...(
    [
      [
        'osm:node/10',
        'LOUAGE_STATION',
        'محطة لواج المنصف باي',
        'Station louage Moncef Bey',
        36.7915,
        10.1937,
      ],
      ['osm:node/11', 'LOUAGE_STATION', 'محطة لواج سوسة', 'Station louage Sousse', 35.8301, 10.6352],
      ['osm:node/12', 'TAXI_STATION', 'محطة تاكسي', 'Station de taxi', 36.8002, 10.1812],
      ['osm:node/13', 'TAXI_STATION', 'محطة تاكسي', 'Station de taxi', 36.8102, 10.1812],
      ['osm:node/14', 'BUS_STATION', 'محطة باب عليوة', 'Gare routière Bab Alioua', 36.7896, 10.1803],
    ] as const
  ).map(([source, kind, nameAr, nameFr, lat, lng]) => ({
    source,
    kind,
    nameAr,
    nameFr,
    aliases: [],
    lat,
    lng,
    governorateCode: null,
    popularity: 40,
  })),
];

beforeAll(async () => {
  t = await startTestApp();
  admin = await signIn('admin-places', TEST_ADMIN_EMAIL);
  user = await signIn('passenger-places', 'passenger@example.tn');
  await importPlaces(createDatabase(t.pool), FIXTURES);
});

afterAll(async () => {
  await t?.close();
});

const bearer = (s: SignInResponse) => ({ Authorization: `Bearer ${s.accessToken}` });

async function signIn(sub: string, email: string): Promise<SignInResponse> {
  const idToken = await t.googleToken({ sub, email });
  const res = await request(t.server()).post('/v1/auth/google').send({ idToken }).expect(200);
  const s = SignInResponse.parse(res.body);
  await request(t.server())
    .patch('/v1/me')
    .set(bearer(s))
    .send({ displayName: 'Amel', acceptTermsVersion: TEST_TERMS_VERSION })
    .expect(200);
  return s;
}

async function search(body: object) {
  const res = await request(t.server()).post('/v1/places/search').set(bearer(user)).send(body).expect(200);
  return PlaceSearchResponse.parse(res.body).places;
}

async function searchFull(body: object) {
  const res = await request(t.server()).post('/v1/places/search').set(bearer(user)).send(body).expect(200);
  return PlaceSearchResponse.parse(res.body);
}

/** Central Tunis, next to the first taxi rank. */
const HERE = { lat: 36.8, lng: 10.181 };

describe('place search (R-011)', () => {
  it('requires a signed-in user', async () => {
    await request(t.server()).post('/v1/places/search').send({ q: 'tunis' }).expect(401);
  });

  it('matches French names without accents or case', async () => {
    const places = await search({ q: 'SIDI BOU SAID' });
    expect(places[0]?.nameFr).toBe('Sidi Bou Saïd');
  });

  it('matches Arabic with or without the article and hamza variants', async () => {
    expect((await search({ q: 'لواج' }))[0]?.nameFr).toBe('Station louage Bab Saadoun');
    expect((await search({ q: 'سوسه' })).map((p) => p.nameFr)).toContain('Sousse');
  });

  it('tolerates a typo through trigram similarity', async () => {
    expect((await search({ q: 'Sousa' })).map((p) => p.nameFr)).toContain('Sousse');
  });

  it('finds airports by IATA alias', async () => {
    expect((await search({ q: 'tun' })).map((p) => p.kind)).toContain('AIRPORT');
  });

  it('ranks the more popular place first and filters by kind', async () => {
    const all = await search({ q: 'sousse' });
    // The town first, then the louage station named after it, then the governorate (least popular).
    expect(all.map((p) => p.kind)).toEqual(['CITY', 'LOUAGE_STATION', 'GOVERNORATE']);
    const govs = await search({ q: 'sousse', kinds: ['GOVERNORATE'] });
    expect(govs).toHaveLength(1);
    expect(govs[0]?.governorateCode).toBe('TN-51');
  });

  it('returns coordinates as lat/lng', async () => {
    const [tunis] = await search({ q: 'tunis', kinds: ['CITY'] });
    expect(tunis?.location.lat).toBeCloseTo(36.8008, 4);
    expect(tunis?.location.lng).toBeCloseTo(10.18, 4);
  });

  it('honours the limit and rejects bad input', async () => {
    expect(await search({ q: 'a', limit: 1 })).toHaveLength(1);
    const res = await request(t.server())
      .post('/v1/places/search')
      .set(bearer(user))
      .send({ q: '' })
      .expect(400);
    expect(ProblemDetails.parse(res.body).code).toBe('VALIDATION_FAILED');
  });

  it('does not accept the query in the URL', async () => {
    await request(t.server()).get('/v1/places/search?q=tunis').set(bearer(user)).expect(404);
  });
});

describe('nearest stations by kind (ADR-224)', () => {
  it('answers "station louage" with the nearest louage stations first, with distances', async () => {
    const r = await searchFull({ q: 'station louage', near: HERE });
    expect(r.nearestKind).toBe('LOUAGE_STATION');
    expect(r.places.map((p) => p.nameFr)).toEqual([
      'Station louage Moncef Bey',
      'Station louage Bab Saadoun',
      'Station louage Sousse',
    ]);
    const d = r.places.map((p) => p.distanceM!);
    expect(d[0]).toBeGreaterThan(1_000);
    expect(d[0]).toBeLessThan(2_000);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });

  it('understands Arabic and English, and taxi ranks', async () => {
    const taxis = await searchFull({ q: 'أقرب محطة تاكسي', near: HERE });
    expect(taxis.nearestKind).toBe('TAXI_STATION');
    expect(taxis.places.map((p) => p.kind)).toEqual(['TAXI_STATION', 'TAXI_STATION']);
    expect(taxis.places[0]!.distanceM).toBeLessThan(100);
    const bus = await searchFull({ q: 'bus station', near: HERE });
    expect(bus.places[0]).toMatchObject({ nameFr: 'Gare routière Bab Alioua', kind: 'BUS_STATION' });
  });

  it('searches the other words among that kind ("louage sousse")', async () => {
    const r = await searchFull({ q: 'louage sousse', near: HERE });
    expect(r.nearestKind).toBeNull();
    expect(r.places.map((p) => p.nameFr)).toEqual(['Station louage Sousse']);
  });

  it('gives distances for ordinary searches too, and none without a position', async () => {
    const withPos = await searchFull({ q: 'sousse', near: HERE });
    expect(withPos.places[0]!.distanceM).toBeGreaterThan(100_000);
    const without = await searchFull({ q: 'station louage' });
    expect(without.nearestKind).toBeNull();
    expect(without.places.every((p) => p.distanceM === null)).toBe(true);
    expect(without.places.every((p) => p.kind === 'LOUAGE_STATION')).toBe(true);
  });

  it('keeps a picker restricted to other kinds on the plain search', async () => {
    const r = await searchFull({ q: 'louage', near: HERE, kinds: ['CITY'] });
    expect(r.nearestKind).toBeNull();
    expect(r.places.every((p) => p.kind === 'CITY')).toBe(true);
  });
});

describe('nearest place (pick on map)', () => {
  const nearest = async (body: object) =>
    NearestPlaceResponse.parse(
      (await request(t.server()).post('/v1/places/nearest').set(bearer(user)).send(body).expect(200)).body,
    );

  it('names a pin after the closest place, skipping governorates', async () => {
    const res = await nearest({ point: { lat: 36.811, lng: 10.163 } });
    expect(res.place?.nameFr).toBe('Station louage Bab Saadoun');
    expect(res.distanceM).toBeLessThan(100);
  });

  it('returns null when nothing is within range', async () => {
    expect(await nearest({ point: { lat: 33.0, lng: 9.0 }, maxDistanceM: 1000 })).toEqual({
      place: null,
      distanceM: null,
    });
  });
});

describe('admin places (Content → Places)', () => {
  it('is admin-only', async () => {
    await request(t.server()).get('/v1/admin/places').set(bearer(user)).expect(403);
  });

  it('lists with search and paging', async () => {
    const res = await request(t.server())
      .get('/v1/admin/places?q=sousse&page=1&pageSize=1')
      .set(bearer(admin))
      .expect(200);
    const list = AdminPlaceList.parse(res.body);
    expect(list.total).toBe(3);
    expect(list.places).toHaveLength(1);
    expect(list.places[0]?.source).toBe('osm:node/3');
  });

  it('creates, edits (locking against re-import) and deletes, all audited', async () => {
    const created = AdminPlace.parse(
      (
        await request(t.server())
          .post('/v1/admin/places')
          .set(bearer(admin))
          .send({
            kind: 'LOUAGE_STATION',
            nameAr: 'محطة لواج المنصف باي',
            nameFr: 'Station Moncef Bey',
            location: { lat: 36.79, lng: 10.19 },
          })
          .expect(201)
      ).body,
    );
    expect(created.source).toBe(`admin:${created.id}`);
    expect(created.popularity).toBeGreaterThan(0);
    expect((await search({ q: 'moncef bey' }))[0]?.id).toBe(created.id);

    // Edit an imported row, then re-import the dataset: the admin fix survives.
    const [sousse] = await search({ q: 'sousse', kinds: ['CITY'] });
    await request(t.server())
      .put(`/v1/admin/places/${sousse!.id}`)
      .set(bearer(admin))
      .send({
        kind: 'CITY',
        nameAr: 'سوسة',
        nameFr: 'Sousse (centre)',
        aliases: ['Soussa'],
        location: { lat: 35.8256, lng: 10.6084 },
        governorateCode: 'TN-51',
      })
      .expect(200);
    await importPlaces(createDatabase(t.pool), FIXTURES);
    expect((await search({ q: 'soussa' }))[0]?.nameFr).toBe('Sousse (centre)');

    await request(t.server()).delete(`/v1/admin/places/${created.id}`).set(bearer(admin)).expect(204);
    await request(t.server()).delete(`/v1/admin/places/${created.id}`).set(bearer(admin)).expect(404);

    const { rows } = await t.pool.query<{ action: string }>(
      `SELECT action FROM audit.audit_logs WHERE target_type = 'place' ORDER BY created_at`,
    );
    expect(rows.map((r) => r.action)).toEqual(['place.create', 'place.update', 'place.delete']);
  });

  it('validates the input', async () => {
    const res = await request(t.server())
      .post('/v1/admin/places')
      .set(bearer(admin))
      .send({ kind: 'CITY', nameAr: 'x', nameFr: 'x', location: { lat: 99, lng: 0 } })
      .expect(400);
    expect(ProblemDetails.parse(res.body).code).toBe('VALIDATION_FAILED');
  });
});
