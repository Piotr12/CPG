// The wiring of #351's guard. spec-copies.yml deletes, on main, the active copy of a spec already implemented or
// archived, and starts Deploy. Deploy skips CI and the deploy for a commit that still holds such a copy. Both run
// scripts/delete-spec-copies.ts, whose behaviour its own test covers.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, test } from "vitest";
import { parse } from "yaml";

type Step = { uses?: string; with?: Record<string, unknown>; run?: string; id?: string };
type Job = {
  needs?: string | string[];
  if?: string;
  uses?: string;
  permissions?: Record<string, string>;
  "timeout-minutes"?: number;
  outputs?: Record<string, string>;
  steps?: Step[];
};
type Workflow = {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  concurrency?: { group: string; "cancel-in-progress"?: boolean };
  jobs: Record<string, Job>;
};

const read = (name: string) => parse(readFileSync(join(import.meta.dirname, "..", ".github", "workflows", name), "utf8")) as Workflow;
const cleanup = read("spec-copies.yml");
const deploy = read("deploy.yml");
const COMMAND = "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/delete-spec-copies.ts .ai/specs";

function stepRunning(job: Job, command: string): Step {
  const step = job.steps?.find((candidate) => candidate.run?.includes(command));
  assert.ok(step, `no step runs ${command}`);
  return step;
}

function assertRunsTheScript(job: Job) {
  assert.ok(job.steps?.some((step) => step.uses?.startsWith("actions/checkout@")));
  assert.ok(job.steps?.some((step) => step.uses?.startsWith("actions/setup-node@") && step.with?.["node-version"] === 24));
  // No `npm ci`: the script imports only node: modules, so the check takes seconds.
  assert.ok(!job.steps?.some((step) => step.run?.includes("npm ci")));
  assert.equal(typeof job["timeout-minutes"], "number");
  assert.match(stepRunning(job, COMMAND).run!, /set -euo pipefail/);
}

test("spec-copies.yml runs on pushes to main only, outside Deploy's queue", () => {
  assert.deepEqual(Object.keys(cleanup.on), ["push"]);
  assert.deepEqual(cleanup.on.push, { branches: ["main"] });
  assert.notEqual(cleanup.concurrency?.group, deploy.concurrency?.group);
  assert.equal(cleanup.concurrency?.["cancel-in-progress"], false);
});

test("spec-copies.yml may push and start workflows, and nothing more", () => {
  assert.deepEqual(cleanup.permissions, { contents: "write", actions: "write" });
  assert.deepEqual(
    Object.values(cleanup.jobs).map((job) => job.permissions),
    Object.values(cleanup.jobs).map(() => undefined),
  );
});

test("spec-copies.yml commits what the script deleted, fast-forwards main and starts Deploy on main", () => {
  const [job] = Object.values(cleanup.jobs);
  assertRunsTheScript(job);
  const run = stepRunning(job, COMMAND).run!;
  const order = ['if [ -z "$removed" ]; then exit 0; fi', "git commit", "git push origin HEAD:refs/heads/main", "gh workflow run deploy.yml --ref main"];
  const positions = order.map((part) => run.indexOf(part));
  assert.ok(!positions.includes(-1), `missing one of ${order.join(", ")}`);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.doesNotMatch(run, /--force|\s-f\s|\+HEAD/);
  // A rejected push ends the run green only when main really moved on; otherwise it fails.
  assert.match(run, /head="\$\(git ls-remote --exit-code origin refs\/heads\/main \| cut -f1\)"/);
  assert.match(run, /\[ -n "\$head" \] && \[ "\$head" != "\$GITHUB_SHA" \] \|\| exit 1/);
});

test("Deploy reads only, and checks for copies before CI", () => {
  assert.deepEqual(deploy.permissions, { contents: "read" });
  for (const job of Object.values(deploy.jobs)) assert.equal(job.permissions, undefined);

  const check = deploy.jobs["spec-copies"];
  assertRunsTheScript(check);
  assert.equal(stepRunning(check, COMMAND).id, "check");
  assert.equal(check.outputs?.copies, "${{ steps.check.outputs.copies }}");
  assert.doesNotMatch(stepRunning(check, COMMAND).run!, /git (commit|push)/);
});

test("Deploy skips CI, and so the deploy, when the commit holds a copy", () => {
  assert.equal(deploy.jobs.ci.needs, "spec-copies");
  assert.equal(deploy.jobs.ci.if, "needs.spec-copies.outputs.copies == ''");
  assert.equal(deploy.jobs.ci.uses, "./.github/workflows/ci.yml");
  assert.equal(deploy.jobs.deploy.needs, "ci");
});

