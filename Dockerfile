# syntax=docker/dockerfile:1
#
# One image for the Kora API (which also serves the web app) and the demo
# workload. The deployment chooses the process with its start command:
#   node apps/api/dist/server.js            (default)
#   node apps/site-host/dist/server.js      (independent customer-site runtime)
#   node apps/demo-service/dist/server.js
# The platform injects PORT. No secrets are baked in: runtime environment only.

ARG NODE_VERSION=22.22.0

FROM node:${NODE_VERSION}-bookworm-slim AS manifests
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/demo-service/package.json apps/demo-service/package.json
COPY apps/site-host/package.json apps/site-host/package.json
COPY packages/event-schema/package.json packages/event-schema/package.json
COPY packages/topology/package.json packages/topology/package.json
COPY packages/runtime-claim/package.json packages/runtime-claim/package.json
COPY packages/passport/package.json packages/passport/package.json
COPY packages/site-schema/package.json packages/site-schema/package.json
COPY packages/site-serving/package.json packages/site-serving/package.json
COPY services/incident-engine/package.json services/incident-engine/package.json
COPY services/reasoner/package.json services/reasoner/package.json
COPY services/policy-engine/package.json services/policy-engine/package.json
COPY services/action-executor/package.json services/action-executor/package.json

FROM manifests AS build
RUN corepack enable
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY apps apps
COPY packages packages
COPY services services
RUN pnpm -r build

ARG GIT_SHA=""
COPY package.json .git* ./gitctx/
RUN node packages/runtime-claim/dist/write-build-info.js \
    --git-dir gitctx --out build-info.json

FROM manifests AS deps
RUN corepack enable
RUN pnpm install --frozen-lockfile --prod

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app /app
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/apps/demo-service/dist apps/demo-service/dist
COPY --from=build /app/apps/site-host/dist apps/site-host/dist
COPY --from=build /app/packages/event-schema/dist packages/event-schema/dist
COPY --from=build /app/packages/topology/dist packages/topology/dist
COPY --from=build /app/packages/runtime-claim/dist packages/runtime-claim/dist
COPY --from=build /app/packages/passport/dist packages/passport/dist
COPY --from=build /app/packages/site-schema/dist packages/site-schema/dist
COPY --from=build /app/packages/site-serving/dist packages/site-serving/dist
COPY --from=build /app/services/incident-engine/dist services/incident-engine/dist
COPY --from=build /app/services/reasoner/dist services/reasoner/dist
COPY --from=build /app/services/policy-engine/dist services/policy-engine/dist
COPY --from=build /app/services/action-executor/dist services/action-executor/dist
COPY --from=build /app/build-info.json build-info.json
USER node
EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
