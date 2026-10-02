# syntax=docker/dockerfile:1.7
# Build context: the repository root.
#   docker build -f infrastructure/docker/api.Dockerfile -t fi-thnitek-api .
ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# Manifests only, so dependency layers are cached until a package.json or the lockfile changes.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
COPY packages/i18n/package.json packages/i18n/
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/mobile/package.json apps/mobile/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@fi-thnitek/api..."

FROM deps AS source
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter "@fi-thnitek/api..." run build

# Used by docker-compose.dev.yml (Compose Watch syncs apps/api/src).
FROM source AS dev
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["pnpm", "run", "dev"]

# Production dependencies only, same pnpm layout.
FROM source AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    rm -rf node_modules packages/*/node_modules apps/*/node_modules \
 && pnpm install --frozen-lockfile --prod --offline --filter "@fi-thnitek/api..."

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prod-deps --chown=node:node /repo/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /repo/package.json ./
COPY --from=prod-deps --chown=node:node /repo/packages/contracts ./packages/contracts
COPY --from=prod-deps --chown=node:node /repo/packages/domain ./packages/domain
COPY --from=prod-deps --chown=node:node /repo/apps/api/package.json ./apps/api/package.json
COPY --from=prod-deps --chown=node:node /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps --chown=node:node /repo/apps/api/dist ./apps/api/dist
COPY --from=prod-deps --chown=node:node /repo/apps/api/drizzle ./apps/api/drizzle
WORKDIR /repo/apps/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Migrations run as a separate one-off: docker compose run --rm api node dist/db/migrate-cli.js
CMD ["node", "dist/main.js"]
