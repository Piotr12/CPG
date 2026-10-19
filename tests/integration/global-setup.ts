import path from "node:path";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    /** Where the app under test answers, e.g. `http://localhost:55001`. */
    baseUrl: string;
    /** The built-in admin's password the app under test was started with. */
    adminPassword: string;
    /** The app image the run built, for tests that start their own container; unset with `CPG_BASE_URL`. */
    image: string | undefined;
  }
}

const repoRoot = path.resolve(import.meta.dirname, "../..");
const PORT = 3000;
const IMAGE = "cpg-integration";
// Only for the throwaway test container; long enough for the server's minimum length.
const TEST_ADMIN_PASSWORD = "integration-admin-password";
// A cold `docker build` of the app plus Next.js startup; generous so slow CI runners don't flake.
const STARTUP_TIMEOUT_MS = 5 * 60_000;

/**
 * Starts an ephemeral instance of the app for the integration tests: the production Dockerfile,
 * built and run with Testcontainers, with a fresh (empty) data directory, so every run starts
 * from an empty SQLite database that the app migrates on boot. The container is removed after
 * the run (and by Testcontainers' reaper if the run is killed).
 *
 * Set `CPG_BASE_URL` to test an app that is already running (e.g. `npm run dev`) instead, with
 * `CPG_ADMIN_PASSWORD` set to the password that app was started with.
 */
export default async function setup(project: TestProject) {
  if (process.env.CPG_BASE_URL) {
    project.provide("baseUrl", process.env.CPG_BASE_URL.replace(/\/$/, ""));
    project.provide("adminPassword", process.env.CPG_ADMIN_PASSWORD ?? "");
    project.provide("image", undefined);
    return;
  }

  const image = await GenericContainer.fromDockerfile(repoRoot).build(IMAGE, {
    deleteOnExit: false,
  });
  const container: StartedTestContainer = await image
    .withEnvironment({ CPG_ADMIN_PASSWORD: TEST_ADMIN_PASSWORD })
    .withExposedPorts(PORT)
    .withWaitStrategy(Wait.forHttp("/up", PORT).forStatusCode(200))
    .withStartupTimeout(STARTUP_TIMEOUT_MS)
    .start();

  project.provide("baseUrl", `http://${container.getHost()}:${container.getMappedPort(PORT)}`);
  project.provide("adminPassword", TEST_ADMIN_PASSWORD);
  project.provide("image", IMAGE);

  return async () => {
    await container.stop();
  };
}
