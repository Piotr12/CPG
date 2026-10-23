// The image's `npm ci` must ride out a flaky registry: one ECONNRESET outlasted npm's default 2
// retries and failed a deploy whose checks had all passed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";

const dockerfile = readFileSync(join(import.meta.dirname, "..", "Dockerfile"), "utf8");

/** The stage that runs `npm ci`, from its `FROM` up to the next one. */
function depsStage(): string {
  const stage = dockerfile.split(/^FROM /m).find((candidate) => /^RUN npm ci\b/m.test(candidate));
  assert.ok(stage, "no Dockerfile stage runs npm ci");
  return stage;
}

function npmSetting(name: string): number {
  const value = new RegExp(`\\b${name}=(\\d+)`).exec(depsStage())?.[1];
  assert.ok(value, `the npm ci stage does not set ${name}`);
  return Number(value);
}

test("npm ci retries each registry request at least 5 times", () => {
  assert.ok(npmSetting("NPM_CONFIG_FETCH_RETRIES") >= 5);
});

test("npm ci waits longer than npm's defaults between retries", () => {
  assert.ok(npmSetting("NPM_CONFIG_FETCH_RETRY_MINTIMEOUT") > 10_000);
  assert.ok(npmSetting("NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT") > 60_000);
});
