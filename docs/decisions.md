# Decision Records

> Current decisions first; superseded ones at the bottom for history.

## Current (v3.1, 2026-09-29)

### ADR-201: Product = a shared live map with no assignment · Accepted
Verified taxi/louage/bus drivers appear on a live map while sharing; passengers with an open taxi/louage request appear on it with their destination. There are no offers, acceptance, chat or dispatch: **the first driver to arrive picks the passenger up.**
*Supersedes ADR-101, ADR-109.*

### ADR-202: One open request per passenger; taxi/louage only · Accepted
Enforced with a DB partial unique index. No requests and no passenger location for bus.

### ADR-203: Passenger request lifetime = tracking lifetime; auto-closure rules · Accepted
Posting starts a user-visible foreground location service. The request closes when:
- the passenger is > 20 m from the anchor (2 fixes ≥ 10 s apart, accuracy ≤ 25 m);
- no location arrives for 5 min;
- there is no accurate fix within 60 s;
- 60 min pass (renew ×3);
- the passenger cancels.

The server is authoritative, and the thresholds are configurable.
*Supersedes the passenger part of ADR-111.*

### ADR-204: Driver features require live sharing; 1 h cooldown after any stop · Accepted
- **Sharing:** available to taxi, louage and bus drivers. Without an active session with a fresh fix, driver endpoints return `SHARING_REQUIRED`.
- **Cooldown:** a manual stop, GPS off, an uncovered ping gap (killed app) or suspected spoofing ends the session and sets `cooldown_until = end + 1 h`.
- **Network loss is not a stop:** a gap covered by buffered fixes doesn't end the session.
- **12 h cap:** the session ends at 12 h without a "still working" confirmation, with no cooldown.
- **Admins** can clear a cooldown.

*Supersedes the driver part of ADR-111.*

### ADR-205: Verified driver accounts are driver-only · Accepted
This prevents drivers from viewing the map without sharing through a passenger mode. It can be revisited if drivers need to travel as passengers (e.g. a separate passenger account).

### ADR-206: Per-viewer map visibility · Accepted (revised 3.1)
- **Drivers:** exact position and **name always**, to everyone. Drivers see each other (including Full badges) to judge whether a passenger is worth going for.
- **Passengers:** exact position to sharing taxi/louage drivers of a matching type; approximate (~100 m grid) to everyone else.
- **Passengers are anonymous by default.** Name and note are shown to those drivers only if the passenger opts in (`show_identity`).
- No location history is exposed. Drivers have only a ~2-min rolling window, used to create pick-up records.

### ADR-207: Silent, admin-only pick-up records · Accepted (revised 3.1)
When a request closes `MOVED_AWAY`, **all** sharing drivers ≤ 50 m from the anchor in the last 2 min are recorded automatically. Users are never prompted ("did you get a ride / was it this driver" are removed). The records are visible only in the admin web app (audited) and used to investigate reports filed from markers, request history or session history.

### ADR-210: "I'm full" toggle and declared breaks · Accepted
- **Full:** a free toggle while sharing; the driver stays visible with a Full badge.
- **Breaks:** 30/60/120 min. The driver is hidden and not tracked. A break **cannot be ended early**. Resume within 15 min after the end without cooldown; otherwise the session ends without cooldown.
- The 1 h cooldown still applies to undeclared stops.

### ADR-211: Routine routes · Accepted
Verified drivers may publish up to 5 one-off or weekly routes **without sharing**. They are informational only (no booking) and shown as "Scheduled departures" in the finder. They pre-fill "heading to" when sharing starts within ±60 min, and prompt for staleness after 30 unused days.

### ADR-212: Approved screen designs in Stitch; blue + yellow palette at implementation · Accepted
The mobile screens are designed in Google Stitch (project "Fi Thnitek Transit Map", see `docs/ux.md §5`) and approved for layout, content and copy. Stitch generated a green palette; it is **not** binding. The app's theme tokens use a **deep blue primary + sunny yellow accent** (Mediterranean), with green/amber/red reserved for status (visible, warning, stop). Contrast must stay WCAG AA.

