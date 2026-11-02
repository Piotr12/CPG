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

/**
 * Times something with a high-resolution clock and asserts it stays under a bound. A lower bound (`write-gate.test.ts`)
 * can't fail from a busy runner; `Date.now()` mostly stamps data (`login-throttle.test.ts`), so it doesn't count.
 */
const CLOCK = /performance\.now\(\)|process\.hrtime/;
const UPPER_BOUND = /\.toBeLessThan(OrEqual)?\(|assert\.ok\([^)]*<(?!<)/;
const boundsItsOwnTime = (source: string) => CLOCK.test(source) && UPPER_BOUND.test(source);
/** This file names both patterns, so it would flag itself. */
const SELF = "tests/timing-tests.test.ts";

test("every unit test bounding its own running time is in the timing project, and nothing else is", () => {
  // The timing project runs in Node, so a timing test is a `.test.ts` file; the node project's include.
  const unitTests = globSync(project("node").include, { cwd: repoRoot }).filter((file) => file !== SELF);
  const timed = unitTests.filter((file) => boundsItsOwnTime(readFileSync(path.join(repoRoot, file), "utf8")));
  // The include is the node project's, which leaves the timing tests out only through `exclude`.
  expect(unitTests).toEqual(expect.arrayContaining(TIMING_TESTS));
  expect(timed.toSorted()).toEqual(TIMING_TESTS.toSorted());
});

test("the timing project runs exactly the timing tests, and the node project leaves them out", () => {
  expect(project("timing").include).toEqual(TIMING_TESTS);
  expect(project("node").exclude).toEqual(expect.arrayContaining([...TIMING_TESTS, "**/node_modules/**"]));
});
