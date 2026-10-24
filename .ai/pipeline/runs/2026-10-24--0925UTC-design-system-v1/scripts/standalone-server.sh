#!/usr/bin/env bash
# Starts the production standalone build on a port for the integration suite and the browser QA
# (lesson 2026-10-23: Docker is unavailable here). Usage: standalone-server.sh <port> [--build]
# Copies .next/standalone into a NEW empty directory (never reuse: Next's route cache would keep
# stale 404s), adds .next/static and public, starts node server.js with a fresh DATA_DIR,
# CPG_ADMIN_PASSWORD and the image's KEEP_ALIVE_TIMEOUT, and waits for /up.
set -euo pipefail
PORT="${1:?port}"
REPO="$(cd "$(dirname "$0")/../../../../.." && pwd)"
if [ "${2:-}" = "--build" ]; then (cd "$REPO" && npm run build > /tmp/standalone-build-$PORT.log 2>&1; echo "build exit=$?"); fi
RUN_DIR="$(mktemp -d /tmp/cpg-standalone-$PORT.XXXXXX)"
cp -R "$REPO/packages/app/.next/standalone/." "$RUN_DIR/"
mkdir -p "$RUN_DIR/packages/app/.next"
cp -R "$REPO/packages/app/.next/static" "$RUN_DIR/packages/app/.next/static"
cp -R "$REPO/packages/app/public" "$RUN_DIR/packages/app/public"
export DATA_DIR="$(mktemp -d /tmp/cpg-data-$PORT.XXXXXX)"
export CPG_ADMIN_PASSWORD="${CPG_ADMIN_PASSWORD:-integration-admin-password}"
export KEEP_ALIVE_TIMEOUT=3600000
export PORT HOSTNAME=127.0.0.1 NODE_ENV=production
(cd "$RUN_DIR" && nohup node packages/app/server.js > "/tmp/cpg-standalone-$PORT.log" 2>&1 &)
for i in $(seq 1 120); do
  if curl -fsS "http://127.0.0.1:$PORT/up" > /dev/null 2>&1; then echo "up on http://localhost:$PORT (run dir $RUN_DIR, data $DATA_DIR, log /tmp/cpg-standalone-$PORT.log)"; exit 0; fi
  sleep 1
done
echo "server did not answer /up within 120 s; see /tmp/cpg-standalone-$PORT.log" >&2
exit 1
