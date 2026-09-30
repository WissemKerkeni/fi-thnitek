# transport-tunisia (codename "Mechwar" · مشوار)

**A shared live map of Tunisian transport. Passengers show where they're going; the first driver to arrive picks them up.**

- Verified **taxi, louage and bus** drivers appear on the map, **with their name**, **while they share their location**. Sharing is required for live driver features. Drivers see each other, can mark themselves **Full**, and can take a **30 min / 1 h / 2 h break**. Any other stop means they can't restart for **1 hour**.
- Drivers can publish **routine routes** in advance (e.g. "Tunis → Sousse, weekdays 07:00").
- A passenger looking for a **taxi or louage** posts **one** request (destination, seats), **anonymous by default** (they can choose to show their name and a note). They appear on the map until they **move more than 20 m** (picked up or gone), stop sending location for 5 min, or 60 min pass.
- **No assignment, no booking, no chat, no payments.** Free and non-commercial.
- Bus passengers don't request or share location; they just see buses on the map.
- Everyone signs in with **Google**. Drivers are verified by an admin in the web admin and get a push notification when approved.

> Status: planning (v3). No application code yet.

## Documentation
| Doc | What's inside |
|---|---|
| [docs/product-plan.md](docs/product-plan.md) | **Start here.** Rules of the system, lifecycles, visibility, risks |
| [docs/product-requirements.md](docs/product-requirements.md) | Requirements (`R-xxx`), releases, admin web app |
| [docs/ux.md](docs/ux.md) | 6 passenger + 5 driver screens |
| [docs/architecture.md](docs/architecture.md) | Stack, location rules (20 m, cooldown, gaps), map endpoint, finder, capacity |
| [docs/domain-model.md](docs/domain-model.md) | Tables, state machines, invariants, thresholds, retention |
| [docs/security.md](docs/security.md) | Auth, the location privacy model, legal vs best practice |
| [docs/anti-abuse.md](docs/anti-abuse.md) | Rules, automatic actions, 15 scenarios |
| [docs/roadmap.md](docs/roadmap.md) | Phases 0–10 |
| [docs/decisions.md](docs/decisions.md) | Decision records |
| [docs/research-tunisia.md](docs/research-tunisia.md) · [docs/competitors.md](docs/competitors.md) | Sourced Tunisian context |
| [docs/claude-code-first-prompt.md](docs/claude-code-first-prompt.md) | The first prompt for Claude Code |
| [docs/archive/](docs/archive/) | Earlier plan versions (v1, v2) |

## Stack
Expo (React Native, TS) + MapLibre + expo-location foreground services · NestJS REST + `@nestjs/schedule` · PostgreSQL 16 + PostGIS (Drizzle) · MinIO · FCM · React + Vite + Refine admin · Docker Compose on one VPS + Caddy (≈ €10–30/month).

## Repository structure (planned)
```text
transport-tunisia/
├── apps/
│   ├── mobile/          # Expo: passenger mode + driver mode (driver-only accounts)
│   │   ├── app/         # expo-router: (auth)/ (passenger)/ (driver)/
│   │   └── src/         # features/ (auth, map, finder, request, sharing, verification, history, safety),
│   │                    # lib/ (api, location-service, push, i18n), ui/
│   ├── api/             # NestJS
│   │   ├── src/modules/ # auth, users, places, verification, sharing (full, breaks), routines, requests,
│   │   │                # location, map, finder, pickups (admin-only), moderation, notifications, admin, audit
│   │   ├── src/jobs/    # 30 s rule sweeps, reminders, purges
│   │   ├── db/          # drizzle schema, migrations, seeds
│   │   └── test/
│   └── admin/           # React + Vite + Refine
├── packages/
│   ├── contracts/       # Zod schemas & types
│   ├── domain/          # pure logic: request rules (20 m), session/cooldown/gap rules, visibility, finder geometry
│   ├── i18n/            # ar / fr
│   └── config/
├── data/places/         # places dataset with provenance
├── infrastructure/      # docker/, compose/, caddy/, backups/
├── docs/
├── CLAUDE.md
└── README.md
```

## Non-negotiables
1. No assignment; one open request per passenger; requests only for taxi/louage.
2. Driver features only while sharing; 1 h cooldown after any stop.
3. Passenger location only while their request is open; the request closes at > 20 m.
4. Exact passenger positions only to sharing taxi/louage drivers of a matching type; passengers anonymous by default; driver names always shown; pick-up records admin-only; no location history.
5. Free, non-commercial; verified drivers only.
