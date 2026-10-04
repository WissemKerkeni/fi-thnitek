import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../config/env.js';
import { importPlaces } from '../places/import-places.js';
import type { PlaceDataset } from '../places/place-record.js';
import { createDatabase, createPool } from './client.js';

/** `pnpm db:seed`: loads reference data. Idempotent; admin-edited places are kept (see importPlaces). */
async function seed(): Promise<void> {
  const env = loadEnv();
  const file = process.env.PLACES_FILE ?? path.resolve(__dirname, '../../../../data/places/tn-places.json');
  const dataset = JSON.parse(readFileSync(file, 'utf8')) as PlaceDataset;
  const pool = createPool(env.DATABASE_URL, 2);
  try {
    const { upserted } = await importPlaces(createDatabase(pool), dataset.places);
    process.stdout.write(`Places: ${upserted}/${dataset.count} upserted (${dataset.license})\n`);
  } finally {
    await pool.end();
  }
}

seed().catch((error: unknown) => {
  process.stderr.write(`Seed failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
