import { PLACE_KINDS } from '@fi-thnitek/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const placeKind = pgEnum('place_kind', PLACE_KINDS);

/** PostGIS geography point (WGS84). Read with ST_Y/ST_X, written with ST_MakePoint (see places.service). */
export const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType: () => 'geography(Point,4326)',
});

/**
 * docs/domain-model.md § Places (R-010). Public reference data: positions are not personal.
 * `search_text` = all names folded by normalizeSearchText (packages/domain), trigram-indexed.
 * `locked` rows were edited by an admin and are left alone by dataset re-imports.
 */
export const places = pgTable(
  'places',
  {
    id: uuid('id').primaryKey(),
    kind: placeKind('kind').notNull(),
    nameAr: text('name_ar').notNull(),
    nameFr: text('name_fr').notNull(),
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    location: geographyPoint('location').notNull(),
    parentId: uuid('parent_id'),
    governorateCode: text('governorate_code'),
    popularity: integer('popularity').notNull().default(0),
    source: text('source').notNull().unique(),
    searchText: text('search_text').notNull(),
    locked: boolean('locked').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('places_location_gist').using('gist', t.location),
    index('places_search_trgm').using('gin', sql`${t.searchText} gin_trgm_ops`),
    index('places_kind_idx').on(t.kind),
  ],
);
