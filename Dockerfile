# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
WORKDIR /app

# Install dependencies (workspace manifests first, for layer caching)
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/app/package.json packages/app/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/ui/package.json packages/ui/
# --ignore-scripts: better-sqlite3 ships prebuilt binaries (incl. musl) and picks one at runtime;
# without it npm runs node-gyp, which needs a compiler toolchain.
# One ECONNRESET from the registry outlasted npm's default 2 retries and failed a deploy, so retry
# each request 5 times, waiting 20 s to 2 min between tries.
ENV NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
RUN npm ci --ignore-scripts

# Build the app (output: "standalone", traced from the monorepo root)
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Minimal runtime image
FROM base AS runner
# KEEP_ALIVE_TIMEOUT: how long server.js keeps an idle connection open, in ms (Node's default is 5 s).
# kamal-proxy never closes its idle connections to the app, so the app does. While a realistic Test reset
# blocks the event loop, kamal-proxy can send a request on a connection whose 5 s timer then fires before
# the server reads it, and the server closes it: a POST answers 502 (#185). An hour keeps that timer clear
# of any reset, for at most kamal-proxy's 100 idle connections.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/externaldata \
    KEEP_ALIVE_TIMEOUT=3600000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /externaldata && chown nextjs:nodejs /externaldata

COPY --from=builder --chown=nextjs:nodejs /app/packages/app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/packages/app/.next/static ./packages/app/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/packages/app/public ./packages/app/public

USER nextjs
EXPOSE 3000
CMD ["node", "packages/app/server.js"]
