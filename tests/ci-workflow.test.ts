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

// The unit suite took 517 s on main (2026-10-25) and passed 10 minutes on a slower runner, which cancelled
// it mid-run twice on #264 with every test passing. The limit keeps about twice the whole suite's length,
// so one shard still fits if the files split unevenly.
test("the unit-test job's limit leaves room for a slow runner", () => {
  assert.ok((workflow.jobs["unit-tests"]["timeout-minutes"] ?? 360) >= 20);
});

const units = workflow.jobs["unit-tests"];
const merge = workflow.jobs["unit-coverage"] as Job & { needs?: string | string[]; if?: string };
const unitRun = (candidate: Job, command: string) => {
  const step = candidate.steps.find((one) => one.run?.includes(command));
  assert.ok(step, `no step runs ${command}`);
  return step.run!.replace(/\s+/g, " ");
};

// The whole suite on one runner took 8.6 to over 10 minutes (#338).
test("the unit suite runs as numbered shards, each writing a blob of its results and coverage without the threshold", () => {
  const shards = units.strategy?.matrix?.shard ?? [];
  assert.ok(shards.length > 1, "the unit-test job is not sharded");
  assert.deepEqual(shards, shards.map((_, index) => index + 1));
  assert.equal(units.strategy?.["fail-fast"], false);
  const run = unitRun(units, "npm run test:coverage");
  assert.match(run, /--shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\}/);
  // The timing tests run in unit-timing instead.
  assert.match(run, /--project=!timing /);
  // No shard covers every file, so each skips the threshold; the merge enforces it.
  assert.match(run, /--coverage\.thresholds\.100=false/);
  assert.match(run, /--reporter=blob/);
  assert.match(run, /--outputFile\.blob=blob-reports\/blob-\$\{\{ matrix\.shard \}\}\.json/);
});

// Beside the rest of the suite, the MRP timing test's bound measured the runner's other test files too and
// failed on unchanged code (#337). A runner of their own, one file at a time, leaves only the code to measure.
test("the timing tests run on a runner of their own, one file at a time, writing a blob of their results and coverage", () => {
  const timing = workflow.jobs["unit-timing"];
  assert.ok(timing, "no unit-timing job");
  assert.equal(timing.strategy, undefined);
  const run = unitRun(timing, "npm run test:coverage");
  assert.match(run, /--project=timing /);
  assert.match(run, /--no-file-parallelism/);
  assert.match(run, /--coverage\.thresholds\.100=false/);
  assert.match(run, /--reporter=blob/);
  assert.match(run, /--outputFile\.blob=blob-reports\/blob-timing\.json/);
  assert.ok((timing["timeout-minutes"] ?? 360) >= 20);
});

// A skipped job counts as passed, so a merge that only ran after green shards and timing tests would let a red job's
// coverage gap through as "skipped". It runs unless the workflow was cancelled, and a missing blob fails it.
test("unit-coverage merges every shard's blob and the timing tests', and enforces the 100% threshold, even after a red job", () => {
  assert.deepEqual([merge.needs].flat(), ["unit-tests", "unit-timing"]);
  assert.equal(merge.if, "${{ !cancelled() }}");
  const run = unitRun(merge, "npm run test:coverage");
  assert.match(run, /--merge-reports=blob-reports$/);
  assert.doesNotMatch(run, /thresholds/);
});