### ADR-213: Phase 1 toolchain and library versions · Accepted
Pinned 2026-10-02 after checking peer compatibility:
- **Runtime/tooling:** Node 22 LTS (≥ 22.12, for `require(esm)` and Vitest 5) · pnpm 12.8 · Turborepo 2.11 · **TypeScript ~6.0** (not 7.0: the NestJS CLI and the Expo SDK 57 template pin 6.0, and typescript-eslint supports < 6.1) · ESLint 10 flat config + typescript-eslint 8 · Prettier 3 · Vitest 5.
- **Shared packages** are ESM, built with `tsc` to `dist/`; the CommonJS API loads them via `require(esm)`.
- **API:** NestJS 12.1 (+ schedule 12, swagger 12), nestjs-pino 5 / pino 10, Drizzle ORM 0.45 + drizzle-kit 0.31 + `pg` 8, Zod 4.6 (OpenAPI schemas generated with `z.toJSONSchema`). Tests run on Vite 8's Oxc transform, which emits decorator metadata, so **no SWC**. Integration tests: Testcontainers 12 with `postgis/postgis:16-3.5`.
- **Errors:** RFC 9457 `application/problem+json` with a stable `code`; `type` is a URN (`urn:fi-thnitek:problem:<code>`) so no domain is assumed.
- **Audit:** `audit.audit_logs` is insert-only through a trigger (blocks UPDATE/DELETE/TRUNCATE for every role, owner included) plus an INSERT/SELECT-only role `fi_audit_writer`.
- **Mobile:** Expo **SDK 57** with the versions it pins (React Native 0.86.3, React 19.2.3, reanimated 4.5.1, worklets 0.10.1), expo-router 57, `@maplibre/maplibre-react-native` 11.4 (OpenFreeMap "liberty" style), i18next 26, TanStack Query 5. SDK peers are pinned explicitly because pnpm otherwise auto-installs their latest versions.
- **Admin:** Vite 8 + Refine 5 + antd **5.29** + react-router **7** (`@refinedev/antd` and `@refinedev/react-router` do not support antd 6 / react-router 8 yet). Refine telemetry disabled.
- **pnpm supply-chain settings:** install scripts allowed only for `esbuild`; denied for `@swc/core`, `@scarf/scarf`, `cpu-features`, `ssh2`, `protobufjs`. pnpm's minimum-release-age rule auto-exempted a few just-released packages (listed in `pnpm-workspace.yaml`).
- **Open:** MinIO community images are no longer published, so the S3-compatible store for verification documents must be chosen before Phase 3.

### ADR-214: Authentication details (Phase 2) · Accepted
- **Google ID tokens** are verified with `jose` against Google's JWKS: RS256 signature, `aud` ∈ `GOOGLE_CLIENT_IDS` (the OAuth *Web* client, which Android also targets as `webClientId`), `iss`, `exp`, `email_verified`. Every failure is one opaque `INVALID_GOOGLE_TOKEN`.
- **Access token:** our own HS256 JWT (`JWT_SECRET`, ≥ 32 chars, the dev placeholder is refused in production), 15 min, claims = user ID + session family ID only (no PII).
- **Refresh token:** 256-bit random, stored as SHA-256 only, 60 days. `sessions` holds **one row per refresh token**; a sign-in starts a *family*, each refresh marks the row `rotated_at` and inserts the next (conditional update, so only one concurrent refresh wins). Replaying a rotated token revokes the whole family (`REUSE_DETECTED`). Clients must serialise refreshes (both clients do single-flight).
- **Every authenticated request** re-checks the session family and the account status (one indexed lookup), so logout, reuse detection, suspension and bans take effect immediately rather than after 15 minutes.
- **Admins:** `is_admin` is recomputed at each sign-in from `ADMIN_EMAILS` (verified Google emails). The admin web app signs in with Google Identity Services and is admitted only if `GET /v1/admin/me` succeeds; its tokens live in `sessionStorage` (tab-scoped). Cookie-based admin sessions are a later hardening step.
- **Onboarding (R-002):** `PATCH /v1/me` stores the display name, locale and the accepted Terms version (`TERMS_VERSION`); `needsOnboarding` until both are done. The current Terms text is a draft pending the v1.0 legal pack.
- **Account deletion (R-005):** anonymises the user (email, name, Apple sub cleared; Google sub cleared so the person can start over), revokes all sessions, deletes devices and writes `user.delete` to the audit log. A suspended or banned account keeps its status and Google sub, so deletion cannot evade a sanction.
- **Devices (R-004):** a random per-install UUID (never a hardware ID); logout clears the device's push token. Push tokens need the FCM project and arrive with notifications.
- **Not yet:** rate limiting of the auth endpoints; Sign in with Apple (iOS, v1.0).

