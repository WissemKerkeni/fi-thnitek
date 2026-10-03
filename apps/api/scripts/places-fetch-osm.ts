/**
 * Builds data/places/tn-places.json from OpenStreetMap (ODbL) via the Overpass API.
 *   pnpm --filter @fi-thnitek/api places:fetch
 * Each place keeps its provenance (`osm:<type>/<id>`). Re-run to refresh; review the diff before committing.
 * Attribution: "© OpenStreetMap contributors" (shown on the map and in data/places/README.md).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type PlaceKind, placePopularity } from '@fi-thnitek/domain';
import type { PlaceRecord } from '../src/places/place-record.js';

const MIRRORS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const AREA = 'area["ISO3166-1"="TN"][admin_level=2]->.tn;';
const OUT = path.resolve(__dirname, '../../../data/places/tn-places.json');

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface Category {
  name: string;
  query: string;
  kind: (tags: Record<string, string>) => PlaceKind | null;
}

const isLouage = (t: Record<string, string>) =>
  /louage|لواج|اللواج/i.test(`${t.name ?? ''} ${t['name:fr'] ?? ''} ${t['name:ar'] ?? ''} ${t.description ?? ''}`);

const CATEGORIES: Category[] = [
  { name: 'governorates', query: 'relation["admin_level"="4"]["boundary"="administrative"](area.tn);', kind: () => 'GOVERNORATE' },
  { name: 'delegations', query: 'relation["admin_level"="5"]["boundary"="administrative"](area.tn);', kind: () => 'DELEGATION' },
  { name: 'cities', query: 'node["place"~"^(city|town)$"]["name"](area.tn);', kind: () => 'CITY' },
  { name: 'villages', query: 'node["place"="village"]["name"](area.tn);', kind: () => 'CITY' },
  {
    name: 'neighbourhoods',
    query: 'node["place"~"^(suburb|quarter|neighbourhood)$"]["name"](area.tn);',
    kind: () => 'NEIGHBOURHOOD',
  },
  {
    name: 'stations',
    // Louage stations are mapped either as bus stations or as named taxi ranks.
    query:
      'nwr["amenity"="bus_station"]["name"](area.tn); nwr["amenity"="taxi"]["name"~"louage|لواج",i](area.tn);',
    kind: (t) => (isLouage(t) ? 'LOUAGE_STATION' : 'BUS_STATION'),
  },
  { name: 'airports', query: 'nwr["aeroway"="aerodrome"]["iata"](area.tn);', kind: () => 'AIRPORT' },
  { name: 'landmarks', query: 'nwr["amenity"~"^(hospital|university)$"]["name"](area.tn);', kind: () => 'LANDMARK' },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function overpass(query: string): Promise<OsmElement[]> {
  const body = `data=${encodeURIComponent(`[out:json][timeout:180];${AREA}(${query});out tags center;`)}`;
  for (let attempt = 0; attempt < 9; attempt += 1) {
    const mirror = MIRRORS[attempt % MIRRORS.length]!;
    try {
      const res = await fetch(mirror, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'fi-thnitek-places/0.1' },
        signal: AbortSignal.timeout(240_000),
      });
      if (res.ok) {
        // A server-side timeout still answers 200, with a `remark` and partial (often empty) elements.
        const json = (await res.json()) as { elements: OsmElement[]; remark?: string };
        if (!json.remark) return json.elements;
        process.stdout.write(`  ${mirror} → ${json.remark.slice(0, 120)}, retrying\n`);
      } else {
        process.stdout.write(`  ${mirror} → HTTP ${res.status}, retrying\n`);
      }
    } catch (error) {
      process.stdout.write(`  ${mirror} → ${error instanceof Error ? error.message : String(error)}, retrying\n`);
    }
    await sleep(5_000 * (attempt + 1));
  }
  throw new Error('all Overpass mirrors failed');
}

const strip = (s: string | undefined) => s?.replace(/^(ولاية|معتمدية|Gouvernorat|Délégation)\s+/i, '').trim();

function toRecord(e: OsmElement, kind: PlaceKind): PlaceRecord | null {
  const t = e.tags ?? {};
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  if (lat === undefined || lng === undefined) return null;
  const nameAr = strip(t['name:ar']) ?? (/[؀-ۿ]/.test(t.name ?? '') ? strip(t.name) : undefined);
  const nameFr = strip(t['name:fr']) ?? strip(t['name:en']) ?? (/[A-Za-z]/.test(t.name ?? '') ? strip(t.name) : undefined);
  if (!nameAr && !nameFr) return null;
  const aliases = [t.name, t['name:en'], t['name:fr'], t['name:ar'], t.alt_name, t.old_name, t.short_name, t.official_name, t.iata]
    .flatMap((v) => (v ? v.split(';') : []))
    .map((v) => v.trim())
    .filter((v) => v && v !== nameAr && v !== nameFr);
  const population = Number.parseInt(t.population ?? '', 10);
  return {
    source: `osm:${e.type}/${e.id}`,
    kind,
    nameAr: nameAr ?? nameFr!,
    nameFr: nameFr ?? nameAr!,
    aliases: [...new Set(aliases)],
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    governorateCode: /^TN-\d{2}$/.test(t['ISO3166-2'] ?? '') ? t['ISO3166-2']! : null,
    popularity: placePopularity(kind, Number.isFinite(population) ? population : null),
  };
}

async function main(): Promise<void> {
  const places = new Map<string, PlaceRecord>();
  for (const category of CATEGORIES) {
    process.stdout.write(`${category.name}…\n`);
    const elements = await overpass(category.query);
    let kept = 0;
    for (const e of elements) {
      const kind = category.kind(e.tags ?? {});
      const record = kind && toRecord(e, kind);
      if (record && !places.has(record.source)) {
        places.set(record.source, record);
        kept += 1;
      }
    }
    process.stdout.write(`  ${elements.length} elements, ${kept} places\n`);
    await sleep(3_000);
  }
  mkdirSync(path.dirname(OUT), { recursive: true });
  const sorted = [...places.values()].sort((a, b) => a.source.localeCompare(b.source));
  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        source: 'OpenStreetMap via Overpass API',
        license: 'ODbL 1.0 — © OpenStreetMap contributors',
        generatedAt: new Date().toISOString(),
        count: sorted.length,
        places: sorted,
      },
      null,
      1,
    )}\n`,
  );
  process.stdout.write(`wrote ${sorted.length} places to ${OUT}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