// The steps themselves, run by bash in a clone of a throwaway bare repository with `gh` stubbed, so the push, the
// "main moved on" check, the dispatch and Deploy's skip decision are exercised before they first run on main.
describe("the workflows' steps", () => {
  const COPY = "2026-11-02--1613UTC-root-ranking.md";
  const cleanupRun = stepRunning(Object.values(cleanup.jobs)[0], COMMAND).run!;
  const checkRun = stepRunning(deploy.jobs["spec-copies"], COMMAND).run!;
  // Inherited GIT_DIR or GIT_INDEX_FILE (a test run from a git hook) would point these commits at the real repository.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")));
  let root: string;

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: "pipe" }).trim();

  /** A bare `origin` whose main holds the scripts and `files`, and a clone of it, as checkout leaves the runner. */
  function repository(files: string[]) {
    root = mkdtempSync(join(tmpdir(), "spec-copies-step-"));
    const origin = join(root, "origin.git");
    const clone = join(root, "clone");
    git(root, "init", "--quiet", "--bare", "--initial-branch=main", origin);
    git(root, "clone", "--quiet", origin, clone);
    for (const file of ["scripts/spec-copies.ts", "scripts/delete-spec-copies.ts"]) {
      mkdirSync(join(clone, "scripts"), { recursive: true });
      cpSync(join(import.meta.dirname, "..", file), join(clone, file));
    }
    for (const file of files) {
      mkdirSync(join(clone, ".ai", "specs", file, ".."), { recursive: true });
      writeFileSync(join(clone, ".ai", "specs", file), "# spec\n");
    }
    git(clone, "-c", "user.name=t", "-c", "user.email=t@example.com", "add", ".");
    git(clone, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "--quiet", "-m", "merge");
    git(clone, "push", "--quiet", "origin", "HEAD:refs/heads/main");
    const bin = join(root, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "gh"), `#!/bin/sh\necho "$@" >> "${join(root, "gh.log")}"\n`, { mode: 0o755 });
    return { origin, clone, bin, sha: git(clone, "rev-parse", "HEAD") };
  }

  function step(repo: ReturnType<typeof repository>, run: string) {
    const output = join(root, "github-output");
    writeFileSync(output, "");
    const result = spawnSync("bash", ["-c", run], {
      cwd: repo.clone,
      encoding: "utf8",
      env: { ...env, PATH: `${repo.bin}:${env.PATH}`, GITHUB_SHA: repo.sha, GITHUB_OUTPUT: output, GH_TOKEN: "unused" },
    });
    const dispatched = existsSync(join(root, "gh.log")) ? readFileSync(join(root, "gh.log"), "utf8") : "";
    return {
      status: result.status,
      dispatched,
      mainSubject: git(repo.origin, "log", "-1", "--format=%s", "main"),
      output: readFileSync(output, "utf8"),
    };
  }

  describe("spec-copies.yml's cleanup", () => {
    it("deletes the copy on main in one commit naming it, and starts Deploy on main", () => {
      const repo = repository([COPY, `implemented/${COPY}`]);

      const result = step(repo, cleanupRun);

      expect(result.status).toBe(0);
      expect(result.mainSubject).toBe("docs(specs): delete the active copy of specs already implemented or archived (#351)");
      expect(git(repo.origin, "log", "-1", "--format=%b", "main")).toBe(`.ai/specs/${COPY}`);
      expect(git(repo.origin, "log", "-1", "--format=%an", "main")).toBe("github-actions[bot]");
      expect(git(repo.origin, "ls-tree", "-r", "--name-only", "main", ".ai/specs")).toBe(`.ai/specs/implemented/${COPY}`);
      expect(result.dispatched).toBe("workflow run deploy.yml --ref main\n");
    });

    it("does nothing when main holds no copy", () => {
      const result = step(repository([`implemented/${COPY}`]), cleanupRun);

      expect(result).toMatchObject({ status: 0, dispatched: "", mainSubject: "merge" });
    });

    it("leaves the copy to the newer commit's own run when main moved on", () => {
      const repo = repository([COPY, `implemented/${COPY}`]);
      const other = join(root, "other");
      git(root, "clone", "--quiet", repo.origin, other);
      git(other, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "--quiet", "--allow-empty", "-m", "newer merge");
      git(other, "push", "--quiet", "origin", "HEAD:refs/heads/main");

      expect(step(repo, cleanupRun)).toMatchObject({ status: 0, dispatched: "", mainSubject: "newer merge" });
    });

    it("fails when the push is refused while main is still at the pushed commit", () => {
      const repo = repository([COPY, `implemented/${COPY}`]);
      writeFileSync(join(repo.origin, "hooks", "pre-receive"), "#!/bin/sh\necho protected >&2\nexit 1\n", { mode: 0o755 });

      expect(step(repo, cleanupRun)).toMatchObject({ status: 1, dispatched: "", mainSubject: "merge" });
    });

    it("fails, rather than reading it as moved on, when main can't be read", () => {
      const repo = repository([COPY, `implemented/${COPY}`]);
      git(repo.clone, "remote", "set-url", "origin", join(root, "missing.git"));

      const result = step(repo, cleanupRun);

      expect(result.status).not.toBe(0);
      expect(result).toMatchObject({ dispatched: "", mainSubject: "merge" });
    });
  });

  describe("Deploy's check", () => {
    it("outputs an empty `copies` for a clean commit, so CI runs", () => {
      expect(step(repository([`implemented/${COPY}`]), checkRun)).toMatchObject({ status: 0, output: "copies=\n" });
    });

    it("outputs the copies for a dirty commit, so CI skips, and pushes nothing", () => {
      const result = step(repository([COPY, `implemented/${COPY}`]), checkRun);

      expect(result).toMatchObject({ status: 0, output: `copies=.ai/specs/${COPY} \n`, dispatched: "", mainSubject: "merge" });
    });
  });
});