### ADR-215: Driver verification storage, uploads and push (Phase 3) · Accepted
- **Object storage: Garage** (S3-compatible, self-hosted, `dxflrs/garage:v2.4.1`) replaces MinIO, whose community images are no longer published. The API uses the standard S3 SDK, so any S3-compatible store can replace it. The bucket is private; reads are 60-second signed GET URLs; every admin view is audited.
- **Uploads go through the API** (multipart, ≤ `MAX_UPLOAD_MB`) instead of pre-signed PUTs, so the server can enforce what `docs/security.md §5` asks before anything is stored: type detected from the bytes (JPEG/PNG only), **EXIF/XMP/IPTC/comments stripped** (dependency-free byte-level code, no native image library), SHA-256 for duplicate warnings across accounts. The app also re-encodes photos on the device (resize to 1600 px, JPEG without EXIF). Object keys contain only IDs.
- **CIN:** AES-256-GCM ciphertext (`CIN_ENCRYPTION_KEY`) + keyed HMAC (`CIN_HMAC_KEY`, unique index) + last 4 digits; the full CIN is only returned by the audited admin detail. Plates are normalised so Arabic (`123 تونس 4567`) and Latin (`123 TU 4567`) spellings collide.
- **Required documents** per transport type are code defaults (`packages/domain`), pending legal confirmation and the admin "Content" editor. One vehicle per driver for now.
- **Watermark:** the admin viewer overlays the reviewer and time on screen (a deterrent; server-side burned-in watermarks need an image library and are deferred).
- **Push (R-063):** FCM via `firebase-admin` to native device tokens (`expo-notifications`), payload = an event code + generic localised text, never names, CINs or plates. Without `FIREBASE_SERVICE_ACCOUNT_FILE` pushes are recorded and logged, so development and tests run without Firebase. The in-app status is the source of truth.
- **Expiry (R-064):** a daily job (07:00 Africa/Tunis) reminds once `document_expiry_reminder_days` before expiry and moves VERIFIED → EXPIRED when an accepted document expires; idempotent conditional updates.
- **Use fake documents only** until the INPDP declaration is filed (docs/research-tunisia.md, legal question 4).

### ADR-216: A shorter driver file · Accepted (product owner, 2026-10-03)
Drivers found the form too long. The file now asks only: legal first and last name, CIN number, transport type, **CIN photos (front and back)**, **driving licence**, and per type: taxi/louage → **professional card**, **carte grise**, **operating card**; bus → **operator authorisation**; plus the **plate**. Expiry dates stay for the licence and cards (R-064 reminders).
- **Removed:** selfie, insurance, vehicle photo, vehicle model and colour.
- **Seats are not asked:** taxi 4, louage 8 (`DEFAULT_SEATS`); bus none (bus passengers never request).
- **Trade-off accepted:** without a selfie the admin cannot match the CIN photo to the person, and without a plate photo cannot confirm the vehicle; admins rely on the CIN/licence/card consistency and on reports. Revisit if fake accounts appear (anti-abuse scenario 13).
- The removed document types stay in the database enum (no destructive enum migration) but are neither required nor accepted.

