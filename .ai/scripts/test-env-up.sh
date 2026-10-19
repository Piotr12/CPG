#!/bin/sh
# om-prepare-test-env: generated entrypoint (contract v2)
# regenerate with: om-prepare-test-env --regenerate
# history:
#   2026-10-17 generated: docker mode (production image, like tests/integration), no backing services
#   2026-10-17 repair: find agent-browser in the main checkout too (om-* worktrees have no node_modules; reported BROWSER_INSTALLED=0)
#   2026-10-17 repair: refresh the descriptor's browser entry on reuse (a reused env kept stale browser state)
#   2026-10-19 repair: pass CPG_ADMIN_PASSWORD (the app refuses to start without it) and record it as the admin credential
#
# Boots the checkout you run it from (main checkout or an om-* worktree) as the production Docker
# image on 127.0.0.1 with a throwaway SQLite data dir, and writes <paths.qa>/test-env.json.
# Usage: sh .ai/scripts/test-env-up.sh [--force] [--force-rebuild]
set -eu

# --- project-specific variables (discovered 2026-10-17) ---
IMAGE_REPO="cpg-test-env"                # local image name; tag = source fingerprint
CONTAINER_PREFIX="cpg-test-env"          # container = prefix + checkout hash, so checkouts never collide
APP_PORT=3000                            # Dockerfile EXPOSE
PREFERRED_PORT=3210                      # used when free, otherwise a free port is picked
HEALTH_PATH="/up"                        # answers "OK" only after a database round trip
BUILD_INPUTS="packages package.json package-lock.json Dockerfile .dockerignore tsconfig.base.json"
TTL_SECONDS="${TEST_ENV_CACHE_TTL_SECONDS:-600}"
LOCK_WAIT_SECONDS=300
HEALTH_WAIT_SECONDS=120
# Built-in admin of the throwaway QA container only; the server needs 12+ characters.
TEST_ADMIN_PASSWORD="qa-test-env-admin-password"

FORCE=0; FORCE_REBUILD=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --force-rebuild) FORCE=1; FORCE_REBUILD=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# The project root is the checkout the command runs in, so a worktree tests its own code.
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/../.." && pwd))
cd "$ROOT"
QA_DIR=$(jq -r '.paths.qa // ".ai/qa"' .ai/agentic.config.json 2>/dev/null || echo ".ai/qa")
DESCRIPTOR="$QA_DIR/test-env.json"
BUILD_CACHE="$QA_DIR/test-env-build-cache.json"
CREDENTIALS_FILE="$QA_DIR/test-env.env"
LOCK_DIR="$QA_DIR/test-env.lock"
mkdir -p "$QA_DIR"

command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 || { echo "TEST_ENV_STATUS=failed (docker is not running)" >&2; exit 1; }

ROOT_HASH=$(printf '%s' "$ROOT" | cksum | awk '{print $1}')
CONTAINER="$CONTAINER_PREFIX-$ROOT_HASH"

json_get() { sed -n "s/.*\"$1\": *\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p" "$2" 2>/dev/null | head -n1; }

# --- lock: one bootstrap at a time ---
acquire_lock() {
  waited=0
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    owner=$(json_get pid "$LOCK_DIR/owner.json")
    if [ -z "$owner" ] || ! kill -0 "$owner" 2>/dev/null; then rm -rf "$LOCK_DIR"; continue; fi
    [ "$waited" -ge "$LOCK_WAIT_SECONDS" ] && { echo "TEST_ENV_STATUS=failed (lock held by pid $owner)" >&2; exit 1; }
    sleep 2; waited=$((waited + 2))
  done
  printf '{ "pid": %s, "source": "test-env-up.sh", "acquiredAt": "%s" }\n' "$$" "$(date -u +%FT%TZ)" > "$LOCK_DIR/owner.json"
  trap 'rm -rf "$LOCK_DIR"' EXIT INT TERM
}

# --- build cache: fingerprint the image inputs (path:size:mtime) ---
fp_file() { stat -f '%z:%m' "$1" 2>/dev/null || stat -c '%s:%Y' "$1" 2>/dev/null; }
fingerprint() {
  for p in $BUILD_INPUTS; do
    if [ -d "$p" ]; then
      find "$p" -type f ! -path '*/node_modules/*' ! -path '*/.next/*' ! -path '*/coverage/*' ! -name '*.tsbuildinfo'
    elif [ -f "$p" ]; then echo "$p"; fi
  done | LC_ALL=C sort | while IFS= read -r f; do printf '%s:%s\n' "$f" "$(fp_file "$f")"; done | cksum | awk '{print $1"-"$2}'
}

probe() { [ "$(curl -fsS --max-time 5 "$1$HEALTH_PATH" 2>/dev/null)" = "OK" ]; }

free_port() {
  if ! (lsof -nP -iTCP:"$PREFERRED_PORT" -sTCP:LISTEN >/dev/null 2>&1); then echo "$PREFERRED_PORT"; return; fi
  node -e 's=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
}

browser_state() {
  # PATH first, then this checkout's devDependency, then the main checkout's (om-* worktrees have no node_modules).
  MAIN_ROOT=$(cd "$(git rev-parse --git-common-dir 2>/dev/null || echo .git)/.." 2>/dev/null && pwd)
  B=""
  for c in "$(command -v agent-browser 2>/dev/null || true)" "$ROOT/node_modules/.bin/agent-browser" "$MAIN_ROOT/node_modules/.bin/agent-browser"; do
    [ -n "$c" ] && [ -x "$c" ] && { B="$c"; break; }
  done
  if [ -n "$B" ] && V=$("$B" --version 2>/dev/null); then
    BROWSER_INSTALLED=true; BROWSER_COMMAND="$B"; BROWSER_VERSION=$(echo "$V" | awk '{print $NF}')
  else
    BROWSER_INSTALLED=false; BROWSER_COMMAND=""; BROWSER_VERSION=unknown
  fi
}

