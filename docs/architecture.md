# Architecture v3.1: live map, no assignment

> Decisions: [decisions.md](decisions.md). Rules: [product-plan.md §2](product-plan.md).

## 1. Overview

```
┌──────────── Mobile app (Expo / React Native, TypeScript) ─────────────┐
│ Passenger mode · Driver mode (driver-only accounts) · Google Sign-In    │
│ MapLibre live map · expo-location foreground service (user-started)     │
└───────────────┬────────────────────────────────────────┬────────────────┘
   HTTPS REST /v1: map polling (5 s), location pings (batched)   FCM push
                │                                        ▲
┌───────────────▼────────────────────────────────────────┴────────────────┐
│ API: NestJS modular monolith (TypeScript)                                │
│ auth · users · places · verification · sharing (driver sessions) ·       │
│ requests (passenger) · location (ping ingestion + rules) · map ·         │
│ finder · routines · pickups (admin-only) · moderation · notifications ·  │
│ admin · audit                                                            │
│ cron: @nestjs/schedule (lost-location, expiry, 12 h prompts, purges)     │
└───────┬───────────────────────────────┬──────────────────────────────────┘
  PostgreSQL 16 + PostGIS         MinIO (S3 API): private verification docs
┌─────────────────────────────┐
│ Admin web (React+Vite+Refine)│── REST (admin scope) ──► API
└─────────────────────────────┘
Docker Compose on one VPS · Caddy (TLS) · nightly encrypted off-site backups
```
No websockets, Redis, queues, BaaS or n8n in the core. Polling is enough at pilot scale (see §8).

## 2. Stack
| Layer | Choice |
|---|---|
| Mobile | React Native + Expo (dev builds/EAS), expo-router, TanStack Query, i18next (RTL), `@maplibre/maplibre-react-native` (OSM tiles via OpenFreeMap → self-hosted PMTiles later), `expo-location` + `expo-task-manager`, `@react-native-google-signin/google-signin`, `expo-notifications` (FCM) |
| API | NestJS, REST `/v1`, Zod contracts (`packages/contracts`), OpenAPI, Drizzle ORM + raw SQL for PostGIS, `@nestjs/schedule`, `google-auth-library`, `firebase-admin` (FCM) |
| DB | PostgreSQL 16 + PostGIS 3 |
| Admin | React + Vite + Refine; Google Identity Services |
| Infra | Docker Compose, Caddy, GitHub Actions → GHCR, EAS Build |

## 3. Authentication
Google ID token → `POST /v1/auth/google` → server verifies (signature, `aud`, `iss`, `exp`, `email_verified`) → upsert by `google_sub` → own JWT (15 min) + rotating refresh token (60 days). Admin web: same, and only `is_admin` users are admitted. iOS later: Sign in with Apple (`POST /v1/auth/apple`).

## 4. Location

### 4.1 Two tracking modes, both user-started
| | Driver sharing | Passenger request |
|---|---|---|
| Who | Verified driver: taxi, louage **or bus** | Passenger with an open **taxi/louage** request |
| Starts | "Start sharing" (no cooldown active) | Posting the request |
| Device cadence | 10 s moving / 30 s stationary, distance filter 10 m | 5 s, distance filter 3 m, high accuracy |
| Android | Foreground service + notification "You're visible · Stop" | Foreground service + notification "Looking for a ride · Stop" |
| Offline | Buffer up to 60 min of fixes; upload in order | Buffer up to 5 min |
| Server keeps | Latest point only (`driver_live_locations`) + session metadata | Anchor + latest point on the request |
| Pauses | **Break** 30 min / 1 h / 2 h: the service stops; no fixes are expected | — |
| Ends | Manual stop / GPS off / ping gap / 12 h unanswered / break not resumed / suspension / mock or jump | Moved > 20 m / 5 min without location / no fix in 60 s / 60 min / cancel |

Permissions: `ACCESS_FINE_LOCATION` (while in use), `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`. **No `ACCESS_BACKGROUND_LOCATION`**: services start from a visible UI action. Check the current Google Play foreground-service/location policy at submission. iOS later: when-in-use + `UIBackgroundModes: location`.

### 4.2 Ping endpoint
`POST /v1/location/pings` body: `{ fixes: [{ seq, ts, lat, lng, accuracy, speed, heading, isMock }], locationServicesOn }`
- The server infers the mode from state (the active sharing session, or the open request).
- If there is no active mode → `{ stop: true, reason }` and nothing is stored.
- Response: `{ stop: boolean, reason?, cooldownUntil? }`. The app stops its task when `stop: true`.
- Fixes older than the stored latest are used only for gap validation (driver) and then discarded.

