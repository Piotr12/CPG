// Deploy ships main only (#360). Deploy can be started by hand (workflow_dispatch) on any branch or tag; such a run
// used to check that ref out, run CI on it and `kamal deploy` it. Now its first step fails the run, the deploy job
// checks the ref itself, and a refused run stays out of the production queue.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, test } from "vitest";
import { parse } from "yaml";

type Step = { name?: string; uses?: string; run?: string };
type Job = { needs?: string | string[]; if?: string; uses?: string; steps?: Step[] };
type Workflow = {
  on: Record<string, unknown>;
  concurrency: { group: string; "cancel-in-progress"?: boolean };
  jobs: Record<string, Job>;
};

const source = readFileSync(join(import.meta.dirname, "..", ".github", "workflows", "deploy.yml"), "utf8");
const deploy = parse(source) as Workflow;
const MAIN = "refs/heads/main";

const [firstJobName, firstJob] = Object.entries(deploy.jobs)[0];
const refusal = firstJob.steps?.[0];

test("Deploy runs on a push to main and by hand, and on nothing else", () => {
  assert.deepEqual(Object.keys(deploy.on), ["push", "workflow_dispatch"]);
  assert.deepEqual(deploy.on.push, { branches: ["main"] });
});

test("the first step of the first job refuses the ref, before anything is checked out", () => {
  assert.equal(firstJobName, "spec-copies");
  assert.equal(refusal?.name, "Refuse a ref other than main");
  assert.equal(refusal?.uses, undefined);
  assert.ok(firstJob.steps?.slice(1).some((step) => step.uses?.startsWith("actions/checkout@")));
});

test("every job reaches the deploy only through the first job", () => {
  // Each job but the first needs exactly one earlier job, so a failed first job stops them all.
  assert.equal(deploy.jobs.ci.needs, "spec-copies");
  assert.equal(deploy.jobs.deploy.needs, "ci");
  assert.deepEqual(Object.keys(deploy.jobs), ["spec-copies", "ci", "deploy"]);
});

test("the deploy job runs only on main itself", () => {
  // A job-level `if` without a status function keeps the implied success(), so it still waits for ci.
  assert.equal(deploy.jobs.deploy.if, "github.ref == 'refs/heads/main'");
});

test("only main queues as deploy-production, so a refused run can't cancel a main deploy waiting there", () => {
  assert.equal(
    deploy.concurrency.group,
    "${{ github.ref == 'refs/heads/main' && 'deploy-production' || format('deploy-refused-{0}', github.run_id) }}",
  );
  assert.equal(deploy.concurrency["cancel-in-progress"], false);
});

test("no script pastes the ref in with an expression", () => {
  assert.match(refusal?.run ?? "", /"\$GITHUB_REF"/);
  for (const job of Object.values(deploy.jobs)) {
    for (const step of job.steps ?? []) assert.doesNotMatch(step.run ?? "", /\$\{\{\s*github\.(ref|head_ref)/);
  }
});

// The refusal step itself, run by bash as the runner would, under a given GITHUB_REF.
describe("the refusal step", () => {
  let cwd: string;
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  function run(ref: string) {
    cwd = mkdtempSync(join(tmpdir(), "deploy-ref-"));
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GITHUB_")));
    const result = spawnSync("bash", ["-e", "-c", refusal!.run!], { cwd, env: { ...env, GITHUB_REF: ref }, encoding: "utf8" });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  it("lets main through, silently", () => {
    expect(run(MAIN)).toEqual({ status: 0, stdout: "", stderr: "" });
  });

  it.each(["refs/heads/feature", "refs/heads/main-hotfix", "refs/heads/x/refs/heads/main", "refs/tags/v1", ""])(
    "fails the run on %j, naming the ref",
    (ref) => {
      const result = run(ref);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe(`::error::Deploy ships main only. This run was started on ${ref}; start it on main.\n`);
    },
  );

  it("prints a ref holding shell syntax instead of running it", () => {
    const ref = "refs/heads/x;touch one$(touch two)`touch three`";
    const result = run(ref);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`started on ${ref};`);
    for (const file of ["one", "two", "three"]) expect(existsSync(join(cwd, file))).toBe(false);
  });
});
