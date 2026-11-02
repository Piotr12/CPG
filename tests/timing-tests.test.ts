// A test that bounds how long the code takes measures the runner too when other test files share its CPUs:
// on CI's shared coverage run the MRP timing test went over its bound on unchanged code (#337). Those files
// form the `timing` project, which CI runs on a runner of its own, one file at a time
// (tests/ci-workflow.test.ts), so a new timing test must join it, and only timing tests belong there.
import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import config, { TIMING_TESTS } from "../vitest.config.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

type Project = { test: { name: string; include: string[]; exclude?: string[] } };
const projects = (config.test?.projects ?? []) as Project[];
const project = (name: string) => {
  const found = projects.find((candidate) => candidate.test.name === name);
  expect(found, `no ${name} project`).toBeDefined();
  return found!.test;
};

/** Measures elapsed time and asserts it stays under something. A lower bound (`write-gate.test.ts`) can't fail from a busy runner. */
const boundsItsOwnTime = (source: string) => source.includes("performance.now()") && /\.toBeLessThan\(/.test(source);

test("every unit test bounding its own running time is in the timing project, and nothing else is", () => {
  const unitTests = globSync(["packages/*/{src,scripts}/**/*.test.{ts,tsx}", "tests/*.test.ts"], { cwd: repoRoot });
  const timed = unitTests.filter((file) => boundsItsOwnTime(readFileSync(path.join(repoRoot, file), "utf8")));
  expect(timed.toSorted()).toEqual(TIMING_TESTS.toSorted());
});

test("the timing project runs exactly the timing tests, and the node project leaves them out", () => {
  expect(project("timing").include).toEqual(TIMING_TESTS);
  expect(project("node").exclude).toEqual(expect.arrayContaining([...TIMING_TESTS, "**/node_modules/**"]));
});
