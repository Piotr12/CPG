import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "./instrumentation";

const core = vi.hoisted(() => ({ loadConfig: vi.fn(() => ({ databasePath: "/data/cpg.sqlite" })), migrateDatabase: vi.fn() }));
vi.mock("@cpg/core", () => core);

describe("register", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("migrates the database on the Node.js runtime and logs what it applied", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    core.migrateDatabase.mockResolvedValue(["M1", "M2"]);

    await register();

    expect(core.migrateDatabase).toHaveBeenCalledWith({ databasePath: "/data/cpg.sqlite" });
    expect(console.info).toHaveBeenCalledWith("Applied migrations: M1, M2");
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

    expect(core.migrateDatabase).not.toHaveBeenCalled();
  });
});
