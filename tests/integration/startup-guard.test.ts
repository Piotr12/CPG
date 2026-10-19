import { GenericContainer, getContainerRuntimeClient, Wait } from "testcontainers";
import { describe, expect, inject, it } from "vitest";

const image = inject("image");
const GUARD_MESSAGE = "Missing or too short CPG_ADMIN_PASSWORD";
const EXIT_TIMEOUT_MS = 30_000;

// Needs the image global-setup built, so it only runs against a container it starts itself.
describe.skipIf(!image)("starting the app without an admin password", () => {
  it("logs why and exits instead of serving", async () => {
    const container = await new GenericContainer(image!)
      .withWaitStrategy(Wait.forLogMessage(GUARD_MESSAGE))
      .withStartupTimeout(EXIT_TIMEOUT_MS)
      .start();
    const client = await getContainerRuntimeClient();
    const handle = client.container.getById(container.getId());

    const deadline = Date.now() + EXIT_TIMEOUT_MS;
    let state = (await client.container.inspect(handle)).State;
    while (state.Running && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      state = (await client.container.inspect(handle)).State;
    }

    expect(state.Running).toBe(false);
    expect(state.ExitCode).not.toBe(0);
    await container.stop();
  });
});
