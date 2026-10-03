import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  AdminPlace,
  AdminPlaceList,
  LatLng,
  NearestPlaceResponse,
  Place,
  PlaceInput,
  PlaceKind,
} from '@fi-thnitek/contracts';
import {
  PLACE_SEARCH_MIN_SIMILARITY,
  normalizeSearchText,
  placePopularity,
  placeSearchText,
} from '@fi-thnitek/domain';
import type { z } from 'zod';
import { type SQL, and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/api-exception.js';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { places } from '../db/schema/index.js';

export const point = (p: LatLng): SQL => sql`ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography`;

/** Columns every response needs, with the position read back as lat/lng. */
const placeColumns = {
  id: places.id,
  kind: places.kind,
  nameAr: places.nameAr,
  nameFr: places.nameFr,
  governorateCode: places.governorateCode,
  lat: sql<number>`ST_Y(${places.location}::geometry)`,
  lng: sql<number>`ST_X(${places.location}::geometry)`,
};

interface PlaceRow {
  id: string;
  kind: PlaceKind;
  nameAr: string;
  nameFr: string;
  governorateCode: string | null;
  lat: number;
  lng: number;
}

const toPlace = (r: PlaceRow): Place => ({
  id: r.id,
  kind: r.kind,
  nameAr: r.nameAr,
  nameFr: r.nameFr,
  governorateCode: r.governorateCode,
  location: { lat: Number(r.lat), lng: Number(r.lng) },
});

@Injectable()
export class PlacesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /**
   * R-011. Ranking = how well the folded query matches (trigram word similarity, substring) + popularity,
   * minus a distance penalty when `near` is given. `near` is used only in this query.
   */
  async search(q: string, opts: { near?: LatLng; kinds?: PlaceKind[]; limit: number }): Promise<Place[]> {
    const needle = normalizeSearchText(q);
    if (!needle) return [];
    const like = `%${needle.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const match = sql`GREATEST(word_similarity(${needle}, ${places.searchText}), CASE WHEN ${places.searchText} LIKE ${like} THEN 0.9 ELSE 0 END)`;
    const distanceKm = opts.near ? sql`ST_Distance(${places.location}, ${point(opts.near)}) / 1000` : sql`0`;
    const score = sql`${match} * 100 + ${places.popularity} * 0.3 - LEAST(${distanceKm} / 10, 30)`;

    // SET LOCAL keeps the threshold to this transaction while `<%` still uses the trigram index.
    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql.raw(`SET LOCAL pg_trgm.word_similarity_threshold = ${Number(PLACE_SEARCH_MIN_SIMILARITY)}`),
      );
      return tx
        .select(placeColumns)
        .from(places)
        .where(
          and(
            sql`(${places.searchText} LIKE ${like} OR ${needle} <% ${places.searchText})`,
            opts.kinds?.length ? inArray(places.kind, opts.kinds) : undefined,
          ),
        )
        .orderBy(desc(score), asc(places.nameFr))
        .limit(opts.limit);
    });
    return rows.map(toPlace);
  }

  /** "Pick on map": the closest place to a dropped pin (KNN on the GiST index), within maxDistanceM. */
  async nearest(at: LatLng, maxDistanceM: number): Promise<NearestPlaceResponse> {
    const [row] = await this.db
      .select({ ...placeColumns, distanceM: sql<number>`ST_Distance(${places.location}, ${point(at)})` })
      .from(places)
      .where(
        and(
          sql`ST_DWithin(${places.location}, ${point(at)}, ${maxDistanceM})`,
          inArray(places.kind, ['CITY', 'NEIGHBOURHOOD', 'LOUAGE_STATION', 'BUS_STATION', 'AIRPORT', 'LANDMARK']),
        ),
      )
      .orderBy(sql`${places.location} <-> ${point(at)}`)
      .limit(1);
    if (!row) return { place: null, distanceM: null };
    return { place: toPlace(row), distanceM: Math.round(Number(row.distanceM)) };
  }

  // ---------- Admin ----------

  async adminList(q: string | undefined, page: number, pageSize: number): Promise<AdminPlaceList> {
    const needle = q ? normalizeSearchText(q) : '';
    const where = needle ? sql`${places.searchText} LIKE ${`%${needle}%`}` : undefined;
    const [rows, [count]] = await Promise.all([
      this.db
        .select({ ...placeColumns, aliases: places.aliases, popularity: places.popularity, source: places.source })
        .from(places)
        .where(where)
        .orderBy(desc(places.popularity), asc(places.nameFr))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ n: sql<number>`count(*)::int` }).from(places).where(where),
    ]);
    return {
      places: rows.map((r) => ({
        ...toPlace(r),
        aliases: r.aliases,
        popularity: r.popularity,
        source: r.source,
      })),
      total: count?.n ?? 0,
    };
  }

  async create(input: z.output<typeof PlaceInput>, adminId: string): Promise<AdminPlace> {
    const id = uuidv7();
    await this.db.transaction(async (tx) => {
      await tx.insert(places).values({
        id,
        ...this.columnsFrom(input),
        source: `admin:${id}`,
        locked: true,
      });
      await this.audit.record(
        { actorType: 'ADMIN', actorUserId: adminId, action: 'place.create', targetType: 'place', targetId: id },
        tx,
      );
    });
    return this.adminGet(id);
  }

  async update(id: string, input: z.output<typeof PlaceInput>, adminId: string): Promise<AdminPlace> {
    await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(places)
        .set({ ...this.columnsFrom(input), locked: true, updatedAt: new Date() })
        .where(eq(places.id, id))
        .returning({ id: places.id });
      if (updated.length !== 1) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
      await this.audit.record(
        { actorType: 'ADMIN', actorUserId: adminId, action: 'place.update', targetType: 'place', targetId: id },
        tx,
      );
    });
    return this.adminGet(id);
  }

  async remove(id: string, adminId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const deleted = await tx.delete(places).where(eq(places.id, id)).returning({ source: places.source });
      if (deleted.length !== 1) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorUserId: adminId,
          action: 'place.delete',
          targetType: 'place',
          targetId: id,
          metadata: { source: deleted[0]!.source },
        },
        tx,
      );
    });
  }

  private async adminGet(id: string): Promise<AdminPlace> {
    const [r] = await this.db
      .select({ ...placeColumns, aliases: places.aliases, popularity: places.popularity, source: places.source })
      .from(places)
      .where(eq(places.id, id));
    if (!r) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
    return { ...toPlace(r), aliases: r.aliases, popularity: r.popularity, source: r.source };
  }

  private columnsFrom(input: z.output<typeof PlaceInput>) {
    return {
      kind: input.kind,
      nameAr: input.nameAr,
      nameFr: input.nameFr,
      aliases: input.aliases,
      location: point(input.location),
      governorateCode: input.governorateCode ?? null,
      popularity: input.popularity ?? placePopularity(input.kind),
      searchText: placeSearchText([input.nameAr, input.nameFr, ...input.aliases]),
    };
  }
}