### 4.3 Passenger rules (server-authoritative)
```
on fixes for OPEN request r (in timestamp order):
  if r.anchor is null:
     if fix.accuracy <= 30: r.anchor = fix.point; r.visible_at = now()
     continue
  if fix.accuracy > 25: continue                          -- drift protection
  if distance(fix, r.anchor) > 20:
     if r.away_since and fix.ts - r.away_since >= 10 s → close(r, MOVED_AWAY)
     elif r.away_since is null → r.away_since = fix.ts
  else r.away_since = null
  r.last_point = fix; r.last_ping_at = now()

cron every 30 s:
  OPEN requests with last_ping_at < now() - 5 min           → close(LOCATION_LOST)
  OPEN requests with anchor null and created_at < now()-60 s → close(NO_GPS_FIX)
  OPEN requests with expires_at < now()                      → close(EXPIRED)

close(r, reason): set status, closed_at; if MOVED_AWAY → pickups.recordPossibleDrivers(r); push to passenger
```

### 4.4 Driver session rules
Session state: `SHARING` (with `is_full` true/false) ⇄ `ON_BREAK`.
```
start(driver): require VERIFIED, vehicle approved, no suspension, now() >= cooldown_until, fresh fix
               heading_to defaults to a routine route with an occurrence within ±60 min (if any)

toggleFull(s): s.is_full = !s.is_full                     -- no penalty; only allowed in SHARING

startBreak(s, minutes ∈ {30, 60, 120}):                   -- only allowed in SHARING
  s.state = ON_BREAK; s.break_until = now() + minutes; delete driver_live_locations row
  respond stop:true (the app stops the location service, shows "On break until …", schedules a local notification)
resume(s): allowed only if now() >= s.break_until and now() <= s.break_until + 15 min
  → s.state = SHARING (needs a fresh fix); no cooldown

on fixes for s in SHARING:
  mock flag or implied speed > 180 km/h → end(s, SPOOF_SUSPECTED) + flag
  a hole > 2 min between consecutive recorded fixes (stored latest + uploaded batch) → end(s, PING_GAP)
  locationServicesOn = false → end(s, LOCATION_OFF)
  upsert driver_live_locations (the latest fix + the rolling window of the last ~2 min)
fixes received while ON_BREAK → stop:true, discarded

cron every 30 s:
  SHARING with last fix older than 2 min → hidden from maps; the driver sees "Reconnecting…"
  SHARING with last fix older than 60 min → end(PING_GAP)                    -- beyond the offline buffer
  ON_BREAK with now() > break_until + 15 min → end(BREAK_NOT_RESUMED)       -- no cooldown
  sessions at 12 h (including breaks) without "still working" for 10 min → end(MAX_DURATION)   -- no cooldown

end(s, reason): ended_at, end_reason; delete driver_live_locations;
  if reason ∈ {MANUAL_STOP, LOCATION_OFF, PING_GAP, SPOOF_SUSPECTED}: cooldown_until = end + 1 h
  push the reason (+ cooldown time)
```
The break timer counts from `startBreak`. There's no "end break early" endpoint: breaks can't be cut short.

### 4.5 Silent pick-up records (admin-only)
When a request closes `MOVED_AWAY`, **every** sharing driver whose rolling-window fixes include a point ≤ 50 m from the anchor during the last 2 min is inserted into `pickup_records(request_id, driver_user_id, min_distance_m, at)`. When there are several, all are recorded. Nothing is shown to passengers or drivers; the records are exposed only through admin endpoints (every read audited) and used to investigate reports.

## 5. Map & finder

