# syntax=docker/dockerfile:1
#
# One image for both Rumpty Cloud Web Service deployments (kora-api and
# demo-service). The deployment chooses the process with its start command:
#   node apps/api/dist/server.js            (default)
#   node apps/demo-service/dist/server.js
# The platform injects PORT; both servers read it and bind 0.0.0.0.
# No secrets are baked in: configuration is runtime environment only.

ARG NODE_VERSION=22.22.0

# ---- manifests: the only inputs that decide the dependency layers ----------
FROM node:${NODE_VERSION}-bookworm-slim AS manifests
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/demo-service/package.json apps/demo-service/package.json
COPY packages/event-schema/package.json packages/event-schema/package.json
COPY packages/topology/package.json packages/topology/package.json
COPY services/incident-engine/package.json services/incident-engine/package.json

# ---- build: full workspace install (frozen lockfile) and compile -----------
FROM manifests AS build
RUN corepack enable
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY apps apps
COPY packages packages
COPY services services
RUN pnpm -r build

# ---- deps: production dependencies only (frozen lockfile) ------------------
FROM manifests AS deps
RUN corepack enable
RUN pnpm install --frozen-lockfile --prod

# ---- runtime ---------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app /app
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/demo-service/dist apps/demo-service/dist
COPY --from=build /app/packages/event-schema/dist packages/event-schema/dist
COPY --from=build /app/packages/topology/dist packages/topology/dist
COPY --from=build /app/services/incident-engine/dist services/incident-engine/dist
# tsc does not copy SQL: lets `node apps/api/dist/db/migrate.js` run in-image.
COPY apps/api/src/db/migrations apps/api/dist/db/migrations
USER node
# Documentation only; the platform routes to its Port setting (default 8080).
EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
