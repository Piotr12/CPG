import { configDefaults, defineConfig } from "vitest/config";

/**
 * The tests that assert an upper bound on how long the code takes. CI runs them as their own project, on a
 * runner of their own and one file at a time, so the bound measures the code rather than whichever test
 * files the runner schedules beside it (#337). `tests/timing-tests.test.ts` checks that every test file
 * timing itself against an upper bound is listed here.
 */
export const TIMING_TESTS = [
  "packages/core/src/services/mrp/mrp-report-reads.test.ts",
  "packages/core/src/services/mrp/mrp-run-timing.test.ts",
  "packages/core/src/services/reports/demand-review-reads.test.ts",
];

// Unit tests (`npm test`, `npm run test:coverage`). Tests sit next to the code they cover as
// `<name>.test.ts` (Node) or `<name>.test.tsx` (React, rendered in jsdom); repo-wide checks live in
// `tests/`. Integration tests have their own config: vitest.integration.config.ts.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["packages/*/{src,scripts}/**/*.test.ts", "tests/*.test.ts"],
          exclude: [...configDefaults.exclude, ...TIMING_TESTS],
        },
      },
      {
        test: {
          name: "timing",
          environment: "node",
          include: TIMING_TESTS,
        },
      },
      {
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["packages/*/src/**/*.test.tsx"],
          setupFiles: ["tests/setup/dom.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      // Every source file counts, imported by a test or not, so untested files show up as 0%.
      include: ["packages/*/src/**/*.{ts,tsx}", "packages/*/scripts/**/*.ts"],
      exclude: ["**/*.test.{ts,tsx}"],
      // AGENTS.md: every change keeps unit-test coverage at 100%. Don't lower this.
      thresholds: { 100: true },
      reporter: ["text", "html", "json-summary"],
    },
  },
});
