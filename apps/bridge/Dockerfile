# Production image for the home bridge service.
# Build from the monorepo root: docker build -f apps/bridge/Dockerfile -t print-queue-bridge .

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

# pnpm needs every workspace member's package.json present to resolve the
# lockfile correctly, even though --filter only installs bridge + its deps.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/bridge/package.json apps/bridge/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter bridge...

FROM base AS build
COPY --from=deps /app /app
COPY packages/shared packages/shared
COPY apps/bridge apps/bridge
COPY tsconfig.base.json tsconfig.base.json
RUN pnpm --filter @print-queue/shared build && pnpm --filter bridge build

FROM node:22-slim AS runner
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
RUN useradd --create-home --shell /bin/bash bridge
COPY --from=build /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/bridge/package.json apps/bridge/package.json
COPY --from=build /app/apps/bridge/dist apps/bridge/dist
COPY --from=build /app/apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --prod --filter bridge...
RUN mkdir -p /app/apps/bridge/tmp && chown -R bridge:bridge /app
USER bridge
WORKDIR /app/apps/bridge
VOLUME ["/app/apps/bridge/tmp"]
ENTRYPOINT ["node", "dist/index.js"]
