# syntax=docker/dockerfile:1.7
# Development image for the admin web app (docker-compose.dev.yml). Production serves the static build.
ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS dev
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
COPY packages/i18n/package.json packages/i18n/
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/mobile/package.json apps/mobile/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@fi-thnitek/admin..."
COPY packages packages
COPY apps/admin apps/admin
RUN pnpm --filter "@fi-thnitek/admin^..." run build
WORKDIR /repo/apps/admin
EXPOSE 5173
CMD ["pnpm", "exec", "vite", "--host", "0.0.0.0"]
