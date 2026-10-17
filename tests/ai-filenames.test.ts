// Enforces the `.ai/` naming convention from AGENTS.md: every file in specs/, runs/
// and lessons/ (except README.md) is named YYYY-MM-DD--HHMMUTC-slug.md.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "vitest";

const repoRoot = join(import.meta.dirname, "..");
const folders = ["specs", "runs", "lessons"].map((name) => join(repoRoot, ".ai", name));

const NAME = /^(\d{4})-(\d{2})-(\d{2})--(\d{2})(\d{2})UTC-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

// The regex only checks shape; this rejects e.g. 2026-02-30 or 2460UTC.
function isRealTimestamp([, year, month, day, hour, minute]: RegExpExecArray): boolean {
  const date = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute));
  return (
    date.getUTCFullYear() === +year &&
    date.getUTCMonth() === +month - 1 &&
    date.getUTCDate() === +day &&
    date.getUTCHours() === +hour &&
    date.getUTCMinutes() === +minute
  );
}

function isValidName(fileName: string): boolean {
  const match = NAME.exec(fileName);
  return match !== null && isRealTimestamp(match);
}

test("the name check accepts the new format and rejects the old one", () => {
  assert.ok(isValidName("2026-10-17--1432UTC-user-login.md"));
  assert.ok(isValidName("2026-10-17--0005UTC-user-login-2.md"));
  assert.ok(!isValidName("2026-10-17-user-login.md"));
  assert.ok(!isValidName("2026-10-17--1432-user-login.md"));
  assert.ok(!isValidName("2026-10-17--2460UTC-user-login.md"));
  assert.ok(!isValidName("2026-02-30--1432UTC-user-login.md"));
  assert.ok(!isValidName("2026-10-17--1432UTC-User_Login.md"));
});

test(".ai/ files are named YYYY-MM-DD--HHMMUTC-slug.md", () => {
  const offenders = folders
    .flatMap(listFiles)
    .map((path) => relative(repoRoot, path))
    .filter((path) => !path.endsWith("/README.md") && !isValidName(path.split("/").at(-1)!));

  assert.deepEqual(
    offenders,
    [],
    `Rename these to YYYY-MM-DD--HHMMUTC-slug.md (creation time in UTC, see AGENTS.md):\n${offenders.join("\n")}`,
  );
});
