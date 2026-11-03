// Deploy ships main only (#360). Deploy can be started by hand (workflow_dispatch) on any branch or tag; such a run
// used to check that ref out, run CI on it and `kamal deploy` it. Now its first step fails the run, the deploy job
// checks the ref itself, and a refused run stays out of the production queue. A branch's own copy of deploy.yml can
// drop all of that, so the deploy secrets live in the production environment, which only main may use (#368).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, test } from "vitest";
import { parse } from "yaml";

type Step = { name?: string; uses?: string; run?: string };
type Job = { needs?: string | string[]; if?: string; uses?: string; environment?: unknown; secrets?: unknown; steps?: Step[] };
type Workflow = {
  on: Record<string, unknown>;
  concurrency: { group: string; "cancel-in-progress"?: boolean };
  jobs: Record<string, Job>;
};

const WORKFLOWS = join(import.meta.dirname, "..", ".github", "workflows");
const source = readFileSync(join(WORKFLOWS, "deploy.yml"), "utf8");
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

test("no other job starts beside the first one", () => {
  // ci needs spec-copies and deploy needs ci (tests/spec-copies-workflows.test.ts), so a failed first job stops both.
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

test("the deploy job runs in the production environment, which holds the deploy secrets", () => {
  assert.equal(deploy.jobs.deploy.environment, "production");
});

// Moving a secret into the environment keeps it from other refs only while every job that reads it names the
// environment. GITHUB_TOKEN is GitHub's per-run token, not a repository secret.
// A string holding any expression counts as a read when it names `secrets` anywhere: an expression's own end can't be
// found reliably (`format('}}', secrets.X)`), and a false alarm only asks for a second look.
function readsSecret(value: unknown): boolean {
  if (typeof value === "string") return value.includes("${{") && /\bsecrets\b(?!\s*\.\s*github_token\b)/i.test(value);
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).some(readsSecret);
}

function secretViolations(file: string, workflow: Workflow): { violations: string[]; bound: string[] } {
  const violations: string[] = [];
  const bound: string[] = [];
  const { jobs, ...rest } = workflow;
  if (readsSecret(rest)) violations.push(`${file}: reads a secret outside its jobs`);
  for (const [name, job] of Object.entries(jobs)) {
    if (job.secrets !== undefined) violations.push(`${file} ${name}: passes secrets to a reusable workflow`);
    // A workflow from another repository, called here, could name production itself and read the secrets on main.
    if (job.uses !== undefined && !job.uses.startsWith("./")) violations.push(`${file} ${name}: calls a workflow outside this repository`);
    if (!readsSecret(job)) continue;
    if (job.environment === "production") bound.push(`${file} ${name}`);
    else violations.push(`${file} ${name}: reads a secret without environment: production`);
  }
  return { violations, bound };
}

test("every job that reads a secret, in every workflow, is bound to production", () => {
  const files = readdirSync(WORKFLOWS).filter((file) => /\.ya?ml$/.test(file));
  const results = files.map((file) => secretViolations(file, parse(readFileSync(join(WORKFLOWS, file), "utf8")) as Workflow));
  assert.deepEqual(results.flatMap((result) => result.violations), []);
  // The scan must find the deploy job's two secrets, or it passes by finding nothing.
  assert.deepEqual(results.flatMap((result) => result.bound), ["deploy.yml deploy"]);
});

describe("the secret scan", () => {
  const workflow = (jobs: Record<string, Job>, rest: Partial<Workflow> & { env?: unknown } = {}) =>
    ({ on: {}, concurrency: { group: "g" }, ...rest, jobs }) as Workflow;
  const step = (run: string): Step[] => [{ run }];

  it.each(["${{ secrets.SSH_PRIVATE_KEY }}", "${{ secrets['SSH_PRIVATE_KEY'] }}", '${{ secrets["X"] }}', "${{ toJSON(secrets) }}", "${{secrets.github_tokens}}", "${{ format('}}', secrets.X) }}", "${{ secrets.GITHUB_TOKEN || SECRETS.X }}"])(
    "flags %s read without the environment",
    (expression) => {
      expect(secretViolations("w.yml", workflow({ build: { steps: step(`echo "${expression}"`) } })).violations).toEqual([
        "w.yml build: reads a secret without environment: production",
      ]);
    },
  );

  it.each(["${{ secrets.GITHUB_TOKEN }}", "${{ secrets . github_token }}", "${{ github.token }}", "echo secrets.X"])("ignores %s", (text) => {
    expect(secretViolations("w.yml", workflow({ build: { steps: step(text) } }))).toEqual({ violations: [], bound: [] });
  });

  it("accepts a secret read in a job bound to production, and no other environment", () => {
    const read = step("echo ${{ secrets.X }}");
    expect(secretViolations("w.yml", workflow({ a: { environment: "production", steps: read }, b: { environment: "staging", steps: read } }))).toEqual({
      violations: ["w.yml b: reads a secret without environment: production"],
      bound: ["w.yml a"],
    });
  });

  it("flags a read anywhere in the job, not only in a step's script", () => {
    const job = (extra: Partial<Job> & Record<string, unknown>) => secretViolations("w.yml", workflow({ build: extra as Job })).violations;
    for (const extra of [{ env: { KEY: "${{ secrets.X }}" } }, { steps: [{ uses: "a/b@v1", with: { key: "${{ secrets.X }}" } }] }]) {
      expect(job(extra)).toEqual(["w.yml build: reads a secret without environment: production"]);
    }
  });

  it("flags a workflow called from another repository, and accepts one from this repository", () => {
    expect(secretViolations("w.yml", workflow({ remote: { uses: "other/repo/.github/workflows/x.yml@v1" }, local: { uses: "./.github/workflows/ci.yml" } }))).toEqual({
      violations: ["w.yml remote: calls a workflow outside this repository"],
      bound: [],
    });
  });

  it("flags secrets passed to a reusable workflow, and secrets read outside the jobs", () => {
    expect(secretViolations("w.yml", workflow({ call: { uses: "./x.yml", secrets: "inherit" } }, { env: { KEY: "${{ secrets.X }}" } })).violations).toEqual([
      "w.yml: reads a secret outside its jobs",
      "w.yml call: passes secrets to a reusable workflow",
    ]);
  });
});

test("no script pastes the ref in with an expression", () => {
  assert.match(refusal?.run ?? "", /"\$GITHUB_REF"/);
  for (const job of Object.values(deploy.jobs)) {
    for (const step of job.steps ?? []) assert.doesNotMatch(step.run ?? "", /\$\{\{[^}]*\bref\b/);
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
