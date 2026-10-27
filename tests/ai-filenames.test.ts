// Enforces the `.ai/` naming convention from AGENTS.md: every file in specs/, runs/
// and lessons/ (except README.md) is named YYYY-MM-DD--HHMMUTC-slug.md, and so is every
// run in pipeline/runs/ (a flat plan, or a folder named like one without `.md`).
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "vitest";

const repoRoot = join(import.meta.dirname, "..");
const folders = ["specs", "runs", "lessons"].map((name) => join(repoRoot, ".ai", name));
const pipelineRuns = join(repoRoot, ".ai", "pipeline", "runs");

// Files the om-* pipeline skills keep in specs/ under fixed names: om-discover's product brief,
// om-backlog's backlog, spec evidence (assets/) and synthetic-user research (research/).
const PIPELINE_FILES = /^\.ai\/specs\/(?:(?:product-brief|backlog)\.md|(?:assets|research)\/.+)$/;

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

function isExempt(path: string): boolean {
  return path.endsWith("/README.md") || PIPELINE_FILES.test(path);
}

test("only README.md and the pipeline's fixed-name spec files are exempt", () => {
  assert.ok(isExempt(".ai/specs/implemented/README.md"));
  assert.ok(isExempt(".ai/specs/product-brief.md"));
  assert.ok(isExempt(".ai/specs/backlog.md"));
  assert.ok(isExempt(".ai/specs/assets/work-order-release/current-01-list.png"));
  assert.ok(isExempt(".ai/specs/research/personas.md"));
  assert.ok(!isExempt(".ai/specs/implemented/product-brief.md"));
  assert.ok(!isExempt(".ai/specs/briefs/lot-sizing.md"));
  assert.ok(!isExempt(".ai/runs/backlog.md"));
  assert.ok(!isExempt(".ai/specs/assets.md"));
});

test(".ai/ files are named YYYY-MM-DD--HHMMUTC-slug.md", () => {
  const offenders = folders
    .flatMap(listFiles)
    .map((path) => relative(repoRoot, path))
    .filter((path) => !isExempt(path) && !isValidName(path.split("/").at(-1)!));

  assert.deepEqual(
    offenders,
    [],
    `Rename these to YYYY-MM-DD--HHMMUTC-slug.md (creation time in UTC, see AGENTS.md):\n${offenders.join("\n")}`,
  );
});

test(".ai/pipeline/runs/ entries are named YYYY-MM-DD--HHMMUTC-slug", () => {
  const offenders = readdirSync(pipelineRuns, { withFileTypes: true })
    .filter((entry) => entry.name !== ".gitkeep")
    .filter((entry) => !isValidName(entry.isDirectory() ? `${entry.name}.md` : entry.name))
    .map((entry) => relative(repoRoot, join(pipelineRuns, entry.name)));

  assert.deepEqual(
    offenders,
    [],
    `Rename these to YYYY-MM-DD--HHMMUTC-slug (see .ai/skills/README.md):\n${offenders.join("\n")}`,
  );
});

// A spec lives in one place: `specs/` while active, then `implemented/` or `archive/`. Stacking an
// implementation PR on its squash-merged spec PR left #273's spec in both (#274).
test("a spec is never active and implemented or archived at once", () => {
  const specs = join(repoRoot, ".ai", "specs");
  const names = (folder: string) => readdirSync(join(specs, folder)).filter((name) => isValidName(name));
  const active = new Set(names("."));
  const twice = ["implemented", "archive"].flatMap((folder) => names(folder).filter((name) => active.has(name)).map((name) => `${folder}/${name}`));

  assert.deepEqual(twice, [], `Delete the active copy of these specs from .ai/specs/:\n${twice.join("\n")}`);
});
