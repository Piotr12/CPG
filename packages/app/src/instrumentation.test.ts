import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "./instrumentation";

const config = { databasePath: "/data/cpg.sqlite" };
const core = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  assertServerConfig: vi.fn(),
  migrateDatabase: vi.fn(),
}));
vi.mock("@cpg/core", () => core);

describe("register", () => {
  beforeEach(() => {
    core.loadConfig.mockReturnValue(config);
    core.assertServerConfig.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("checks the config, then migrates the database and logs what it applied", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    core.migrateDatabase.mockResolvedValue(["M1", "M2"]);

    await register();

    expect(core.assertServerConfig).toHaveBeenCalledWith(config);
    expect(core.migrateDatabase).toHaveBeenCalledWith(config);
    expect(console.info).toHaveBeenCalledWith("Applied migrations: M1, M2");
  });

  it("logs why and exits, without migrating, when the config is not usable", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);
    core.assertServerConfig.mockImplementation(() => {
      throw new Error("Missing or too short CPG_ADMIN_PASSWORD");
    });

    await expect(register()).rejects.toThrow("process.exit");
    expect(console.error).toHaveBeenCalledWith("Missing or too short CPG_ADMIN_PASSWORD");
    expect(exit).toHaveBeenCalledWith(1);
    expect(core.migrateDatabase).not.toHaveBeenCalled();
  });

  it("stays quiet when there was nothing to migrate", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    core.migrateDatabase.mockResolvedValue([]);

    await register();

    expect(core.migrateDatabase).toHaveBeenCalledOnce();
    expect(console.info).not.toHaveBeenCalled();
  });

  it("does nothing on the edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");

    await register();

    expect(core.assertServerConfig).not.toHaveBeenCalled();
    expect(core.migrateDatabase).not.toHaveBeenCalled();
  });
});
