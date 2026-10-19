import { defineConfig } from "vitest/config";

// Integration tests (`npm run test:integration`): an ephemeral app instance in Docker
// (tests/integration/global-setup.ts) driven through a real browser by agent-browser.
// Needs Docker and a browser for agent-browser (`npx agent-browser install`).
export default defineConfig({
  test: {
    name: "integration",
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    // One file at a time: every file signs in as the single built-in admin, and a file that changes
    // the admin's language or theme would otherwise leak into a file running beside it.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
