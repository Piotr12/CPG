// Enforces the `.ai/` naming convention from AGENTS.md: every file in specs/, runs/
// and lessons/ (except README.md) is named YYYY-MM-DD--HHMMUTC-slug.md, and so is every
// run in pipeline/runs/ (a flat plan, or a folder named like one without `.md`).
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "vitest";
import { activeCopies, isValidName } from "../scripts/spec-copies";

const repoRoot = join(import.meta.dirname, "..");
const folders = ["specs", "runs", "lessons"].map((name) => join(repoRoot, ".ai", name));
const pipelineRuns = join(repoRoot, ".ai", "pipeline", "runs");

// Files the om-* pipeline skills keep in specs/ under fixed names: om-discover's product brief,
// om-backlog's backlog, spec evidence (assets/) and synthetic-user research (research/).
const PIPELINE_FILES = /^\.ai\/specs\/(?:(?:product-brief|backlog)\.md|(?:assets|research)\/.+)$/;

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

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

// A spec lives in one place: `specs/` while active, then `implemented/` or `archive/`. A spec PR's squash merge can
// re-add the active copy after its implementation PR moved it (#274, #351). On main, spec-copies.yml deletes such a
// copy with the same rule (scripts/spec-copies.ts); here the PR's merge with main must not hold one.
test("a spec is never active and implemented or archived at once", () => {
  const twice = activeCopies(join(repoRoot, ".ai", "specs")).map((name) => `.ai/specs/${name}`);

  assert.deepEqual(twice, [], `Delete the active copy of these specs from .ai/specs/:\n${twice.join("\n")}`);
});
