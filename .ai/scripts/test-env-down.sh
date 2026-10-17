#!/bin/sh
# om-prepare-test-env: generated teardown (contract v2)
# history:
#   2026-10-17 generated: removes the container test-env-up.sh started for this checkout
#
# Stops only what test-env-up.sh started for the checkout it runs in. Safe to run twice.
set -eu

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/../.." && pwd))
cd "$ROOT"
QA_DIR=$(jq -r '.paths.qa // ".ai/qa"' .ai/agentic.config.json 2>/dev/null || echo ".ai/qa")
DESCRIPTOR="$QA_DIR/test-env.json"
CONTAINER="cpg-test-env-$(printf '%s' "$ROOT" | cksum | awk '{print $1}')"

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
if [ -f "$DESCRIPTOR" ]; then
  sed 's/"status": *"running"/"status": "stopped"/' "$DESCRIPTOR" > "$DESCRIPTOR.tmp" && mv "$DESCRIPTOR.tmp" "$DESCRIPTOR"
fi
echo "TEST_ENV_STATUS=stopped"
