// The CI integration job must not let a slow browser install eat the suite's time (#167): the
// install and the suite each have their own limit, and the job's limit leaves room for both. Before,
// the job had one 20-minute limit, and a slow apt mirror cancelled the suite (and deploys) halfway.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { parse } from "yaml";

type Step = { name?: string; run?: string; "timeout-minutes"?: number };
type Job = {
  "timeout-minutes"?: number;
  strategy?: { "fail-fast"?: boolean; matrix?: { shard?: number[] } };
  steps: Step[];
};

const workflow = parse(readFileSync(join(import.meta.dirname, "..", ".github", "workflows", "ci.yml"), "utf8")) as {
  jobs: Record<string, Job>;
};
const job = workflow.jobs["integration-tests"];

/** Checkout, setup-node and `npm ci` take about 40 s; this is their share of the job's limit. */
const SETUP_MINUTES = 5;

function stepRunning(command: string): Step {
  const step = job.steps.find((candidate) => candidate.run?.includes(command));
  assert.ok(step, `no integration-tests step runs ${command}`);
  return step;
}

test("the browser install and the integration suite each have their own time limit", () => {
  assert.equal(typeof stepRunning("agent-browser install")["timeout-minutes"], "number");
  assert.equal(typeof stepRunning("npm run test:integration")["timeout-minutes"], "number");
});

test("the integration job's limit covers setup, the whole browser install and the whole suite", () => {
  const install = stepRunning("agent-browser install")["timeout-minutes"] ?? Infinity;
  const suite = stepRunning("npm run test:integration")["timeout-minutes"] ?? Infinity;
  assert.ok(
    (job["timeout-minutes"] ?? 360) >= SETUP_MINUTES + install + suite,
    `job limit ${job["timeout-minutes"]} min < ${SETUP_MINUTES} + ${install} + ${suite} min`,
  );
});

test("the suite keeps at least the 20 minutes it had before the install got its own limit", () => {
  assert.ok((stepRunning("npm run test:integration")["timeout-minutes"] ?? Infinity) >= 20);
});

// The files run one at a time against one app, so CI splits them across parallel runners instead.
test("the integration suite runs as numbered shards, each running its own slice to the end", () => {
  const shards = job.strategy?.matrix?.shard ?? [];
  assert.ok(shards.length > 1, "the integration job is not sharded");
  assert.deepEqual(shards, shards.map((_, index) => index + 1));
  assert.equal(job.strategy?.["fail-fast"], false);
  // `strategy.job-total` keeps the shard count in one place: the matrix.
  assert.match(stepRunning("npm run test:integration").run!, /--shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\}$/);
});

// `--with-deps` apt-installs fonts from Ubuntu's mirror, which stalled for 9 to over 19 minutes
// (#167, #171); the runner image already has Chrome's libraries.
test("the browser install downloads only Chrome, nothing from apt", () => {
  assert.doesNotMatch(stepRunning("agent-browser install").run!, /--with-deps/);
});
