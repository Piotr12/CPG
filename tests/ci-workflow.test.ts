// The CI integration job must not let a slow browser install eat the suite's time (#167): the
// install and the suite each have their own limit, and the job's limit leaves room for both. Before,
// the job had one 20-minute limit, and a slow apt mirror cancelled the suite (and deploys) halfway.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { parse } from "yaml";

type Step = { name?: string; run?: string; "timeout-minutes"?: number };
type Job = { "timeout-minutes"?: number; steps: Step[] };

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
