// The shadcn CLI (`@cpg/ui`'s `npx shadcn add`) drags in express and ajv, which the app never runs,
// and `npm audit` flagged their body-parser 2.3.0 (GHSA-27r3-jxmh-p828) and fast-uri 3.1.8
// (GHSA-w74x-v6f9-j3xg, GHSA-wjr9-j795-jxcr and two low ones) (#202). The lockfile keeps every copy
// at or above the patched release, so a later dependency change can't quietly bring them back.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";

type Lockfile = { packages: Record<string, { version?: string }> };

const lockfile = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package-lock.json"), "utf8")) as Lockfile;

/** The first release of each package without the advisory, per the GitHub advisory database. */
const PATCHED: Record<string, string> = { "body-parser": "2.4.0", "fast-uri": "3.1.9" };

/** Every installed copy of a package: hoisted or nested under another package's node_modules. */
function versionsOf(name: string): string[] {
  return Object.entries(lockfile.packages)
    .filter(([location]) => location === `node_modules/${name}` || location.endsWith(`/node_modules/${name}`))
    .map(([, entry]) => entry.version ?? "");
}

function numbers(version: string): number[] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  assert.ok(match, `not a release version: "${version}"`);
  return match.slice(1).map(Number);
}

function atLeast(version: string, floor: string): boolean {
  const actual = numbers(version);
  const wanted = numbers(floor);
  const first = actual.findIndex((part, index) => part !== wanted[index]);
  return first === -1 || actual[first] > wanted[first];
}

test.each(Object.entries(PATCHED))("every lockfile copy of %s is at least %s", (name, floor) => {
  const versions = versionsOf(name);
  assert.ok(versions.length > 0, `${name} is no longer in the lockfile: drop it from PATCHED`);
  for (const version of versions) {
    assert.ok(atLeast(version, floor), `${name}@${version} still carries the advisory patched in ${floor}`);
  }
});
