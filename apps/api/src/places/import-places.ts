import { placeSearchText } from '@fi-thnitek/domain';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Database } from '../db/client.js';
import { places } from '../db/schema/index.js';
import type { PlaceRecord } from './place-record.js';
import { point } from './places.service.js';

const BATCH = 500;

/**
 * Upserts a dataset by `source`. Rows an admin edited (`locked`) are left untouched, so re-importing a
 * refreshed OSM extract never overwrites a manual fix. Places that disappeared from the dataset are kept.
 */
export async function importPlaces(db: Database, records: readonly PlaceRecord[]): Promise<{ upserted: number }> {
  let upserted = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const rows = await db
      .insert(places)
      .values(
        records.slice(i, i + BATCH).map((r) => ({
          id: uuidv7(),
          kind: r.kind,
          nameAr: r.nameAr,
          nameFr: r.nameFr,
          aliases: r.aliases,
          location: point({ lat: r.lat, lng: r.lng }),
          governorateCode: r.governorateCode,
          popularity: r.popularity,
          source: r.source,
          searchText: placeSearchText([r.nameAr, r.nameFr, ...r.aliases]),
        })),
      )
      .onConflictDoUpdate({
        target: places.source,
        setWhere: sql`${places.locked} = false`,
        set: {
          kind: sql`excluded.kind`,
          nameAr: sql`excluded.name_ar`,
          nameFr: sql`excluded.name_fr`,
          aliases: sql`excluded.aliases`,
          location: sql`excluded.location`,
          governorateCode: sql`excluded.governorate_code`,
          popularity: sql`excluded.popularity`,
          searchText: sql`excluded.search_text`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: places.id });
    upserted += rows.length;
  }
  return { upserted };
}