### ADR-222: Safety and moderation as built (Phase 8) · Accepted (2026-10-04)
- **Reports (R-070):** from a driver or passenger marker (the phone only knows the session or request id, never a user id), from the passenger's request history or from the driver's session history with an approximate time inside the session. From history the other person is unknown on purpose: the admin finds them through the pick-up records. "Nobody there" only from a verified driver on a passenger marker; nobody reports themselves; `report_daily_limit` (10) per Tunis day. UNSAFE and HARASSMENT are `HIGH` priority and listed first.
- **Blocks (R-027, R-071):** from a marker or with a report ("also block"). Either direction hides both people from each other's map, finder and clusters; listed (and lifted) from the profile. A blocked passenger is named only if they had chosen to show their name.
- **Automation stays within anti-abuse §1.3:** 3 "nobody there" from distinct drivers in 7 days → a 24 h `REQUEST_PAUSE` (`created_by` null) + a `NOBODY_THERE_CLUSTER` flag + the open request removed; 3 reports from distinct users on one person in 7 days → a `REPORTS_CLUSTER` flag only. One report never punishes anyone.
- **Device limit (anti-abuse §2, scenario 14):** the accounts seen on the user's install ids in 30 days; beyond 2 live accounts the newer ones cannot request, and none can when a banned account is on the device (`DEVICE_LIMIT`). The install id is random per install, never a hardware id.
- **Sanctions (R-073):** warnings, suspensions (1–365 days) and bans are admin-only, with a reason the person sees. A suspension or ban revokes every session, ends sharing (`SUSPENDED`, no cooldown) and removes the open request, in one transaction; `users.status` follows the sanctions in force and a 5-minute job ends expired suspensions. Revoking is audited and needs a reason.
- **What the person sees:** the very next API call (or refresh, or sign-in) answers 403 `ACCOUNT_SUSPENDED` / `ACCOUNT_BANNED` with `sanction {type, reason, endsAt}`. The sign-in screen shows it with the **contact form**: `POST /v1/auth/appeal` proves the Google account with a fresh ID token (they cannot sign in), one open appeal at a time. Admins read appeals in the console.
- **Pick-up records (R-039, NFR-06):** admin-only, by request or by driver over a period; every read writes `pickup_records.read` to the audit log with the report it serves. An integration test walks every user endpoint after a pick-up and checks that no record (nor the other person's id) appears. Kept `pickup_retention_days` (90), longer while an open report points at the request.
- **Admin console:** reports queue with the linked request/session and on-demand pick-up records, people (search, counts, sanctions), risk flags, appeals, pick-up search, and dashboard stats. No coordinates anywhere in the console.
- **New thresholds:** `report_daily_limit=10`, `nobody_there_reports=3`, `nobody_there_window_days=7`, `request_pause_h=24`, `report_flag_count=3`, `report_flag_window_days=7`, `device_max_accounts=2`, `device_window_days=30`, `pickup_retention_days=90`.

### ADR-221: Live map and destination finder as built (Phase 7) · Accepted (2026-10-04)
- **Endpoints:** `POST /v1/map {bbox}` and `POST /v1/finder {destination, near}`. Both use POST so that no coordinate ever appears in a URL or an access log (CLAUDE.md rule 8); this replaces the `GET /v1/map?bbox=` sketch in architecture.md §5.1.
- **Polling:** the phone polls the map every 5 s while the screen is focused. The response carries a weak `ETag` (a hash of the serialised view); the phone sends `If-None-Match` and an unchanged view answers **304 with no body**. The ETag is per viewer and per bbox, so no shared cache is involved (ADR-208).
- **Serialisation per viewer** (`packages/domain/visibility`, pure and tested): drivers are the same for everybody (the name always present, the viewer's own marker left out). Open, anchored requests are exact (`lat`, `lng`, seats, waiting minutes, `closerDrivers`, and the name/note only with `show_identity`) for a sharing, not-on-break taxi/louage driver of a requested type; everyone else (passengers, buses, other types) gets the cell centre of a ~`approx_grid_m` grid and the destination only. A passenger never sees their own request on the map. A driver account without a live session gets 403 `SHARING_REQUIRED`.
- **`closerDrivers`** counts other sharing, non-full drivers of a matching type closer to the passenger than the viewer; the server computes it from the latest points only.
- **Clusters (R-020):** beyond `map_max_span_km` the map answers `clustered: true` with counts per cell of a `map_cluster_cells` × `map_cluster_cells` grid over the visible area (drivers by type and passengers), instead of H3. Tapping a cluster zooms into it.
- **Finder (R-045/R-046, ADR-107):** `near` is the centre of the passenger's map (the passenger map never reads the phone's position), or null. Live drivers within the type radius (`finder_radius_taxi_m` 5 km, `finder_radius_intercity_m` 15 km) go to "Heading there now" when their heading-to place is near D (2 km taxi / 10 km louage and bus) or D lies in the straight-line corridor towards it (1 km / 5 km wide, ahead of the passenger); taxis with no heading-to go to "Taxis nearby"; full drivers are listed last. "Scheduled departures" are the routines with an occurrence in the next 7 days whose destination is within `finder_routine_m` of D (and origin of `near`). **Known limit:** the corridor is a straight line, not the road, so a town well off the line (Sousse on Tunis → Sfax) does not match; road geometry is out of scope for v0.x.
- **Driver map (R-024, architecture §5.3):** exact passengers as pins (seats on the pin) with a card (name or "anonymous", destination, seats, waiting time, distance, note, the closer-drivers warning) and a queue under the map, grouped by destination and nearest first. Navigation hands off to Google Maps (`google.navigation:`) or Waze (`waze://`), falling back to a `geo:` link; Fi thnitek has no turn-by-turn of its own.
- **Animation:** markers glide between polls (10 steps of 80 ms) on the phone; nothing changes on the server.
- **New thresholds:** `map_cluster_cells=8`, `finder_near_urban_m=2000`, `finder_near_intercity_m=10000`, `finder_corridor_urban_m=1000`, `finder_corridor_intercity_m=5000`, `finder_radius_taxi_m=5000`, `finder_radius_intercity_m=15000`, `finder_routine_m=15000`.

### ADR-220: Passenger requests as built (Phase 6) · Accepted (2026-10-04)
- **One open request** per passenger: a partial unique index plus a row lock on the user while posting. Taxi and/or louage only (the contract has no BUS); verified, expired or suspended driver accounts are refused (`REQUEST_NOT_ALLOWED`); 5 requests per Tunis day for accounts under 3 days old, 15 after (`REQUEST_LIMIT`).
- **Anonymous by default:** `show_identity` is false unless the passenger turns it on; the phone remembers the last choice.
- **Destination:** a pin (`destination_point`), named after a known place when there is one (`destination_place_id`). The origin is never sent: it is the anchor from the phone's own fixes.
- **Rules** (`packages/domain/request-rules`, pure and tested with drift fixtures): the first fix ≤ 30 m anchors the request (it becomes visible to drivers from then on); fixes worse than 25 m are ignored; two accurate fixes > 20 m from the anchor at least 10 s apart close it as `MOVED_AWAY`, and coming back in range in between resets the count; a mock fix closes it as `REMOVED` with a `risk_flags` row (`request_id`); location services off → `LOCATION_LOST`. The 30 s sweep closes `NO_GPS_FIX` (no anchor after `anchor_timeout_s`), `LOCATION_LOST` (no fix for 5 min) and `EXPIRED`, and sends one "Renew?" push 10 min before expiry. Renewing adds 60 min to the current expiry, at most 3 times.
- **Positions kept:** the anchor and the latest point only (no history), on the request row.
- **Silent pick-up records (R-039):** on `MOVED_AWAY`, every sharing driver whose 2-minute window came within 50 m of the anchor is recorded in `pickup_records` (all of them). Nothing about it reaches the passenger or drivers; the admin view is audited (ADR-222).
- **Pings:** one endpoint and one phone task for both modes. The server tries the passenger mode first (an open request, or one closed in the last 12 h answers `stop` with its reason), else the driver mode; a driver account never has requests, so they cannot overlap. The passenger cadence (one fix per 5 s, 3 m filter, 5-minute buffer) comes from the server.
- **Phone:** P3 sheet (types, seats, destination, note, name toggle, the first-time explanation), P4 waiting screen (GPS/visible state, the 20 m warning, expiry countdown, renew, cancel), P5 closure screen (reason + Post again, no follow-up questions). Passengers on the map for drivers: ADR-221.
- **New thresholds:** `anchor_timeout_s=60`, `request_expiry_reminder_min=10`, `request_daily_limit_new=5`, `request_daily_limit=15`, `request_new_account_days=3`, `passenger_ping_s=5`, `passenger_distance_filter_m=3`, `passenger_buffer_max_min=5`.

### ADR-219: Routine routes as built (Phase 5c) · Accepted (2026-10-04)
- **Places only:** a routine goes from a known place to a known place (`from_place_id`, `to_place_id`, picked with the place search or pick-on-map), like "heading to" (ADR-218). Places used by routines cannot be deleted by an admin (409).
- **Time:** weekly routines store `days_mask` (Mon = 1 … Sun = 64) and a Tunis-local `local_time` "HH:MM"; one-off routines store the instant. Africa/Tunis is UTC+1 all year (no daylight saving since 2009), so occurrences are computed exactly in `packages/domain/routines` without a time-zone database. A database CHECK keeps each kind's fields consistent.
- **Limit:** at most `routine_max` (5) routines per driver, active or not, checked under a lock on the driver profile.
- **Who:** verified drivers only (403 `NOT_VERIFIED` otherwise); no sharing needed (product plan rule 5).
- **Pre-fill (R-051):** `GET /v1/driver/sharing` returns `suggestedHeadingTo`, the destination of the live routine departing closest to now within ±`routine_prefill_window_min`. The phone fills "heading to" with it unless the driver chose or removed one.
- **Use and staleness (R-067):** a session started (or re-aimed) towards a routine's destination within ±60 min of one of its departures sets `last_used_at`. A daily job (09:00 Tunis) asks "Still running this route?" once after `routine_stale_days` without use (one push per driver) and hides the routine `routine_prompt_grace_days` later. "Yes" or reactivating shows it again and restarts the clock; "No" switches it off. Creating a routine counts as a use.
- **Shown to others (R-066, R-022):** the live map's driver marker carries the next departure in the next 7 days (`nextRoutine`). The finder's "scheduled departures" (R-045c) read the same rules (ADR-221).
- **Never a booking (R-068):** seats and note are information only.

### ADR-218: Driver sharing as built (Phase 5) · Accepted (2026-10-04)
- **Sessions:** `sharing_sessions.state` is `SHARING | ON_BREAK | ENDED` (+ `ended_at`, `end_reason`); one active session per driver (partial unique index). Every change runs under a row lock (`SELECT … FOR UPDATE`) with conditional updates; the rules are the pure functions of `packages/domain/sharing-rules` (state machine, start blockers, cooldown, resume window, "still working?", sweep, ping evaluation).
- **Pings:** `POST /v1/location/pings` evaluates a batch in timestamp order (`evaluateDriverFixes`): a mock fix or an implied speed above `spoof_speed_kmh` after subtracting both accuracy radii → `SPOOF_SUSPECTED` + a `risk_flags` row (measurements only, no coordinates); a hole longer than `ping_gap_s` → `PING_GAP`; `locationServicesOn=false` → `LOCATION_OFF`. A network outage covered by buffered fixes is not a gap. Only the latest point and a 2-minute window are stored (`driver_live_locations`), deleted at break and at the end. Uploads are limited to 1 per 3 s per user, in memory (single API process, ADR-208).
- **Cooldown:** 1 h after `MANUAL_STOP`, `LOCATION_OFF`, `PING_GAP`, `SPOOF_SUSPECTED`. A `PING_GAP` counts from the **last good fix** (anti-abuse scenario 5): a phone silent for an hour has served its cooldown. Full, breaks, `BREAK_NOT_RESUMED`, `MAX_DURATION`, `SUSPENDED` and `ADMIN` never apply one. An admin can clear it (audited).
- **Sweep (every 30 s):** ends sessions silent beyond the offline buffer (`PING_GAP`), unresumed breaks, unanswered "Still working?" (only once the prompt was actually sent, so downtime never ends a session unannounced) and sessions of drivers no longer VERIFIED or suspended (`SUSPENDED`); sends the break-over and "Still working?" pushes once.
- **Phone:** `expo-location` `startLocationUpdatesAsync` with a **foreground service** (`killServiceOnDestroy`), started only from the driver's tap. Its Android code checks only the while-in-use permission on this path; `ACCESS_BACKGROUND_LOCATION` stays blocked in the manifest. The OS delivers a fix every `driver_ping_moving_s`; the app keeps one per 10 s when moving ≥ `driver_distance_filter_m`, else one per 30 s, in an AsyncStorage buffer (≤ `driver_buffer_max_min`, ≤ 400 per upload, oldest first). The cadence comes from the server in `GET /v1/driver/sharing`. A supervisor restarts the service when the server still says SHARING (e.g. after the app was killed): the first upload then reveals the gap and the server applies the rule.
- **"Heading to"** is a known place (`heading_to_place_id`), chosen with the destination search or pick-on-map; free points/labels are not stored.
- **Live map, drivers layer pulled forward from Phase 7:** `POST /v1/map/drivers` (visible area in the body) returns fresh sharing drivers with the name always present (`driverMarker`), never the user id. Driver accounts get it only while sharing with a fresh fix (403 `SHARING_REQUIRED`, invariant 4). No markers beyond `map_max_span_km`; no clustering yet (300 markers max). Passenger requests and blocks arrive with Phases 6–8.
- **New thresholds:** `ping_gap_s=120`, `driver_ping_moving_s=10`, `driver_ping_stationary_s=30`, `driver_distance_filter_m=10`, `still_working_answer_min=10`, `map_max_span_km=25`.
- **Test containers:** the PostGIS image's own init script (PostGIS + topology + Tiger geocoder in two databases) is skipped in tests; migration 0000 creates the extensions we use.

### ADR-217: Places from OpenStreetMap, searched in PostgreSQL · Accepted (2026-10-03)
- **Data:** cities, towns, villages, neighbourhoods, delegations, governorates, bus/louage stations, airports and major landmarks for Tunisia, extracted from **OpenStreetMap** with the Overpass API (`pnpm --filter @fi-thnitek/api places:fetch`) into `data/places/tn-places.json`, committed and reviewed by diff. Licence **ODbL 1.0**: attribution "© OpenStreetMap contributors" on the map and in `data/places/README.md`; the derived places table is shared under ODbL if it is ever published.
- **Import:** `pnpm db:seed` upserts by `source`. Rows an admin edited are `locked` and never overwritten; places that disappear from OSM are kept (an admin deletes them).
- **Search (R-011):** names are folded once in `packages/domain` (`normalizeSearchText`: Latin accents, Arabic harakat/tatweel, alef/hamza/ta marbuta/alef maqsura variants, Arabic-Indic digits, case and punctuation) into `search_text`. PostgreSQL ranks substring matches and `pg_trgm` word similarity (threshold `PLACE_SEARCH_MIN_SIMILARITY` = 0.4, via `SET LOCAL` so the GIN index is used), plus popularity, minus distance when `near` is given. No search engine, no external geocoder.
- **Pick on map:** the nearest place (KNN `<->` on the GiST index, `ST_DWithin` ≤ 5 km by default) names a dropped pin; the pin itself is the destination.
- **Privacy:** search text, `near` and pins travel in **POST bodies** (never URLs, CLAUDE.md rule 8) and are neither stored nor logged. The chosen destination stays in memory on the phone until a request exists.
- **Admin:** "Content → Places" lists, creates, edits and deletes places; each write is audited.
- **Rejected:** Nominatim/Google geocoding (cost, rate limits, sends user queries to third parties), Meilisearch/Typesense (an extra service for ~2–20 k rows).

### ADR-208: REST polling for the live map (5 s) and batched location uploads; no websockets at v0.x · Accepted
Revisit with Redis tile caching → SSE/websockets when load requires it. *Supersedes ADR-106.*

### ADR-209: Trust = verified drivers + limits + auto-closure + reports + admin decisions · Accepted
Automation may close requests, end sessions/apply the cooldown, pause requesting for 24 h and hide content; suspensions/bans are admin-only. *Supersedes ADR-110.*

### Still valid
- **ADR-102** Free and non-commercial; no payments, fares or commission.
- **ADR-103** Verified operators only (taxi, louage, bus).
- **ADR-104** Google Sign-In for everyone; Sign in with Apple added for iOS; admins via the Google allow-list.
- **ADR-107** Matching geometry (radius + straight-line corridor) now used by the destination finder (no time windows: everything is live).
- **ADR-108** `@nestjs/schedule` + idempotent SQL; no queues/Redis.
- **ADR-004 / 018** React Native + Expo, one app with modes.
- **ADR-005** NestJS modular monolith. **ADR-006** PostgreSQL + PostGIS + Drizzle.
- **ADR-007** Portable Docker hosting; region after legal advice.
- **ADR-012** MapLibre + OSM tiles (now central: the live map). **ADR-014** n8n not in the core. **ADR-015** No AI in v0.x. **ADR-017** UUIDv7, UTC.

---

## Superseded (history)

| ADR | Title | Superseded by |
|---|---|---|
| 101 | Simple request board (posts, offers, asks) | 201 |
| 105 | No continuous location | 111 → 203/204 |
| 106 | REST + push, chat polling | 208 |
| 109 | In-app chat after acceptance; optional phone sharing | 201 (no connections) |
| 110 | Trust with connection feedback | 209 |
| 111 | Opt-in live location, taxi & louage only; matched sharing | 203, 204, 206 |
| 001, 008, 009, 010, 011, 013, 016 | v1 decisions (boards, OTP, work sessions, sockets, dispatch, tiers, bus info-only) | See [archive/product-plan-v1-2026-09-29.md](archive/product-plan-v1-2026-09-29.md) |
