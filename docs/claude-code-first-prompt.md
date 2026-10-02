# First Claude Code prompt

Run it from the repo root, **in plan mode first**, after Phase 0 has produced the launch-city places data (Phase 1 doesn't strictly need it).

```text
You are implementing Phase 1 (Foundation) of the Fi thnitek project.

Read fully before planning (they are the source of truth):
- CLAUDE.md
- README.md (planned repository structure)
- docs/decisions.md (current ADRs are binding; ignore docs/archive/)
- docs/architecture.md (sections 1, 2, 7, 9)
- docs/domain-model.md (sections 1–3; only to shape the schemas/folders and the config module, don't create feature tables yet)
- docs/roadmap.md (Phase 1)

Goal: a clean, production-grade monorepo skeleton. No product features yet: no auth, no posts, no matching.

Deliver:
1. pnpm workspaces + Turborepo; TypeScript strict; packages/config (tsconfig base, eslint flat config,
   prettier); Node 22 LTS pinned (.nvmrc, engines).
2. packages/contracts: Zod set-up, a ProblemDetails (RFC 9457) error schema, an error-code enum, and a health
   response schema.
3. packages/domain: folder layout (state-machines/, request-rules/, sharing-rules/, visibility/, finder/, config/)
   + ONE real, tested utility: a generic finite-state-machine helper (define transitions; assertTransition throws
   a typed error) + a typed thresholds config object with the defaults from docs/domain-model.md §3. Vitest.
4. packages/i18n: ar + fr catalogs with typed keys.
5. apps/api (NestJS): Zod-validated env config (fail fast); pino logging with redaction of email, name, lat,
   lng, cin, phone; a global ProblemDetails exception filter; a Zod validation pipe; Drizzle + PostgreSQL/PostGIS
   with the first migration enabling postgis, unaccent and pg_trgm and creating audit.audit_logs (insert-only
   DB role); @nestjs/schedule wired with a no-op job; GET /v1/health (checks DB); OpenAPI at /v1/docs in dev;
   an integration test with Testcontainers (postgis image) for migrations + health.
6. apps/mobile (Expo, TS, expo-router, EAS dev-build profile): i18n with an RTL switch, a language picker
   screen, theme tokens (≥48dp targets, ≥16sp body), RTL-safe Button/Screen components, an API client that
   calls /v1/health and displays the result, and a MapLibre base map screen (OpenFreeMap style, centred on
   Tunis). No Google Sign-In and no location tracking yet.
7. apps/admin (Vite + React + Refine): a shell with a placeholder login and a dashboard calling /v1/health.
8. infrastructure/compose/docker-compose.dev.yml: postgis 16, minio (+ init container creating a private
   bucket), api (watch), admin; a multi-stage non-root api Dockerfile; .env.example per app; no secrets.
9. GitHub Actions CI: install (pnpm cache) → lint → typecheck → unit → integration → build the api image.
10. Root scripts: dev, build, lint, typecheck, test, test:int, and api db:generate / db:migrate / db:seed.
11. Record any new decisions (exact library versions or choices) as ADRs in docs/decisions.md.

Rules:
- Plan first: list the files you will create and any open questions, then wait for my approval.
- Use current stable versions and verify compatibility (Expo SDK ↔ React Native ↔ React; NestJS ↔ Drizzle).
- Small logical commits; don't push.
- At the end, run lint, typecheck and all tests, and report the results honestly (including anything broken).
```

## Next phases (same pattern)
> "Implement Phase N from docs/roadmap.md. Read CLAUDE.md, the current ADRs, and requirements R-aaa…R-bbb. Write the domain tests first. Plan first, then implement. Report the test results honestly."

| Phase | Requirements |
|---|---|
| 2 Google auth | R-001…R-005 |
| 3 Driver verification + admin review | R-060…R-064, PRD §6 (verification) |
| 4 Places & map base | R-010, R-011, R-020 (shell) |
| 5 Driver sharing (+ Full, breaks, cooldown) | R-050…R-059, architecture §4.1–4.2, §4.4 |
| 5c Routine routes | R-065…R-068 |
| 6 Passenger request | R-030…R-041, architecture §4.3 |
| 7 Live map & finder | R-020…R-027, R-045, R-046, architecture §5 |
| 8 Safety & moderation | R-039, R-040, R-042, R-070…R-073, PRD §6 (pick-up history), anti-abuse §3 |
