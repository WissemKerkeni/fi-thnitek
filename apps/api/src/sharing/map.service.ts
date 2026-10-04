import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  BBox,
  FinderDeparture,
  FinderDriver,
  FinderRequest,
  FinderResponse,
  MapDriver,
  MapView,
} from '@fi-thnitek/contracts';
import {
  type ClusterKind,
  type SharingDriverPosition,
  type Thresholds,
  type Viewer,
  clusterPoints,
  distanceM,
  driverMarker,
  finderGroup,
  finderOrder,
  isMapSpanTooWide,
  liveMapAccess,
  nextOccurrence,
  passengerMarker,
  routineMatches,
} from '@fi-thnitek/domain';
import { type SQL, and, between, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import { ApiException } from '../common/api-exception.js';
import { THRESHOLDS } from '../config/thresholds.provider.js';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import {
  driverLiveLocations,
  driverProfiles,
  driverRoutines,
  passengerRequests,
  places,
  sharingSessions,
  users,
  vehicles,
} from '../db/schema/index.js';
import { point } from '../places/places.service.js';
import { RoutinesService, scheduleOf } from '../routines/routines.service.js';

/** Hard caps per poll (pilot scale, docs/architecture.md §8). */
const MAX_MARKERS = 300;
const MAX_CLUSTERED = 5_000;
/** Drivers this far outside the visible area still count as "closer drivers" for a visible passenger. */
const CLOSER_MARGIN_DEG = 0.1;

const headingOf = (ar: string | null, fr: string | null) =>
  ar !== null && fr !== null ? { nameAr: ar, nameFr: fr } : null;

/**
 * The live map and the destination finder (R-020…R-027, R-045). Per-viewer serialisation is the pure
 * `passengerMarker` of packages/domain; nothing about the viewer is stored.
 */
@Injectable()
export class MapService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(THRESHOLDS) private readonly t: Thresholds,
    private readonly routines: RoutinesService,
  ) {}

  async view(viewerId: string, bbox: BBox, now = new Date()): Promise<MapView> {
    const viewer = await this.viewerOf(viewerId, now);

    if (isMapSpanTooWide(bbox, this.t)) {
      const drivers = await this.liveDrivers(this.inBox(bbox), now, MAX_CLUSTERED);
      const requests = await this.openRequests(bbox, MAX_CLUSTERED);
      const points: { lat: number; lng: number; kind: ClusterKind }[] = [
        ...drivers.map((d) => ({ lat: d.lat, lng: d.lng, kind: d.type })),
        ...requests.map((r) => ({ lat: r.anchorLat!, lng: r.anchorLng!, kind: 'PASSENGER' as const })),
      ];
      return { clustered: true, drivers: [], passengers: [], clusters: clusterPoints(points, bbox, this.t) };
    }

    const margin = {
      south: bbox.south - CLOSER_MARGIN_DEG,
      west: bbox.west - CLOSER_MARGIN_DEG,
      north: bbox.north + CLOSER_MARGIN_DEG,
      east: bbox.east + CLOSER_MARGIN_DEG,
    };
    const around = await this.liveDrivers(this.inBox(margin), now, MAX_MARKERS * 2);
    const visible = around
      .filter((d) => d.lat >= bbox.south && d.lat <= bbox.north && d.lng >= bbox.west && d.lng <= bbox.east)
      .filter((d) => d.driverUserId !== viewerId)
      .slice(0, MAX_MARKERS);
    const sharing: SharingDriverPosition[] = around.map((d) => ({
      userId: d.driverUserId,
      type: d.type,
      isFull: d.isFull,
      position: { lat: d.lat, lng: d.lng },
    }));

    const requests = await this.openRequests(bbox, MAX_MARKERS);
    return {
      clustered: false,
      drivers: await this.markers(visible, now),
      passengers: requests.flatMap((r) => {
        const marker = passengerMarker(
          {
            id: r.id,
            passengerUserId: r.passengerUserId,
            types: r.types,
            anchor: { lat: r.anchorLat!, lng: r.anchorLng! },
            destination: headingOf(r.destNameAr, r.destNameFr),
            seats: r.seats,
            visibleAt: r.visibleAt ?? r.createdAt,
            showIdentity: r.showIdentity,
            name: r.passengerName,
            note: r.note,
          },
          viewer,
          sharing,
          now,
          this.t,
        );
        return marker ? [marker] : [];
      }),
      clusters: [],
    };
  }

  /** R-045 / docs/architecture.md §5.2: who goes to the destination now, taxis nearby, scheduled departures. */
  async finder(
    viewerId: string,
    req: z.output<typeof FinderRequest>,
    now = new Date(),
  ): Promise<FinderResponse> {
    await this.viewerOf(viewerId, now);
    const destination = req.destination.point;
    const origin = req.near;
    const radius = Math.max(this.t.finder_radius_taxi_m, this.t.finder_radius_intercity_m);
    const live = await this.liveDrivers(
      origin ? sql`ST_DWithin(${driverLiveLocations.point}, ${point(origin)}, ${radius})` : undefined,
      now,
      MAX_MARKERS,
    );
    const markers = new Map((await this.markers(live, now)).map((m) => [m.id, m]));

    const headingThere: FinderDriver[] = [];
    const taxisNearby: FinderDriver[] = [];
    for (const d of live) {
      if (d.driverUserId === viewerId) continue;
      const group = finderGroup(
        {
          type: d.type,
          position: { lat: d.lat, lng: d.lng },
          headingTo:
            d.headingLat !== null && d.headingLng !== null ? { lat: d.headingLat, lng: d.headingLng } : null,
          isFull: d.isFull,
        },
        destination,
        origin,
        this.t,
      );
      if (!group) continue;
      const entry = {
        ...markers.get(d.sessionId)!,
        distanceM: origin ? Math.round(distanceM(origin, d)) : null,
      };
      (group === 'HEADING_THERE' ? headingThere : taxisNearby).push(entry);
    }

    return {
      headingThere: headingThere.sort(finderOrder),
      taxisNearby: taxisNearby.sort(finderOrder),
      scheduled: await this.scheduled(destination, origin, now),
    };
  }

  /** R-045(c): live routine routes ending near the destination, by next departure (7 days). */
  private async scheduled(
    destination: { lat: number; lng: number },
    origin: { lat: number; lng: number } | null,
    now: Date,
  ): Promise<FinderDeparture[]> {
    const fromPlace = alias(places, 'from_place');
    const rows = await this.db
      .select({
        routine: driverRoutines,
        displayName: users.displayName,
        legalFirstName: driverProfiles.legalFirstName,
        plateDisplay: vehicles.plateDisplay,
        toNameAr: places.nameAr,
        toNameFr: places.nameFr,
        toLat: sql<number>`ST_Y(${places.location}::geometry)`,
        toLng: sql<number>`ST_X(${places.location}::geometry)`,
        fromNameAr: fromPlace.nameAr,
        fromNameFr: fromPlace.nameFr,
        fromLat: sql<number>`ST_Y(${fromPlace.location}::geometry)`,
        fromLng: sql<number>`ST_X(${fromPlace.location}::geometry)`,
      })
      .from(driverRoutines)
      .innerJoin(places, eq(places.id, driverRoutines.toPlaceId))
      .innerJoin(fromPlace, eq(fromPlace.id, driverRoutines.fromPlaceId))
      .innerJoin(driverProfiles, eq(driverProfiles.userId, driverRoutines.driverUserId))
      .innerJoin(users, eq(users.id, driverRoutines.driverUserId))
      .innerJoin(vehicles, eq(vehicles.driverUserId, driverRoutines.driverUserId))
      .where(
        and(
          eq(driverRoutines.active, true),
          isNull(driverRoutines.hiddenAt),
          eq(driverProfiles.status, 'VERIFIED'),
          eq(users.status, 'ACTIVE'),
          sql`ST_DWithin(${places.location}, ${point(destination)}, ${this.t.finder_routine_m})`,
        ),
      )
      .limit(200);

    const out: FinderDeparture[] = [];
    for (const r of rows) {
      const route = { from: { lat: r.fromLat, lng: r.fromLng }, to: { lat: r.toLat, lng: r.toLng } };
      if (!routineMatches(route, destination, origin, this.t)) continue;
      const at = nextOccurrence(scheduleOf(r.routine), now);
      if (!at) continue;
      out.push({
        routineId: r.routine.id,
        driverName: r.displayName?.trim() || r.legalFirstName,
        type: r.routine.transportType,
        plateDisplay: r.plateDisplay,
        from: { nameAr: r.fromNameAr, nameFr: r.fromNameFr },
        to: { nameAr: r.toNameAr, nameFr: r.toNameFr },
        at: at.toISOString(),
        seats: r.routine.seats,
        note: r.routine.note,
      });
    }
    return out.sort((a, b) => a.at.localeCompare(b.at)).slice(0, 20);
  }

  private inBox(b: BBox): SQL {
    return sql`${between(driverLiveLocations.lat, b.south, b.north)} AND ${between(driverLiveLocations.lng, b.west, b.east)}`;
  }

  /** Sharing (not on break) drivers with a fresh fix, active accounts only (R-020). */
  private liveDrivers(where: SQL | undefined, now: Date, limit: number) {
    const freshSince = new Date(now.getTime() - this.t.driver_fresh_s * 1000);
    const heading = alias(places, 'heading_place');
    return this.db
      .select({
        driverUserId: driverLiveLocations.driverUserId,
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
        headingNameAr: heading.nameAr,
        headingNameFr: heading.nameFr,
        headingLat: sql<number | null>`ST_Y(${heading.location}::geometry)`,
        headingLng: sql<number | null>`ST_X(${heading.location}::geometry)`,
      })
      .from(driverLiveLocations)
      .innerJoin(sharingSessions, eq(sharingSessions.id, driverLiveLocations.sessionId))
      .innerJoin(driverProfiles, eq(driverProfiles.userId, driverLiveLocations.driverUserId))
      .innerJoin(users, eq(users.id, driverLiveLocations.driverUserId))
      .innerJoin(vehicles, eq(vehicles.id, sharingSessions.vehicleId))
      .leftJoin(heading, eq(heading.id, sharingSessions.headingToPlaceId))
      .where(
        and(
          eq(sharingSessions.state, 'SHARING'),
          isNull(sharingSessions.endedAt),
          eq(users.status, 'ACTIVE'),
          gte(driverLiveLocations.fixTs, freshSince),
          where,
        ),
      )
      .limit(limit);
  }

  private async markers(
    rows: Awaited<ReturnType<MapService['liveDrivers']>>,
    now: Date,
  ): Promise<MapDriver[]> {
    const nextRoutines = await this.routines.nextFor(
      rows.map((r) => r.driverUserId),
      now,
    );
    return rows.map((r) =>
      driverMarker(
        {
          ...r,
          nextRoutine: nextRoutines.get(r.driverUserId) ?? null,
          fixTs: r.fixTs.getTime(),
          headingTo: headingOf(r.headingNameAr, r.headingNameFr),
        },
        now.getTime(),
      ),
    );
  }

  /** OPEN, anchored (= visible, R-033) requests whose anchor is in the area. */
  private openRequests(bbox: BBox, limit: number) {
    return this.db
      .select({
        id: passengerRequests.id,
        passengerUserId: passengerRequests.passengerUserId,
        types: passengerRequests.transportTypes,
        anchorLat: passengerRequests.anchorLat,
        anchorLng: passengerRequests.anchorLng,
        seats: passengerRequests.seats,
        note: passengerRequests.note,
        showIdentity: passengerRequests.showIdentity,
        visibleAt: passengerRequests.visibleAt,
        createdAt: passengerRequests.createdAt,
        passengerName: users.displayName,
        destNameAr: places.nameAr,
        destNameFr: places.nameFr,
      })
      .from(passengerRequests)
      .innerJoin(users, eq(users.id, passengerRequests.passengerUserId))
      .leftJoin(places, eq(places.id, passengerRequests.destinationPlaceId))
      .where(
        and(
          eq(passengerRequests.status, 'OPEN'),
          isNotNull(passengerRequests.anchorLat),
          eq(users.status, 'ACTIVE'),
          between(passengerRequests.anchorLat, bbox.south, bbox.north),
          between(passengerRequests.anchorLng, bbox.west, bbox.east),
        ),
      )
      .limit(limit);
  }

  /**
   * Invariant 4: driver accounts need an active, fresh, non-break session (else 403 SHARING_REQUIRED);
   * a sharing driver sees passengers per their vehicle type, everyone else the public view.
   */
  private async viewerOf(viewerId: string, now: Date): Promise<Viewer> {
    const [v] = await this.db
      .select({
        verification: driverProfiles.status,
        state: sharingSessions.state,
        type: sharingSessions.transportType,
        lastFixAt: sharingSessions.lastFixAt,
        lat: driverLiveLocations.lat,
        lng: driverLiveLocations.lng,
      })
      .from(driverProfiles)
      .leftJoin(
        sharingSessions,
        and(eq(sharingSessions.driverUserId, driverProfiles.userId), isNull(sharingSessions.endedAt)),
      )
      .leftJoin(driverLiveLocations, eq(driverLiveLocations.driverUserId, driverProfiles.userId))
      .where(eq(driverProfiles.userId, viewerId));
    const session =
      v?.state && v.state !== 'ENDED' ? { state: v.state, lastFixTs: v.lastFixAt?.getTime() ?? null } : null;
    const access = liveMapAccess({ verification: v?.verification ?? null, session }, now.getTime(), this.t);
    if (access === 'SHARING_REQUIRED') throw new ApiException('SHARING_REQUIRED', HttpStatus.FORBIDDEN);
    if (session?.state === 'SHARING' && v?.type && v.lat !== null && v.lng !== null) {
      return { kind: 'SHARING_DRIVER', userId: viewerId, type: v.type, position: { lat: v.lat, lng: v.lng } };
    }
    return { kind: 'PUBLIC' };
  }
}
