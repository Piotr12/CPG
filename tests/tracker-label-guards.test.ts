// The tracker descriptor's label guards must find a defined label under `set -o pipefail` (#216).
// `label_exists` piped the paginated label listing into `grep -q`, which exits at the first match;
// the listing, still writing, then died of a broken pipe, which `pipefail` made the pipeline's
// status, so the guards skipped labels that exist. These tests run the guards as the descriptor
// defines them, in bash with `pipefail`, against a fake `gh` whose listing is long enough to still
// be writing when an early match is found.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, test } from "vitest";

const descriptor = readFileSync(join(import.meta.dirname, "..", ".ai", "trackers", "github.md"), "utf8");

/** The first `bash` fence of the descriptor's `## Label guards` section: the guards themselves. */
function labelGuards(): string {
  const section = descriptor.slice(descriptor.indexOf("\n## Label guards\n"));
  const match = /\n```bash\n([\s\S]*?)\n```\n/.exec(section);
  assert.ok(match, "no bash fence under ## Label guards in .ai/trackers/github.md");
  return match[1];
}

// The listing puts `ci-monitoring` first and `-wip` second, then 100,000 filler names: far more
// than a pipe buffer, so the writer is still writing when an early match is found. Mutations are
// recorded in $GH_LOG instead of being sent.
const FAKE_GH = `#!/usr/bin/env bash
case "$*" in
  "api --paginate repos/acme/widgets/labels --jq .[].name")
    printf '%s\\n' ci-monitoring -wip in-progress review
    seq -f 'filler-%g' 1 100000
    printf '%s\\n' risk-low ;;
  "api -X POST repos/acme/widgets/issues/"*) echo "POST \${4#repos/acme/widgets/issues/} \${6#"labels[]="}" >>"$GH_LOG" ;;
  "api -X DELETE repos/acme/widgets/issues/"*) echo "DELETE \${4#repos/acme/widgets/issues/}" >>"$GH_LOG" ;;
  *) echo "fake gh: unexpected arguments: $*" >&2; exit 2 ;;
esac
`;

let dir: string;
let guards: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "cpg-label-guards-"));
  writeFileSync(join(dir, "gh"), FAKE_GH);
  chmodSync(join(dir, "gh"), 0o755);
  guards = join(dir, "guards.sh");
  writeFileSync(guards, labelGuards());
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Runs `script` in bash with `pipefail` after sourcing the guards; returns stdout and the mutation log. */
function run(script: string): { out: string; log: string } {
  const log = join(dir, `gh-${Math.random().toString(36).slice(2)}.log`);
  writeFileSync(log, "");
  const out = execFileSync("bash", ["-c", `set -o pipefail\n. "$GUARDS"\n${script}`], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      GUARDS: guards,
      GH_LOG: log,
      REPO: "acme/widgets",
      LABELS_ENABLED: "true",
      PIPELINE_LABELS: "review qa",
    },
  });
  return { out, log: readFileSync(log, "utf8") };
}

test("label_exists finds a defined label wherever it sits in the listing, every time", () => {
  const { out } = run(`for label in ci-monitoring -wip in-progress risk-low; do
  for attempt in 1 2 3 4 5; do label_exists "$label" && echo "$label found" || echo "$label missing"; done
done`);
  const lines = out.trim().split("\n");
  assert.equal(lines.length, 20);
  assert.deepEqual(
    lines.filter((line) => line.endsWith("missing")),
    [],
  );
});

test("label_exists answers false for a label that is not defined", () => {
  const { out } = run(`label_exists not-a-label && echo found || echo missing
label_exists ci && echo found || echo missing`);
  assert.equal(out, "missing\nmissing\n");
});

test("the mutating guards apply an existing label every time", () => {
  const { out, log } = run(`for attempt in 1 2 3; do
  apply_label ci-monitoring 7
  apply_issue_label in-progress 8
  set_pipeline_label 9 review
done`);
  assert.doesNotMatch(out, /Skipping label/);
  const posts = log.split("\n").filter((line) => line.startsWith("POST "));
  assert.deepEqual(posts, [
    "POST 7/labels ci-monitoring",
    "POST 8/labels in-progress",
    "POST 9/labels review",
    "POST 7/labels ci-monitoring",
    "POST 8/labels in-progress",
    "POST 9/labels review",
    "POST 7/labels ci-monitoring",
    "POST 8/labels in-progress",
    "POST 9/labels review",
  ]);
  // set_pipeline_label removes the competing pipeline label before applying its own.
  assert.match(log, /^DELETE 9\/labels\/qa$/m);
});

test("the mutating guards skip a label that is not defined", () => {
  const { out, log } = run("apply_label not-a-label 7");
  assert.match(out, /Skipping label 'not-a-label'/);
  assert.equal(log, "");
});
