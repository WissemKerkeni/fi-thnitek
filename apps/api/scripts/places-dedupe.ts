/**
 * Applies `dedupePlaces` to data/places/tn-places.json in place (no network), e.g. after changing the
 * rule. `places:fetch` already runs it before writing.
 *   node --import tsx scripts/places-dedupe.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { dedupePlaces } from '../src/places/dedupe.js';
import type { PlaceDataset } from '../src/places/place-record.js';

const FILE = path.resolve(__dirname, '../../../data/places/tn-places.json');
const data = JSON.parse(readFileSync(FILE, 'utf8')) as PlaceDataset;
const places = dedupePlaces(data.places);
const removed = data.places.filter((p) => !places.includes(p)).map((p) => p.source);
writeFileSync(FILE, `${JSON.stringify({ ...data, count: places.length, places }, null, 1)}\n`);
process.stdout.write(`${data.places.length} → ${places.length} places\n${removed.join('\n')}\n`);
