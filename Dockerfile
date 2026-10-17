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
RUN npm ci --ignore-scripts

# Build the app (output: "standalone", traced from the monorepo root)
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Minimal runtime image
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/externaldata

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /externaldata && chown nextjs:nodejs /externaldata

COPY --from=builder --chown=nextjs:nodejs /app/packages/app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/packages/app/.next/static ./packages/app/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/packages/app/public ./packages/app/public

USER nextjs
EXPOSE 3000
CMD ["node", "packages/app/server.js"]
