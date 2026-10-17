import path from "node:path";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    /** Where the app under test answers, e.g. `http://localhost:55001`. */
    baseUrl: string;
  }
}

const repoRoot = path.resolve(import.meta.dirname, "../..");
const PORT = 3000;
// A cold `docker build` of the app plus Next.js startup; generous so slow CI runners don't flake.
const STARTUP_TIMEOUT_MS = 5 * 60_000;

/**
 * Starts an ephemeral instance of the app for the integration tests: the production Dockerfile,
 * built and run with Testcontainers, with a fresh (empty) data directory, so every run starts
 * from an empty SQLite database that the app migrates on boot. The container is removed after
 * the run (and by Testcontainers' reaper if the run is killed).
 *
 * Set `CPG_BASE_URL` to test an app that is already running (e.g. `npm run dev`) instead.
 */
export default async function setup(project: TestProject) {
  if (process.env.CPG_BASE_URL) {
    project.provide("baseUrl", process.env.CPG_BASE_URL.replace(/\/$/, ""));
    return;
  }

  const image = await GenericContainer.fromDockerfile(repoRoot).build("cpg-integration", {
    deleteOnExit: false,
  });
  const container: StartedTestContainer = await image
    .withExposedPorts(PORT)
    .withWaitStrategy(Wait.forHttp("/up", PORT).forStatusCode(200))
    .withStartupTimeout(STARTUP_TIMEOUT_MS)
    .start();

  project.provide("baseUrl", `http://${container.getHost()}:${container.getMappedPort(PORT)}`);

  return async () => {
    await container.stop();
  };
}
