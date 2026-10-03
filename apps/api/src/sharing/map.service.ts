import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { BBox, MapDriversResponse } from '@fi-thnitek/contracts';
import { type Thresholds, driverMarker, isMapSpanTooWide, liveMapAccess } from '@fi-thnitek/domain';
import { and, between, eq, gte, isNull, ne } from 'drizzle-orm';
import { ApiException } from '../common/api-exception.js';
import { THRESHOLDS } from '../config/thresholds.provider.js';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import {
  driverLiveLocations,
  driverProfiles,
  places,
  sharingSessions,
  users,
  vehicles,
} from '../db/schema/index.js';

/** A hard cap per poll; beyond it the map shows the first ones (clustering arrives with Phase 7). */
const MAX_MARKERS = 300;

/** The live map's driver layer (R-020…R-022, R-025, R-026). Polled; nothing about the viewer is stored. */
@Injectable()
export class MapService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(THRESHOLDS) private readonly t: Thresholds,
  ) {}

  async drivers(viewerId: string, bbox: BBox, now = new Date()): Promise<MapDriversResponse> {
    await this.assertAccess(viewerId, now);
    if (isMapSpanTooWide(bbox, this.t)) return { drivers: [], tooWide: true };

    const freshSince = new Date(now.getTime() - this.t.driver_fresh_s * 1000);
    const rows = await this.db
      .select({
        sessionId: sharingSessions.id,
        type: sharingSessions.transportType,
        lat: driverLiveLocations.lat,
        lng: driverLiveLocations.lng,
        headingDeg: driverLiveLocations.headingDeg,
        fixTs: driverLiveLocations.fixTs,
        displayName: users.displayName,
        legalFirstName: driverProfiles.legalFirstName,
        isFull: sharingSessions.isFull,
        lineLabel: sharingSessions.lineLabel,
        plateDisplay: vehicles.plateDisplay,
        headingNameAr: places.nameAr,
        headingNameFr: places.nameFr,
      })
      .from(driverLiveLocations)
      .innerJoin(sharingSessions, eq(sharingSessions.id, driverLiveLocations.sessionId))
      .innerJoin(driverProfiles, eq(driverProfiles.userId, driverLiveLocations.driverUserId))
      .innerJoin(users, eq(users.id, driverLiveLocations.driverUserId))
      .innerJoin(vehicles, eq(vehicles.id, sharingSessions.vehicleId))
      .leftJoin(places, eq(places.id, sharingSessions.headingToPlaceId))
      .where(
        and(
          eq(sharingSessions.state, 'SHARING'),
          isNull(sharingSessions.endedAt),
          eq(users.status, 'ACTIVE'),
          gte(driverLiveLocations.fixTs, freshSince),
          between(driverLiveLocations.lat, bbox.south, bbox.north),
          between(driverLiveLocations.lng, bbox.west, bbox.east),
          ne(driverLiveLocations.driverUserId, viewerId),
        ),
      )
      .limit(MAX_MARKERS);

    return {
      tooWide: false,
      drivers: rows.map((r) =>
        driverMarker(
          {
            ...r,
            fixTs: r.fixTs.getTime(),
            headingTo:
              r.headingNameAr !== null && r.headingNameFr !== null
                ? { nameAr: r.headingNameAr, nameFr: r.headingNameFr }
                : null,
          },
          now.getTime(),
        ),
      ),
    };
  }

  /** Invariant 4: driver accounts need an active, fresh, non-break session → else 403 SHARING_REQUIRED. */
  private async assertAccess(viewerId: string, now: Date): Promise<void> {
    const [viewer] = await this.db
      .select({
        verification: driverProfiles.status,
        state: sharingSessions.state,
        lastFixAt: sharingSessions.lastFixAt,
      })
      .from(driverProfiles)
      .leftJoin(
        sharingSessions,
        and(eq(sharingSessions.driverUserId, driverProfiles.userId), isNull(sharingSessions.endedAt)),
      )
      .where(eq(driverProfiles.userId, viewerId));
    const session =
      viewer?.state && viewer.state !== 'ENDED'
        ? { state: viewer.state, lastFixTs: viewer.lastFixAt?.getTime() ?? null }
        : null;
    const access = liveMapAccess(
      { verification: viewer?.verification ?? null, session },
      now.getTime(),
      this.t,
    );
    if (access === 'SHARING_REQUIRED') throw new ApiException('SHARING_REQUIRED', HttpStatus.FORBIDDEN);
  }
}
