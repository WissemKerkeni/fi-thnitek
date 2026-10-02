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
