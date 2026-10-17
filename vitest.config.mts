import { defineConfig } from "vitest/config";

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