browser_json() {
  printf '  "browser": { "provider": "agent-browser", "installed": %s, "command": "%s", "version": "%s", "descriptor": ".ai/browsers/agent-browser.md", "notes": "repo devDependency; run npx agent-browser install once per machine" },' \
    "$BROWSER_INSTALLED" "$BROWSER_COMMAND" "$BROWSER_VERSION"
}

FP=$(fingerprint)
IMAGE="$IMAGE_REPO:$FP"

# --- reuse check: attach, don't reboot ---
if [ "$FORCE" = 0 ] && [ "$(json_get status "$DESCRIPTOR")" = running ]; then
  URL=$(json_get baseUrl "$DESCRIPTOR")
  RUNNING=$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || echo false)
  STARTED=$(json_get startedEpoch "$DESCRIPTOR"); NOW=$(date +%s)
  if [ "$RUNNING" = true ] && probe "$URL" && [ "$(json_get sourceFingerprint "$DESCRIPTOR")" = "$FP" ] \
     && [ -n "$STARTED" ] && [ $((NOW - STARTED)) -lt "$TTL_SECONDS" ]; then
    browser_state
    LINE=$(browser_json)
    awk -v line="$LINE" '/^  "browser":/ { print line; next } { print }' "$DESCRIPTOR" > "$DESCRIPTOR.tmp" && mv "$DESCRIPTOR.tmp" "$DESCRIPTOR"
    printf 'TEST_ENV_STATUS=running\nTEST_ENV_BASE_URL=%s\nTEST_ENV_DESCRIPTOR=%s\nTEST_ENV_REUSED=1\nBROWSER_PROVIDER=agent-browser\nBROWSER_INSTALLED=%s\n' \
      "$URL" "$DESCRIPTOR" "$([ "$BROWSER_INSTALLED" = true ] && echo 1 || echo 0)"
    exit 0
  fi
fi

acquire_lock
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

# --- build: the image tag is the fingerprint, so an unchanged checkout skips the build ---
if [ "$FORCE_REBUILD" = 1 ] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "building $IMAGE (fingerprint changed or --force-rebuild)" >&2
  docker build -q -t "$IMAGE" . >/dev/null
  printf '{ "builtAt": "%s", "sourceFingerprint": "%s", "projectRoot": "%s", "artifactPaths": "docker image %s" }\n' \
    "$(date -u +%FT%TZ)" "$FP" "$ROOT" "$IMAGE" > "$BUILD_CACHE"
fi

# --- app start + health wait (fresh SQLite inside the throwaway container) ---
PORT=$(free_port)
docker run -d --rm --name "$CONTAINER" -e CPG_ADMIN_PASSWORD="$TEST_ADMIN_PASSWORD" -p "127.0.0.1:$PORT:$APP_PORT" "$IMAGE" >/dev/null
BASE_URL="http://127.0.0.1:$PORT"
waited=0
until probe "$BASE_URL"; do
  if [ "$waited" -ge "$HEALTH_WAIT_SECONDS" ] || [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != true ]; then
    docker logs "$CONTAINER" 2>&1 | tail -20 >&2 || true
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    echo "TEST_ENV_STATUS=failed (no OK from $BASE_URL$HEALTH_PATH)" >&2; exit 1
  fi
  sleep 1; waited=$((waited + 1))
done

# --- descriptor + output ---
browser_state
printf '# Built-in admin of the throwaway test container (sign in at /login as admin).\nTEST_ADMIN_USERNAME=admin\nTEST_ADMIN_PASSWORD=%s\n' "$TEST_ADMIN_PASSWORD" > "$CREDENTIALS_FILE"
case "$(uname -s)" in Darwin*) PLATFORM=darwin ;; Linux*) PLATFORM=linux ;; *) PLATFORM=win32 ;; esac
RUN_ID="$(date -u +%Y%m%d%H%M%S)-$ROOT_HASH"
cat > "$DESCRIPTOR" <<EOF
{
  "version": 1,
  "runId": "$RUN_ID",
  "status": "running",
  "mode": "docker",
  "baseUrl": "$BASE_URL",
  "startedByThisRepo": true,
  "startScript": ".ai/scripts/test-env-up.sh",
  "stopScript": ".ai/scripts/test-env-down.sh",
  "app": { "startCommand": "docker run $IMAGE", "port": $PORT, "healthPath": "$HEALTH_PATH", "container": "$CONTAINER" },
  "services": [],
  "credentials": [{ "role": "admin", "username": "admin", "passwordEnv": "TEST_ADMIN_PASSWORD" }],
  "credentialsFile": "$CREDENTIALS_FILE",
$(browser_json)
  "testRunner": { "name": "other", "config": "vitest.integration.config.mts" },
  "platform": "$PLATFORM",
  "startedAt": "$(date -u +%FT%TZ)",
  "startedEpoch": "$(date +%s)",
  "sourceFingerprint": "$FP",
  "notes": "Production image from this checkout's Dockerfile; SQLite lives inside the --rm container and is fresh on every boot (migrated at startup). Sign in at /login as admin (password in the credentials file); no seeded data. Stop with sh .ai/scripts/test-env-down.sh."
}
EOF
printf 'TEST_ENV_STATUS=running\nTEST_ENV_BASE_URL=%s\nTEST_ENV_DESCRIPTOR=%s\nTEST_ENV_REUSED=0\nBROWSER_PROVIDER=agent-browser\nBROWSER_INSTALLED=%s\n' \
  "$BASE_URL" "$DESCRIPTOR" "$([ "$BROWSER_INSTALLED" = true ] && echo 1 || echo 0)"
