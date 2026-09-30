# Roadmap v3

> Complexity: **S** ≤ 2 days · **M** 3–5 days · **L** 1–2 weeks (solo + AI, ~25–30 h/week).
> To a closed beta (v0.1): **~11–13 weeks** after Phase 0 (including routine routes, Full and breaks).

| Release | Phases | Outcome |
|---|---|---|
| **v0.1** closed beta | 1–8 | Live map, driver sharing (Full, breaks, cooldown), routine routes, one anonymous-by-default request per passenger with auto-closure, driver verification + admin |
| **v0.2** | 9 | Admin pick-up history polish, "nobody there" pause, mock checks, routine staleness, stats |
| **v1.0** public | 10 | Legal pack, store release, iOS + Sign in with Apple |

## Phase 0: Validation (1–2 weeks, no code)
- Interview 15 taxi drivers, 10 louage drivers and 2–3 bus operators.
  - Will they share their location while working?
  - Is the **1 h cooldown** acceptable?
  - Is "first to arrive" fair to them, or will racing cause conflicts?
- Interview 20 passengers.
  - Will they stand and wait visibly?
  - Is the 20 m rule understandable?
- **Field test the 20 m rule** with 3 phones (indoors, outdoors, near tall buildings) using a GPS logging app, to check drift against the thresholds.
- Legal check: real-time location of passengers/drivers, INPDP declaration, hosting/transfer abroad, document retention.
- Places dataset for the launch city; choose the launch area.

## Phase 1: Foundation (M)
Monorepo, contracts, domain package, i18n, NestJS skeleton (config, logging with redaction, errors, Drizzle + PostGIS, health, OpenAPI), Expo skeleton (router, i18n/RTL, theme, **MapLibre base map**), admin skeleton, docker-compose, CI.

## Phase 2: Google authentication (M)
`/v1/auth/google`, sessions, `/v1/me`, devices + push tokens, delete account; mobile sign-in + onboarding; admin sign-in with the allow-list.
**Tests:** token verification failures, refresh rotation/reuse, admin gate.

## Phase 3: Driver verification + admin review (L)
Profiles, vehicles, documents (pre-signed uploads, EXIF strip, hashes, CIN/plate uniqueness), the status machine, the mobile form + status, the admin queue/viewer/decisions, the push on decisions, the audit log. **The verified account becomes driver-only.**
**Tests:** state machine; authz on documents; duplicates; E2E submit → approve → push → driver mode.

## Phase 4: Places & map base (M)
Places import + search (unaccent/trigram, AR/FR/aliases), pick on map, the admin places editor, the map screen shell with layer toggles.

## Phase 5: Driver sharing (L)
- `sharing_sessions`, `driver_live_locations`, start/stop, the **1 h cooldown**, the **I'm full** toggle, **breaks** (30/60/120 min, no early end, a 15-min resume window), session events.
- The foreground service + notification, offline buffering, `POST /v1/location/pings`.
- **Gap detection** (buffered vs killed).
- Mock/jump checks, the 12 h "still working?" flow, "heading to" and the bus line label.
- Admin: sessions view, clear cooldown.

**Tests:**
- Unit: the session state machine (full, break, resume window, which reasons trigger the cooldown); gap detection with synthetic fix sequences (a covered gap continues; an uncovered gap ends with `PING_GAP`); fixes during a break are discarded.
- Integration: 403 `SHARING_REQUIRED`.
- Field: kill the app → reopen → cooldown shown; tunnel/airplane mode for 5 min → session continues; 1 h of battery on a low-end phone.

## Phase 5c: Routine routes (M)
CRUD (max 5; one-off or weekly), occurrence expansion (Africa/Tunis), the heading-to pre-fill on start, the staleness prompt, finder integration hooks.
**Tests:** occurrence expansion across weeks/DST-free Tunisia time; the max-5 limit; stale detection.

## Phase 6: Passenger request (L)
- One request (DB constraint) for taxi/louage only, **anonymous by default** (the `show_identity` toggle).
- The foreground service; anchor; the **20 m moved-away rule**; the 5 min location-lost rule; the no-fix rule; the 60 min expiry + renew; cancel.
- The closure screen with Post again; request limits.

**Tests:**
- Unit: the rule engine with drift fixtures (bad-accuracy fixes ignored; one far fix doesn't close; 2 fixes ≥ 10 s apart close).
- Integration: the second open request is rejected; a bus request is rejected; pings after closure → `stop:true`.
- Field: stand still for 20 min indoors and outdoors (no false closure); walk 25 m (closes).

## Phase 7: Live map & finder (L)
`GET /v1/map` with **per-viewer serialisation** (exact for matching sharing drivers, approximate for others), clustering, ETag/caching, 5 s polling, marker animation, driver cards, the destination finder ("heading to" + corridor), the driver list grouped by destination, Navigate deep links.
**Tests:** serialisation tests proving exact coordinates only reach matching sharing drivers; block filtering; the bbox cap; load test (§8 of architecture).

## Phase 8: Safety & moderation (M)
Silent **pick-up records** at `MOVED_AWAY` (all drivers ≤ 50 m, admin-only) + the admin pick-up history view, reports from markers/request history/session history (incl. "Nobody there"), blocks, the auto request-pause, risk flags, the admin reports queue linked to pick-up records, sanctions with session revocation, stats.
**Tests:** pick-up record selection (50 m / 2 min window, several drivers recorded); **no user endpoint exposes pick-up records**; the pause threshold; banned users' sessions revoked.

## Phase 9: Testing & polish (M)
- E2E on 4 real phones (2 drivers, 2 passengers) in a real street.
- The 15 anti-abuse scenarios.
- Accessibility/RTL; crash monitoring (PII-scrubbed); backups + a restore drill; threshold tuning from field data.

## Phase 10: Launch (M)
INPDP declaration; Terms/Privacy (AR/FR) with clear location explanations; production VPS; Play listing (data safety, foreground-service location declaration); recruit and verify drivers in person in the launch area; iOS with Sign in with Apple in v1.0.