### 5.1 Map endpoint
`POST /v1/map {bbox: {minLng, minLat, maxLng, maxLat}}` (POST keeps coordinates out of URLs and logs; ADR-221)
- The bbox span is capped (`map_max_span_km`); beyond it the endpoint returns `clustered: true` and counts per cell of an N × N grid over the visible area (`map_cluster_cells`).
- **Drivers** (sessions in `SHARING` with a fix < 2 min old, not blocked) → the same payload for **every viewer** (the viewer's own marker left out):
  `{id (the session), type, lat, lng, headingDeg, name, isFull, headingTo, lineLabel, plateDisplay, nextRoutine, updatedAgoS}`.
  The driver's name is always included. Sharing drivers therefore see all other drivers.
- **Requests** (OPEN and anchored, not blocked), serialised **per viewer** (`packages/domain/visibility/passengers.ts`):
  - a sharing (not on break) taxi/louage driver whose type ∈ request types → `{exact: true, lat, lng, destination, seats, waitingMin, distanceM, closerDrivers}` + `{name, note}` **only if `show_identity = true`**;
  - everyone else → `{exact: false, lat, lng}` snapped to a ~100 m grid cell centre, plus the destination, never a name or note;
  - the passenger's own request is not on their map.
- A driver account without an active, fresh, non-break session → **403** `SHARING_REQUIRED`.
- `closerDrivers` = the number of other sharing, **non-full** drivers of a matching type closer to the passenger than the viewer. It helps drivers judge whether a passenger is worth going for.
- Client polling every 5 s with `If-None-Match`; an unchanged view answers 304 with no body.

### 5.2 Destination finder
`POST /v1/finder {destination: {point, placeId?}, near}`. Inputs: `O` = `near` (the centre of the passenger's map, or null), destination `D`. The rules are pure functions in `packages/domain/finder`.
```
live   = drivers in SHARING, fresh, type ∈ T, ST_DWithin(pos, O, r_origin)   -- 5 km taxi, 15 km louage/bus
  heading_ok := headingTo near D (2 km urban / 10 km intercity)
                OR (D within the corridor pos→headingTo, 1 km / 5 km wide, and progress(D) > progress(O))
  → "Heading there now" (non-full first, by distance); taxis with no headingTo → "Taxis nearby"
routines = active routine routes with an occurrence in the next 7 days
  AND ST_DWithin(route.to, D, r_dest) AND ST_DWithin(route.from, O, r_from)  -- 15 km; the from-station may be further
  → "Scheduled departures" (by the next occurrence)
full drivers → shown last, with a Full badge
```
Occurrence expansion: weekly routines store `days_mask` + `local_time` (Africa/Tunis); the server computes the next occurrences on the fly.

### 5.3 Driver list
The same data as the map for the sharing driver, sorted by distance and grouped by destination place (the queue under the driver map). Navigation hands off to Google Maps or Waze.

### 5.4 Safety & moderation (ADR-222)
- `POST /v1/reports`, `POST|GET /v1/blocks`, `DELETE /v1/blocks/:id`; markers are referenced by their session or request id, never a user id. `GET /v1/driver/sharing/history` and `GET /v1/requests/history` feed the "report a problem" flows.
- `POST /v1/auth/appeal` (public, Google ID token): the contact form of a suspended or banned person.
- Admin: `/v1/admin/reports`, `/pickups` (audited reads), `/users`, `/users/:id/sanctions`, `/sanctions/:id/revoke`, `/risk-flags`, `/appeals`, `/stats`.
- The rules (priority, distinct reporters, pause, flag, device limit, sanction status) are pure functions in `packages/domain/moderation`.

## 6. Data retention
Latest points only; requests keep anchor/last point for 30 days and are then coarsened; pickup records are admin-only and kept 90 days; sessions metadata and session events (no coordinates) for 12 months. See [domain-model.md §4](domain-model.md).

## 7. Jobs (`@nestjs/schedule`)
Every 30 s: the passenger and driver rules above. Every 1 min: expiry reminders, 12 h prompts. Every 5 min: expired suspensions end. Daily: document expiry, routine staleness, pick-up record retention (90 days unless an open report needs them). All jobs are idempotent SQL.

## 8. Capacity (pilot)
- 500 sharing drivers × 1 upload/15 s ≈ 35 req/s.
- 300 open requests × 1 upload/5 s ≈ 60 req/s.
- 1,500 map viewers × 1 poll/5 s ≈ 300 req/s (small bbox queries on GiST indexes + a 2 s in-memory cache per tile).

A 4 vCPU VPS with Postgres handles this. Beyond that: cache the map per H3 tile in Redis, then switch to SSE/websockets for the map.

## 9. Cost
≈ €10–30/month (VPS + backups + domain); Google Sign-In, FCM and OSM tiles are free; Play $25 once; Apple $99/year at iOS. Hosting region after legal advice (INPDP transfer authorisation).

## 10. n8n / AI
- **n8n:** not in the core. It could be an optional admin digest later.
- **AI:** none in v0.x.
