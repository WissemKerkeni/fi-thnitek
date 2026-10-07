# CLAUDE.md: working conventions

## Read first
- Rules of the system: `docs/product-plan.md §2` (binding)
- Requirements: `docs/product-requirements.md` (`R-xxx`)
- Architecture & location rules: `docs/architecture.md §4–5`
- Data, state machines, thresholds: `docs/domain-model.md`
- Privacy: `docs/security.md` · Trust: `docs/anti-abuse.md` · Phases: `docs/roadmap.md`
- Decisions: `docs/decisions.md` (current ADRs are binding; `docs/archive/` is history only)

## Stack
pnpm + Turborepo · TypeScript strict · NestJS REST `/v1` + `@nestjs/schedule` · Drizzle + PostgreSQL/PostGIS · Expo (dev builds) + expo-router + MapLibre + expo-location · React + Vite + Refine admin · Zod contracts in `packages/contracts` · pure logic in `packages/domain`.

## Rules
1. Keep it simple: no websockets, Redis, queues, BaaS or n8n in the core without a new ADR.
2. Contracts first, then the endpoint, then the screen.
3. The location rule engines (the passenger 20 m / 5 min / anchor rules; driver session, cooldown and gap detection) and the map visibility serialisation are **pure functions in `packages/domain`** with exhaustive unit tests. The API applies them.
4. Thresholds come from config (`docs/domain-model.md §3`), never literals scattered in code.
5. State transitions use conditional updates in a transaction; admin actions write `audit_logs`.
6. Invariants that must have tests (`docs/domain-model.md §2`):
   - One open request per passenger; no bus requests; verified drivers can't request.
   - Driver endpoints return 403 `SHARING_REQUIRED` without an active session and a fresh fix.
   - No restart during the cooldown.
   - Exact passenger coordinates only for sharing (not on break) taxi/louage drivers of a matching type; passenger name/note only when `show_identity = true`; driver name always present.
   - `pickup_records` never exposed by user endpoints (admin-only, audited).
   - A driver on a break stays on the map frozen and marked, can resume at any time and resumes by itself at the end; fixes during a break are discarded; Full/Break don't trigger the cooldown (ADR-227).
   - Latest-point-only storage (no location history).
   - Pings outside an active mode → `stop:true`, nothing stored.
7. Tracking (continuous location) only inside user-started foreground services with a visible notification; never add `ACCESS_BACKGROUND_LOCATION`. One-shot foreground reads to centre the map and measure distances are allowed but never stored or logged; the position leaves the phone only as `near` in a request body (ADR-224).
8. No PII or coordinates in logs, push payloads or URLs.
9. i18n ar + fr + en (same keys and placeholders, tested), RTL-safe layouts. IDs are UUIDv7; timestamps UTC; migrations via drizzle-kit, never edited after merge.
10. Tests: Vitest (domain), Testcontainers PostGIS (API integration), authz/serialisation tests for every endpoint returning user or location data.
